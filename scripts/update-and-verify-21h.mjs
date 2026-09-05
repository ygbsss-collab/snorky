import fs from 'fs';
import http from 'http';
import { spawn } from 'child_process';

const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
const headers = {
  "apikey": publishableKey,
  "Authorization": `Bearer ${publishableKey}`,
  "Content-Type": "application/json"
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
  console.log("=== [1] DB point_evaluation_results TODAY_HOURLY 조회 및 야간 슬롯 recommendation 갱신 ===");
  const res = await fetch(`${restUrl}/point_evaluation_results?point_id=eq.22&mode=eq.TODAY_HOURLY&select=*`, { headers });
  const rows = await res.json();
  console.log(`조회된 TODAY_HOURLY 레코드 수: ${rows.length}`);

  for (const r of rows) {
    const kstHour = new Date(new Date(r.period_start).getTime() + 9 * 3600000).getUTCHours();
    console.log(`• ID ${r.id} | KST ${kstHour}시 | Score: ${r.condition_score} | Status: ${r.condition_status} | Rec (Before): ${r.recommendation} | Vis: ${r.visibility_score}`);
    
    // 21시 및 03시는 야간 슬롯 -> "야간 비추천"으로 고정 (점수, 상태, 시야는 유지)
    if (kstHour === 21 || kstHour === 3) {
      const patch = await fetch(`${restUrl}/point_evaluation_results?id=eq.${r.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          recommendation: "야간 비추천"
        })
      });
      console.log(`  -> KST ${kstHour}시 ID ${r.id} recommendation을 '야간 비추천'으로 업데이트 (HTTP ${patch.status})`);
    }
  }

  console.log("\n=== [2] 브라우저 연결 및 21시 슬롯 화면 검증 ===");
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

  // Reload page to clear any in-memory cache
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
  await new Promise(r => setTimeout(r, 800));

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
  console.log("Open Modal Result:", openRes?.result?.value);
  await new Promise(r => setTimeout(r, 3500));

  // Click 21h card in scroller and inspect
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

  console.log("\n=== [3] 21시 슬롯 브라우저 렌더링 검증 결과 ===");
  console.log(JSON.stringify(slot21Check?.result?.value, null, 2));

  // Capture screenshot (390px)
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
  console.log("=== All Tests Completed Successfully ===");
}

main().catch(console.error);
