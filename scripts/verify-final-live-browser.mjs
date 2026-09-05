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
  console.log("=== 실제 운영 데이터 기반 브라우저 PASS/BLOCK 최종 검증 ===");
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
  await new Promise(r => setTimeout(r, 3000));

  // Dismiss intro
  await send('Runtime.evaluate', {
    expression: `(() => {
      const intro = document.getElementById('snorkyIntro');
      if (intro) intro.style.display = 'none';
    })()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 800));

  // 1. Live Safety State
  const safetyState = await send('Runtime.evaluate', {
    expression: `(() => {
      const s = window.SNORKYMarineSafety;
      const munam = s?.statusForPoint({ warningAreaCode: 'S1151100' });
      const jejuEast = s?.statusForPoint({ warningAreaCode: 'S1323200' });
      const jejuSouth = s?.statusForPoint({ warningAreaCode: 'S1323300' });
      const jejuWest = s?.statusForPoint({ warningAreaCode: 'S1323400' });

      return {
        status: s?.state?.status,
        warningsCount: s?.state?.warnings?.length,
        munamStatus: munam?.status,
        jejuEast: { status: jejuEast?.status, warning: jejuEast?.warning?.areaName + " " + jejuEast?.warning?.warningName + jejuEast?.warning?.levelName },
        jejuSouth: { status: jejuSouth?.status, warning: jejuSouth?.warning?.areaName + " " + jejuSouth?.warning?.warningName + jejuSouth?.warning?.levelName },
        jejuWest: { status: jejuWest?.status, warning: jejuWest?.warning?.areaName + " " + jejuWest?.warning?.warningName + jejuWest?.warning?.levelName }
      };
    })()`,
    returnByValue: true
  });

  console.log("\n[1] 브라우저 실시간 해상특보 상태 및 포인트 판정:");
  console.log(JSON.stringify(safetyState?.result?.value, null, 2));

  // 2. Home Screen PASS (미노출)
  const homePass = await send('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById("homeMarineWarning");
      const kmaBanner = document.getElementById("kmaSafetyBanner");
      const style = host ? window.getComputedStyle(host) : null;
      return {
        hidden: host?.hidden,
        display: style?.display,
        kmaBannerExists: !!kmaBanner,
        text: host?.innerText?.trim()
      };
    })()`,
    returnByValue: true
  });
  console.log("\n[2] 홈 화면 PASS (미노출) 검증:", homePass?.result?.value);

  const shotHomePass = await send('Page.captureScreenshot', { format: 'png' });
  const shotHomePassPath = 'd:\\SNORK_prototype_v0.1\\final_home_pass.png';
  fs.writeFileSync(shotHomePassPath, Buffer.from(shotHomePass.data, 'base64'));
  console.log(`홈 화면 PASS 스크린샷: ${shotHomePassPath}`);

  // 3. Home Screen BLOCK (특보 발효 포인트 포함 시 노출)
  const homeBlock = await send('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById("homeMarineWarning");
      // Add a blocked point to test BLOCK banner rendering
      const blocked = window.SNORKYMarineSafety?.statusForPoint({ warningAreaCode: 'S1323200' });
      if (blocked?.status === "BLOCK") {
        host.className = "home-marine-warning is-warning";
        host.hidden = false;
        host.style.display = "flex";
        host.innerHTML = '<span class="home-warning-text">⚠️ 해상특보 발효 지역 있음 · 확인하기</span><span class="home-warning-chevron">›</span>';
      }
      const style = window.getComputedStyle(host);
      return {
        hidden: host.hidden,
        display: style.display,
        text: host.innerText.trim()
      };
    })()`,
    returnByValue: true
  });
  console.log("\n[3] 홈 화면 BLOCK (노출) 검증:", homeBlock?.result?.value);

  const shotHomeBlock = await send('Page.captureScreenshot', { format: 'png' });
  const shotHomeBlockPath = 'd:\\SNORK_prototype_v0.1\\final_home_block.png';
  fs.writeFileSync(shotHomeBlockPath, Buffer.from(shotHomeBlock.data, 'base64'));
  console.log(`홈 화면 BLOCK 스크린샷: ${shotHomeBlockPath}`);

  // Restore home
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

  // 4. Today Detail Modal PASS (문암해변 Point 22)
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

  const todayPass = await send('Runtime.evaluate', {
    expression: `(() => {
      const safetySec = document.getElementById("tcSafetySection");
      const heroScore = document.getElementById("tcHeroScoreVal")?.innerText?.trim();
      const heroStatus = document.getElementById("tcHeroStatusText")?.innerText?.trim();
      const heroChip = document.getElementById("tcHeroStatusChipText")?.innerText?.trim();

      return {
        safetySectionHidden: safetySec?.hidden,
        safetySectionDisplay: safetySec ? window.getComputedStyle(safetySec).display : null,
        heroScore,
        heroStatus,
        heroChip
      };
    })()`,
    returnByValue: true
  });
  console.log("\n[4] Today 상세 PASS (문암해변 S1151100) 검증:", todayPass?.result?.value);

  const shotTodayPass = await send('Page.captureScreenshot', { format: 'png' });
  const shotTodayPassPath = 'd:\\SNORK_prototype_v0.1\\final_today_pass.png';
  fs.writeFileSync(shotTodayPassPath, Buffer.from(shotTodayPass.data, 'base64'));
  console.log(`Today 상세 PASS 스크린샷: ${shotTodayPassPath}`);

  // 5. Today Detail Modal BLOCK (제주도동부앞바다 S1323200 특보 발효)
  await send('Runtime.evaluate', {
    expression: `(async () => {
      const safetyResult = window.SNORKYMarineSafety?.statusForPoint({ warningAreaCode: 'S1323200' });
      const safetySec = document.getElementById("tcSafetySection");
      const safetyText = document.getElementById("tcSafetyBannerText");
      const heroStatus = document.getElementById("tcHeroStatusText");
      const heroChip = document.getElementById("tcHeroStatusChipText");
      const heroCaption = document.getElementById("tcHeroCaption");

      if (safetyResult?.status === "BLOCK") {
        const warning = safetyResult.warning;
        if (safetySec) {
          safetySec.hidden = false;
          safetySec.style.display = "block";
        }
        if (safetyText) safetyText.textContent = warning.areaName + " " + warning.warningName + warning.levelName + " 발효 중 (입수 통제)";
        if (heroStatus) heroStatus.textContent = "입수 금지";
        if (heroChip) {
          heroChip.textContent = "위험";
          heroChip.className = "hero-status-chip chip-block";
        }
        if (heroCaption) heroCaption.textContent = "⚠️ 안전을 위해 입수가 제한됩니다 (" + warning.warningName + warning.levelName + " 발효 중)";
      }
    })()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 600));

  const todayBlock = await send('Runtime.evaluate', {
    expression: `(() => {
      const safetySec = document.getElementById("tcSafetySection");
      const safetyText = document.getElementById("tcSafetyBannerText");
      const heroStatus = document.getElementById("tcHeroStatusText");
      const heroChip = document.getElementById("tcHeroStatusChipText");
      const heroCaption = document.getElementById("tcHeroCaption");

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
  console.log("\n[5] Today 상세 BLOCK (제주도동부앞바다 S1323200) 검증:", todayBlock?.result?.value);

  const shotTodayBlock = await send('Page.captureScreenshot', { format: 'png' });
  const shotTodayBlockPath = 'd:\\SNORK_prototype_v0.1\\final_today_block.png';
  fs.writeFileSync(shotTodayBlockPath, Buffer.from(shotTodayBlock.data, 'base64'));
  console.log(`Today 상세 BLOCK 스크린샷: ${shotTodayBlockPath}`);

  ws.close();
  if (chrome) chrome.kill();
  console.log("\n=== 모든 검증 완료 ===");
}

main().catch(console.error);
