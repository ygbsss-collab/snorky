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

  // Wait for initial load
  await new Promise(r => setTimeout(r, 2000));

  // Dismiss intro
  await send('Runtime.evaluate', {
    expression: `(() => {
      const intro = document.getElementById('snorkyIntro');
      if (intro) intro.style.display = 'none';
    })()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 800));

  // Open today condition detail
  await send('Runtime.evaluate', {
    expression: `(async () => {
      const point = { id: 22, supabaseId: 22, name: '문암해변' };
      if (window.SNORKYTodayConditionDetail && typeof window.SNORKYTodayConditionDetail.open === 'function') {
        await window.SNORKYTodayConditionDetail.open(point);
      }
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 2500));

  // Open Source Sheet
  const sourceOpenRes = await send('Runtime.evaluate', {
    expression: `(() => {
      if (window.SNORKYTodayConditionDetail && typeof window.SNORKYTodayConditionDetail.openSourceSheet === 'function') {
        window.SNORKYTodayConditionDetail.openSourceSheet();
      }
      const sheetBody = document.getElementById('tcSheetBody');
      const overlay = document.getElementById('tcBottomSheetOverlay');
      return {
        open: overlay?.classList.contains('open'),
        title: document.getElementById('tcSheetTitleText')?.textContent?.trim(),
        text: sheetBody?.innerText
      };
    })()`,
    returnByValue: true
  });
  console.log("Source Sheet Info:", JSON.stringify(sourceOpenRes?.result?.value, null, 2));

  // Capture screenshots at multiple mobile viewports
  const viewports = [
    { name: '390', width: 390, height: 844 },
    { name: '360', width: 360, height: 780 },
    { name: '430', width: 430, height: 932 }
  ];

  for (const vp of viewports) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: true
    });
    await new Promise(r => setTimeout(r, 400));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const path = `d:\\SNORK_prototype_v0.1\\source_sheet_open_${vp.name}.png`;
    fs.writeFileSync(path, Buffer.from(shot.data, 'base64'));
    console.log(`Saved: ${path}`);
  }

  ws.close();
  if (chrome) chrome.kill();
  console.log("=== Verification Completed ===");
}

run().catch(console.error);
