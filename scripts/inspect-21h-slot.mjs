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
          const page = list.find(p => p.type === 'page' && p.url.includes('8089')) || list.find(p => p.type === 'page');
          resolve(page ? page.webSocketDebuggerUrl : null);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function run() {
  let chrome = null;
  let wsUrl = await getWsUrl().catch(() => null);
  if (!wsUrl) {
    const chromePath = findChromePath();
    chrome = spawn(chromePath, [
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

  // Navigate or check
  const checkRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      // Look up point and evaluation data in JS scope
      const res = {};
      
      // Check for detail reader data or evaluated data
      if (window.SnorkyDetailReader) {
        res.hasDetailReader = true;
      }
      if (window.SnorkyEval) {
        res.hasSnorkyEval = true;
      }

      // Check current point info
      const pointEl = document.querySelector('.tc-spot-title, #tcPointName, .tc-hero-title, [data-point-id]');
      res.pointText = pointEl?.textContent?.trim();

      // Check all timeline / forecast slot cards on page
      const slots = Array.from(document.querySelectorAll('.tc-timeline-card, .tc-timeline-item, .time-slot, .forecast-slot, [data-hour], .tc-day-slot')).map(el => ({
        text: el.innerText.replace(/\\n+/g, ' | ')
      }));
      res.slots = slots;

      // Check main page body text for 21시
      res.bodyTextIncludes21 = document.body.innerText.includes('21');
      res.bodyText = document.body.innerText;

      return res;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Check Result:", JSON.stringify(checkRes?.result?.value, null, 2));

  ws.close();
  if (chrome) chrome.kill();
}

run().catch(console.error);
