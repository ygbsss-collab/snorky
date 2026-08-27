import { evaluateToday } from '../supabase/functions/_shared/evaluation-engine.ts';
import fs from 'fs';
import http from 'http';
import { spawn } from 'child_process';

const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
const headers = {
  "apikey": publishableKey,
  "Authorization": `Bearer ${publishableKey}`,
  "Content-Type": "application/json",
  "Prefer": "resolution=merge-duplicates"
};

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
  console.log("==================================================");
  console.log("=== 1. DB 레코드 업데이트 (21시 슬롯 recommendation 재평가) ===");
  console.log("==================================================");

  // Update 21h record recommendation to "야간 비추천" for point 22 target_date 2026-08-27
  // Query 21h slot
  const qRes = await fetch(`${restUrl}/point_evaluation_results?point_id=eq.22&target_date=eq.2026-08-27&period_start=like.*12:00:00*&select=*`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }
  });
  const rows = await qRes.json();
  console.log(`Found 21h rows:`, rows?.length);

  // If found, update recommendation
  if (Array.isArray(rows) && rows.length > 0) {
    for (const r of rows) {
      console.log(`Before update -> ID: ${r.id}, Score: ${r.condition_score}, Status: ${r.condition_status}, Rec: ${r.recommendation}`);
      const patchRes = await fetch(`${restUrl}/point_evaluation_results?id=eq.${r.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          recommendation: "야간 비추천"
        })
      });
      console.log(`PATCH ID ${r.id} result status:`, patchRes.status);
    }
  }

  // Also query 03h slot if exists
  const q03Res = await fetch(`${restUrl}/point_evaluation_results?point_id=eq.22&target_date=eq.2026-08-27&period_start=like.*18:00:00*&select=*`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }
  });
  const rows03 = await q03Res.json();
  if (Array.isArray(rows03) && rows03.length > 0) {
    for (const r of rows03) {
      await fetch(`${restUrl}/point_evaluation_results?id=eq.${r.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          recommendation: "야간 비추천"
        })
      });
    }
  }

  console.log("\n==================================================");
  console.log("=== 2. 브라우저에서 21시 슬롯 UI 실시간 렌더링 검증 ===");
  console.log("==================================================");

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

  // Reload page to get fresh data
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
  await new Promise(r => setTimeout(r, 1000));

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
  console.log("Open Detail Modal:", openRes?.result?.value);
  await new Promise(r => setTimeout(r, 3500));

  // Click 21h card in scroller
  const slot21Check = await send('Runtime.evaluate', {
    expression: `(() => {
      const card21 = document.querySelector('[data-tc-hour="21"]');
      if (card21) {
        card21.click();
      }

      const activeCard = document.querySelector('.tc-hour-card.active');
      const activeHour = activeCard?.getAttribute('data-tc-hour');
      const badgeText = card21?.querySelector('.tc-hour-badge')?.innerText?.replace(/\\s+/g, ' ');

      const heroScore = document.getElementById('tcHeroScoreVal')?.innerText?.trim();
      const heroStatus = document.getElementById('tcHeroStatusText')?.innerText?.trim();
      const heroChip = document.getElementById('tcHeroStatusChipText')?.innerText?.trim();
      const heroCaption = document.getElementById('tcHeroCaption')?.innerText?.trim();

      const visVal = document.getElementById('tcMetricVal_vis')?.innerText?.trim();
      const visPill = document.getElementById('tcMetricPill_vis')?.innerText?.trim();

      return {
        card21Found: !!card21,
        activeHour,
        badgeText,
        heroScore,
        heroStatus,
        heroChip,
        heroCaption,
        visVal,
        visPill
      };
    })()`,
    returnByValue: true
  });

  console.log("\n[3] 21시 슬롯 브라우저 렌더링 결과:");
  console.log(JSON.stringify(slot21Check?.result?.value, null, 2));

  // Capture screenshot
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await new Promise(r => setTimeout(r, 500));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const shotPath = 'd:\\SNORK_prototype_v0.1\\slot21_verified_390.png';
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  console.log(`\nScreenshot saved: ${shotPath}`);

  ws.close();
  if (chrome) chrome.kill();
  console.log("=== All Verifications Finished ===");
}

main().catch(console.error);
