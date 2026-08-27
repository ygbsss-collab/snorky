import fs from 'fs';
import http from 'http';
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
  console.log("=== 브라우저 21시 야간 Recommendation 및 12시 주간 대조 검증 시작 ===");
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

  // Open today condition detail modal for Munam
  const openRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const point = { id: 22, supabaseId: 22, name: '문암해변' };
      if (window.SNORKYTodayConditionDetail && typeof window.SNORKYTodayConditionDetail.open === 'function') {
        await window.SNORKYTodayConditionDetail.open(point);
        return { opened: window.SNORKYTodayConditionDetail.isOpen() };
      }
      return { opened: false };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log("Modal Open:", openRes?.result?.value);
  await new Promise(r => setTimeout(r, 3000));

  // 1. Check 21:00 slot
  const slot21 = await send('Runtime.evaluate', {
    expression: `(() => {
      const card21 = document.querySelector('[data-tc-hour="21"]');
      if (card21) card21.click();

      const heroScore = document.getElementById('tcHeroScoreVal')?.innerText?.trim();
      const heroStatus = document.getElementById('tcHeroStatusText')?.innerText?.trim();
      const heroChip = document.getElementById('tcHeroStatusChipText')?.innerText?.trim();
      const heroChipClass = document.getElementById('tcHeroStatusChip')?.className;
      const heroCaption = document.getElementById('tcHeroCaption')?.innerText?.trim();

      const visVal = document.getElementById('tcMetricVal_vis')?.innerText?.trim();
      const visPill = document.getElementById('tcMetricPill_vis')?.innerText?.trim();

      return {
        hour: 21,
        heroScore,
        heroStatus,
        heroChip,
        heroChipClass,
        heroCaption,
        visVal,
        visPill
      };
    })()`,
    returnByValue: true
  });

  console.log("\n[1] 21시 슬롯 검증 결과:");
  console.log(JSON.stringify(slot21?.result?.value, null, 2));

  // Screenshot of 21:00 slot
  await new Promise(r => setTimeout(r, 500));
  const shot21 = await send('Page.captureScreenshot', { format: 'png' });
  const shot21Path = 'd:\\SNORK_prototype_v0.1\\slot21_final_390.png';
  fs.writeFileSync(shot21Path, Buffer.from(shot21.data, 'base64'));
  console.log(`21시 스크린샷 저장 완료: ${shot21Path}`);

  // 2. Check 12:00 slot (Daytime control)
  const slot12 = await send('Runtime.evaluate', {
    expression: `(() => {
      const card12 = document.querySelector('[data-tc-hour="12"]');
      if (card12) card12.click();

      const heroScore = document.getElementById('tcHeroScoreVal')?.innerText?.trim();
      const heroStatus = document.getElementById('tcHeroStatusText')?.innerText?.trim();
      const heroChip = document.getElementById('tcHeroStatusChipText')?.innerText?.trim();
      const heroChipClass = document.getElementById('tcHeroStatusChip')?.className;
      const heroCaption = document.getElementById('tcHeroCaption')?.innerText?.trim();

      const visVal = document.getElementById('tcMetricVal_vis')?.innerText?.trim();
      const visPill = document.getElementById('tcMetricPill_vis')?.innerText?.trim();

      return {
        hour: 12,
        heroScore,
        heroStatus,
        heroChip,
        heroChipClass,
        heroCaption,
        visVal,
        visPill
      };
    })()`,
    returnByValue: true
  });

  console.log("\n[2] 12시 주간 슬롯 대조 검증 결과:");
  console.log(JSON.stringify(slot12?.result?.value, null, 2));

  ws.close();
  if (chrome) chrome.kill();
  console.log("\n=== 모든 브라우저 실시간 검증 완료 ===");
}

main().catch(console.error);
