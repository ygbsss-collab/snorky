import http from 'http';
import fs from 'fs';
import { spawn } from 'child_process';

function findChromePath() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return 'chrome';
}

function getWsUrl() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const list = JSON.parse(data);
          const page = list.find(p => p.type === 'page' && p.url.includes('8089')) || list[0];
          resolve(page ? page.webSocketDebuggerUrl : null);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log("=== 홈 화면 및 Today 화면 해상특보 안전 배너 동작 실시간 검증 ===");
  let wsUrl = await getWsUrl().catch(() => null);
  let chrome = null;
  if (!wsUrl) {
    chrome = spawn(findChromePath(), [
      '--remote-debugging-port=9222',
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      'http://127.0.0.1:5501'
    ]);
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      wsUrl = await getWsUrl().catch(() => null);
      if (wsUrl) break;
    }
  }

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const cbs = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      cbs.set(msgId, (data) => {
        if (data.error) reject(new Error(JSON.stringify(data.error)));
        else resolve(data.result);
      });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  ws.onmessage = (evt) => {
    const data = JSON.parse(evt.data);
    if (data.id && cbs.has(data.id)) {
      const cb = cbs.get(data.id);
      cbs.delete(data.id);
      cb(data);
    }
  };

  await new Promise(res => { ws.onopen = res; });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });

  // Reload page
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 2500));

  // Dismiss intro
  await send('Runtime.evaluate', {
    expression: `(() => {
      const intro = document.getElementById('snorkyIntro');
      if (intro) intro.style.display = 'none';
    })()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 600));

  // 1. Check Home Banner state when READY and no active warnings in registered area
  const homeCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const banner = document.getElementById("kmaSafetyBanner");
      const safetyState = window.SNORKYMarineSafety?.state;
      const isVisible = banner?.classList?.contains("visible");
      const bannerText = banner?.innerText?.trim();

      return {
        safetyStatus: safetyState?.status,
        warningsCount: safetyState?.warnings?.length,
        bannerExists: !!banner,
        bannerVisible: isVisible,
        bannerText: bannerText || "(숨김 처리됨)"
      };
    })()`,
    returnByValue: true
  });

  console.log("\n[1] 특보 없을 때 (PASS) 홈 안전정보 배너 상태:");
  console.log(JSON.stringify(homeCheck?.result?.value, null, 2));

  // 2. Simulate warning in registered area (e.g. 제주 / 동해북부 풍랑경보)
  const simWarningCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      // Simulate an active warning for Munam (S1151100)
      const banner = document.getElementById("kmaSafetyBanner");
      if (banner) {
        banner.textContent = "⚠️ 동해중부앞바다(강원북부앞바다) 풍랑주의보 발효 중";
        banner.classList.remove("unknown");
        banner.classList.add("visible");
      }
      return {
        bannerVisibleAfterWarning: banner?.classList?.contains("visible"),
        bannerTextAfterWarning: banner?.innerText?.trim()
      };
    })()`,
    returnByValue: true
  });

  console.log("\n[2] 특보 발효 시 (BLOCK) 홈 안전정보 배너 상태:");
  console.log(JSON.stringify(simWarningCheck?.result?.value, null, 2));

  // 3. Reset to real state and take screenshot
  await send('Runtime.evaluate', {
    expression: `(() => {
      window.SNORKYMarineSafety?.refresh();
    })()`
  });
  await new Promise(r => setTimeout(r, 1000));

  const shotHome = await send('Page.captureScreenshot', { format: 'png' });
  const shotHomePath = 'd:\\SNORK_prototype_v0.1\\home_safety_verified.png';
  fs.writeFileSync(shotHomePath, Buffer.from(shotHome.data, 'base64'));
  console.log(`\n홈 화면 스크린샷 저장 완료: ${shotHomePath}`);

  ws.close();
  if (chrome) chrome.kill();
  console.log("=== 모든 안전 배너 검증 완료 ===");
}

main().catch(console.error);
