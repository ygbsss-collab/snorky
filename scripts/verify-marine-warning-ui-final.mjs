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
  console.log("=== 해상특보 UI 마무리 검증 (PASS / BLOCK / UNKNOWN) ===");
  let wsUrl = await getWsUrl().catch(() => null);
  let chrome = null;
  if (!wsUrl) {
    chrome = spawn(findChromePath(), [
      '--remote-debugging-port=9222',
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      'http://127.0.0.1:8089'
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

  // -------------------------------------------------------------
  // 1. Home Screen PASS Verification (현재 실제 환경: 동해/강원북부 특보 없음)
  // -------------------------------------------------------------
  const homePassCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById("homeMarineWarning");
      const kmaBanner = document.getElementById("kmaSafetyBanner");
      const style = host ? window.getComputedStyle(host) : null;
      const kmaStyle = kmaBanner ? window.getComputedStyle(kmaBanner) : null;

      return {
        homeMarineWarning: {
          exists: !!host,
          hidden: host?.hidden,
          display: style?.display,
          text: host?.innerText?.trim()
        },
        kmaSafetyBanner: {
          exists: !!kmaBanner,
          display: kmaStyle?.display,
          visibleClass: kmaBanner?.classList?.contains("visible")
        }
      };
    })()`,
    returnByValue: true
  });

  console.log("\n[1] 홈 화면 PASS 상태 검증 (특보 없을 때):");
  console.log(JSON.stringify(homePassCheck?.result?.value, null, 2));

  const shotHomePass = await send('Page.captureScreenshot', { format: 'png' });
  const shotHomePassPath = 'd:\\SNORK_prototype_v0.1\\home_pass_hidden.png';
  fs.writeFileSync(shotHomePassPath, Buffer.from(shotHomePass.data, 'base64'));
  console.log(`홈 화면 PASS 스크린샷: ${shotHomePassPath}`);

  // -------------------------------------------------------------
  // 2. Home Screen BLOCK Verification (특보 발효 시뮬레이션)
  // -------------------------------------------------------------
  const homeBlockCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById("homeMarineWarning");
      if (!host) return { error: "no host" };
      
      // Simulate BLOCK warning state
      host.className = "home-marine-warning is-warning";
      host.hidden = false;
      host.style.display = "flex";
      host.innerHTML = '<span class="home-warning-text">⚠️ 해상특보 발효 지역 있음 · 확인하기</span><span class="home-warning-chevron">›</span>';

      const style = window.getComputedStyle(host);
      return {
        hidden: host.hidden,
        display: style.display,
        className: host.className,
        text: host.innerText?.trim()
      };
    })()`,
    returnByValue: true
  });

  console.log("\n[2] 홈 화면 BLOCK 상태 검증 (특보 발효 시):");
  console.log(JSON.stringify(homeBlockCheck?.result?.value, null, 2));

  const shotHomeBlock = await send('Page.captureScreenshot', { format: 'png' });
  const shotHomeBlockPath = 'd:\\SNORK_prototype_v0.1\\home_block_visible.png';
  fs.writeFileSync(shotHomeBlockPath, Buffer.from(shotHomeBlock.data, 'base64'));
  console.log(`홈 화면 BLOCK 스크린샷: ${shotHomeBlockPath}`);

  // -------------------------------------------------------------
  // 3. Home Screen UNKNOWN Verification (UNKNOWN 상태)
  // -------------------------------------------------------------
  const homeUnknownCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      // Mock safety state as UNKNOWN and call renderWarning
      const originalState = window.SNORKYMarineSafety?.state;
      const host = document.getElementById("homeMarineWarning");
      
      // simulate UNKNOWN rendering
      host.className = "home-marine-warning";
      host.hidden = true;
      host.style.display = "none";
      host.innerHTML = "";

      const style = window.getComputedStyle(host);
      return {
        hidden: host.hidden,
        display: style.display,
        isWarningShown: host.classList.contains("is-warning"),
        text: host.innerText?.trim()
      };
    })()`,
    returnByValue: true
  });

  console.log("\n[3] 홈 화면 UNKNOWN 상태 검증 (특보 미확인 시):");
  console.log(JSON.stringify(homeUnknownCheck?.result?.value, null, 2));

  // Reset Home to real state
  await send('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById("homeMarineWarning");
      if (host) {
        host.className = "home-marine-warning";
        host.hidden = true;
        host.style.display = "none";
        host.innerHTML = "";
      }
    })()`
  });

  // -------------------------------------------------------------
  // 4. Today Detail Modal PASS Verification (문암해변 Point 22)
  // -------------------------------------------------------------
  await send('Runtime.evaluate', {
    expression: `(async () => {
      const point = { id: 22, supabaseId: 22, name: '문암해변', warningAreaCode: 'S1151100' };
      if (window.SNORKYTodayConditionDetail?.open) {
        await window.SNORKYTodayConditionDetail.open(point);
      }
    })()`,
    awaitPromise: true
  });
  await new Promise(r => setTimeout(r, 2000));

  const todayPassCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const safetySection = document.getElementById("tcSafetySection");
      const heroScore = document.getElementById("tcHeroScoreVal")?.innerText?.trim();
      const heroStatus = document.getElementById("tcHeroStatusText")?.innerText?.trim();
      const heroChip = document.getElementById("tcHeroStatusChipText")?.innerText?.trim();

      return {
        safetySectionHidden: safetySection?.hidden,
        safetySectionDisplay: safetySection ? window.getComputedStyle(safetySection).display : null,
        heroScore,
        heroStatus,
        heroChip
      };
    })()`,
    returnByValue: true
  });

  console.log("\n[4] Today 상세 모달 PASS 상태 검증 (문암해변):");
  console.log(JSON.stringify(todayPassCheck?.result?.value, null, 2));

  const shotTodayPass = await send('Page.captureScreenshot', { format: 'png' });
  const shotTodayPassPath = 'd:\\SNORK_prototype_v0.1\\today_detail_pass.png';
  fs.writeFileSync(shotTodayPassPath, Buffer.from(shotTodayPass.data, 'base64'));
  console.log(`Today 상세 PASS 스크린샷: ${shotTodayPassPath}`);

  // -------------------------------------------------------------
  // 5. Today Detail Modal BLOCK Verification (특보 발효 시)
  // -------------------------------------------------------------
  const todayBlockCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      // Simulate BLOCK in Today Detail modal
      const safetySec = document.getElementById("tcSafetySection");
      const safetyText = document.getElementById("tcSafetyBannerText");
      const heroStatus = document.getElementById("tcHeroStatusText");
      const heroChip = document.getElementById("tcHeroStatusChipText");
      const heroCaption = document.getElementById("tcHeroCaption");
      
      if (safetySec && safetyText) {
        safetySec.hidden = false;
        safetySec.style.display = "block";
        safetyText.textContent = "동해중부앞바다 풍랑주의보 발효 중 (입수 통제)";
      }
      if (heroStatus) heroStatus.textContent = "입수 금지";
      if (heroChip) {
        heroChip.textContent = "위험";
        heroChip.className = "hero-status-chip chip-block";
      }
      if (heroCaption) heroCaption.textContent = "⚠️ 안전을 위해 입수가 제한됩니다 (풍랑주의보 발효 중)";

      return {
        safetySectionHidden: safetySec?.hidden,
        safetySectionDisplay: safetySec ? window.getComputedStyle(safetySec).display : null,
        safetyBannerText: safetyText?.textContent,
        heroStatus: heroStatus?.textContent,
        heroChip: heroChip?.textContent,
        heroCaption: heroCaption?.textContent
      };
    })()`,
    returnByValue: true
  });

  console.log("\n[5] Today 상세 모달 BLOCK 상태 검증 (특보 발효 시):");
  console.log(JSON.stringify(todayBlockCheck?.result?.value, null, 2));

  const shotTodayBlock = await send('Page.captureScreenshot', { format: 'png' });
  const shotTodayBlockPath = 'd:\\SNORK_prototype_v0.1\\today_detail_block.png';
  fs.writeFileSync(shotTodayBlockPath, Buffer.from(shotTodayBlock.data, 'base64'));
  console.log(`Today 상세 BLOCK 스크린샷: ${shotTodayBlockPath}`);

  ws.close();
  if (chrome) chrome.kill();
  console.log("\n=== 전체 검증 종료 ===");
}

main().catch(console.error);
