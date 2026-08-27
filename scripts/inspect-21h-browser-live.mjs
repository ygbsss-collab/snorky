import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

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

async function run() {
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
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      const handler = (event) => {
        const res = JSON.parse(event.data);
        if (res.id === msgId) {
          ws.removeEventListener('message', handler);
          resolve(res.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  await new Promise(r => ws.onopen = r);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  // Wait for page initial rendering
  await new Promise(r => setTimeout(r, 2000));

  // Dismiss intro if present
  await send('Runtime.evaluate', {
    expression: `(() => {
      const intro = document.getElementById('snorkyIntro');
      if (intro) intro.style.display = 'none';
    })()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 1000));

  // Open today condition detail modal
  const openRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const point = { id: 22, supabaseId: 22, name: '문암해변' };
      if (window.SNORKYTodayConditionDetail && typeof window.SNORKYTodayConditionDetail.open === 'function') {
        await window.SNORKYTodayConditionDetail.open(point);
        return { opened: window.SNORKYTodayConditionDetail.isOpen() };
      }
      return { opened: false, hasObj: !!window.SNORKYTodayConditionDetail };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log("Open result:", openRes?.result?.value);
  await new Promise(r => setTimeout(r, 3500));

  // Find all cards in hourly scroller
  const allCards = await send('Runtime.evaluate', {
    expression: `(() => {
      return Array.from(document.querySelectorAll('.tc-hour-card')).map(c => ({
        hour: c.dataset.tcHour,
        badge: c.querySelector('.tc-hour-badge')?.innerText?.replace(/\\s+/g, ' '),
        temp: c.querySelector('.tc-hour-temp')?.innerText,
        rain: c.querySelector('.tc-hour-rain')?.innerText
      }));
    })()`,
    returnByValue: true
  });
  console.log("All Hourly Cards:", JSON.stringify(allCards?.result?.value, null, 2));

  // Click 21h slot in hourly scroller
  const slot21Info = await send('Runtime.evaluate', {
    expression: `(() => {
      const card21 = document.querySelector('[data-tc-hour="21"]');
      const badgeText = card21?.querySelector('.tc-hour-badge')?.innerText?.replace(/\\s+/g, ' ');
      const rainText = card21?.querySelector('.tc-hour-rain')?.innerText;
      
      if (card21) {
        card21.click();
      }

      const heroScore = document.getElementById('tcHeroScoreVal')?.innerText;
      const heroStatus = document.getElementById('tcHeroStatusText')?.innerText;
      const heroChip = document.getElementById('tcHeroStatusChipText')?.innerText;
      const heroCaption = document.getElementById('tcHeroCaption')?.innerText;
      const visVal = document.getElementById('tcMetricVal_vis')?.innerText;
      const visPill = document.getElementById('tcMetricPill_vis')?.innerText;

      // Active hour card data
      const activeCard = document.querySelector('.tc-hour-card.active');
      const activeHour = activeCard?.getAttribute('data-tc-hour');

      return {
        card21Found: !!card21,
        card21BadgeText: badgeText,
        card21RainText: rainText,
        activeHour,
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

  console.log("21h Slot Live Browser Inspection:", JSON.stringify(slot21Info?.result?.value, null, 2));

  // Capture screenshot of 21h selected
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await new Promise(r => setTimeout(r, 400));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('d:\\SNORK_prototype_v0.1\\slot21_selected_390.png', Buffer.from(shot.data, 'base64'));
  console.log("Screenshot saved to: d:\\SNORK_prototype_v0.1\\slot21_selected_390.png");

  ws.close();
  if (chrome) chrome.kill();
}

run().catch(console.error);
