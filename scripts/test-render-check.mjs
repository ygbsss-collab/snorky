import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\user\\AppData\\Local\\Temp\\chrome_render_check_' + Date.now();

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
  const CDP_PORT = 9700;
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
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
    return new Promise((resolve) => {
      const msgId = id++;
      cbs.set(msgId, resolve);
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

  console.log('Waiting 3s for app init...');
  await new Promise(r => setTimeout(r, 3000));

  // Open 6-day forecast
  console.log('Opening 6-day forecast modal...');
  const openRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const point = { id: 22, supabaseId: 22, name: '문암해변' };
      await window.SNORKYDailyForecast.open(point);
      return {
        isOpen: window.SNORKYDailyForecast.isOpen(),
        modalDisplay: getComputedStyle(document.getElementById('dailyForecastDetailModal')).display,
        modalRect: document.getElementById('dailyForecastDetailModal').getBoundingClientRect(),
        daysCount: document.querySelectorAll('#dfDays .df-day-card').length,
        slotsCount: document.querySelectorAll('#dfDetail .df-slot-card').length,
        firstSlotText: document.querySelector('#dfDetail .df-slot-card')?.innerText?.slice(0, 100)
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Open & Render Result:', openRes?.result?.result?.value);

  // Check mid forecast tab click
  console.log('Clicking +4일 tab...');
  const clickRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = document.querySelectorAll('#dfDays .df-day-card');
      if (cards.length >= 4) {
        cards[3].click();
      }
      return {
        selectedDate: document.querySelector('#dfDays .df-day-card.selected')?.dataset?.date,
        slotsCount: document.querySelectorAll('#dfDetail .df-slot-card').length,
        slots: Array.from(document.querySelectorAll('#dfDetail .df-slot-card')).map(s => s.innerText.slice(0, 80))
      };
    })()`,
    returnByValue: true
  });
  console.log('Mid Tab Result:', clickRes?.result?.result?.value);

  // Take screenshot with Page.captureScreenshot
  console.log('Taking Page.captureScreenshot...');
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: 390, height: 844, scale: 1 }
  });
  if (shot?.result?.data) {
    fs.writeFileSync('d:/SNORK_prototype_v0.1/verification-render-test.png', Buffer.from(shot.result.data, 'base64'));
    console.log('Saved verification-render-test.png (size: ' + shot.result.data.length + ')');
  } else {
    console.log('Screenshot response:', Object.keys(shot || {}));
  }

  ws.close();
  chrome.kill();
  console.log('Done!');
}
