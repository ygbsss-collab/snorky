import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\user\\AppData\\Local\\Temp\\chrome_fast_shot_' + Date.now();

const PORT = 8089;
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join('d:\\SNORK_prototype_v0.1', reqPath);
  
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, async () => {
  console.log(`Server started on http://127.0.0.1:${PORT}`);
  try {
    await run();
  } catch (e) {
    console.error('Fatal error:', e);
  } finally {
    server.close();
    process.exit(0);
  }
});

async function waitPort(port) {
  for (let i = 0; i < 30; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${port}/json`, (r) => {
          let str = '';
          r.on('data', c => str += c);
          r.on('end', () => res(JSON.parse(str)));
        }).on('error', rej);
      });
      return data;
    } catch (e) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw new Error(`Port ${port} not ready`);
}

async function run() {
  const CDP_PORT = 9888;
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-sandbox',
    '--window-size=390,844',
    `http://127.0.0.1:${PORT}/index.html`
  ], { stdio: 'ignore' });

  const tabs = await waitPort(CDP_PORT);
  const pageTab = tabs.find(t => t.type === 'page') || tabs[0];
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);

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

  await new Promise((res) => { ws.onopen = res; });
  console.log('Connected to CDP');

  await send('Page.enable');
  await send('Runtime.enable');

  await new Promise(r => setTimeout(r, 3000));

  // Open 6-day forecast
  console.log('Calling open()...');
  await send('Runtime.evaluate', {
    expression: `(async () => {
      const point = { id: 22, supabaseId: 22, name: '문암해변' };
      await window.SNORKYDailyForecast.open(point);
    })()`,
    awaitPromise: true
  });

  // Check DOM
  const domInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const header = document.querySelector('#dailyForecastDetailModal .snorky-detail-header')?.innerText;
      const days = Array.from(document.querySelectorAll('#dfDays .df-day-card')).map(d => d.innerText.replace(/\\n/g, ' '));
      const firstSlot = document.querySelector('#dfDetail .df-slot-card')?.innerText;
      return { header, days, firstSlot };
    })()`,
    returnByValue: true
  });
  console.log('DOM Info:', JSON.stringify(domInfo?.result?.value, null, 2));

  // Test click +4일 tab
  console.log('Clicking 4th tab (+4일)...');
  const midDomInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      document.querySelectorAll('#dfDays .df-day-card')[3]?.click();
      const badge = document.querySelector('#dfDetail .df-detail-badge')?.innerText;
      const heading = document.querySelector('#dfDetail .df-section-heading')?.innerText;
      const slots = Array.from(document.querySelectorAll('#dfDetail .df-slot-card')).map(s => s.innerText.replace(/\\n/g, ' '));
      return { badge, heading, slots };
    })()`,
    returnByValue: true
  });
  console.log('Mid DOM Info:', JSON.stringify(midDomInfo?.result?.value, null, 2));

  // Test back button
  console.log('Clicking Back button...');
  const backTest = await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('dfBack')?.click();
      return {
        isOpen: window.SNORKYDailyForecast.isOpen()
      };
    })()`,
    returnByValue: true
  });
  console.log('Back Button Test:', JSON.stringify(backTest?.result?.value, null, 2));

  ws.close();
  chrome.kill();
  console.log('SUCCESS!');
}
