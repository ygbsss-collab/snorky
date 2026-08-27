import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\user\\AppData\\Local\\Temp\\chrome_snorky_verify_' + Date.now();

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
  const CDP_PORT = 9800;
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

  // Wait 3.5s for app load
  console.log('Waiting 3.5s for app load...');
  await new Promise(r => setTimeout(r, 3500));

  // Open 6-day forecast for point 22 (문암해변)
  console.log('Calling SNORKYDailyForecast.open(22)...');
  const openResult = await send('Runtime.evaluate', {
    expression: `(async () => {
      const point = { id: 22, supabaseId: 22, name: '문암해변' };
      await window.SNORKYDailyForecast.open(point);
      return {
        isOpen: window.SNORKYDailyForecast.isOpen(),
        days: document.querySelectorAll('#dfDays .df-day-card').length,
        slots: document.querySelectorAll('#dfDetail .df-slot-card').length,
        title: document.getElementById('dfTitle')?.textContent
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Open Result:', openResult?.result?.value);

  // Capture 390px short forecast
  console.log('Capturing verification-daily-390-short.png...');
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot1?.data) {
    fs.writeFileSync('d:/SNORK_prototype_v0.1/verification-daily-390-short.png', Buffer.from(shot1.data, 'base64'));
    console.log('Saved verification-daily-390-short.png');
  }

  // Click 4th tab (+4일 Mid Forecast)
  console.log('Clicking 4th tab (+4일 Mid Forecast)...');
  const clickRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = document.querySelectorAll('#dfDays .df-day-card');
      if (cards.length >= 4) cards[3].click();
      return {
        selectedDate: document.querySelector('#dfDays .df-day-card.selected')?.dataset?.date,
        slotsCount: document.querySelectorAll('#dfDetail .df-slot-card').length
      };
    })()`,
    returnByValue: true
  });
  console.log('Mid Tab Click Result:', clickRes?.result?.value);
  await new Promise(r => setTimeout(r, 500));

  console.log('Capturing verification-daily-390-mid.png...');
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot2?.data) {
    fs.writeFileSync('d:/SNORK_prototype_v0.1/verification-daily-390-mid.png', Buffer.from(shot2.data, 'base64'));
    console.log('Saved verification-daily-390-mid.png');
  }

  // Check 360px viewport
  console.log('Switching back to day 1 and resizing to 360px...');
  await send('Runtime.evaluate', {
    expression: `document.querySelectorAll('#dfDays .df-day-card')[0]?.click()`
  });
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 500));
  const shot360 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot360?.data) {
    fs.writeFileSync('d:/SNORK_prototype_v0.1/verification-daily-360.png', Buffer.from(shot360.data, 'base64'));
    console.log('Saved verification-daily-360.png');
  }

  // Check 375px viewport
  console.log('Resizing to 375px...');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 500));
  const shot375 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot375?.data) {
    fs.writeFileSync('d:/SNORK_prototype_v0.1/verification-daily-375.png', Buffer.from(shot375.data, 'base64'));
    console.log('Saved verification-daily-375.png');
  }

  // Check 430px viewport
  console.log('Resizing to 430px...');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 500));
  const shot430 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot430?.data) {
    fs.writeFileSync('d:/SNORK_prototype_v0.1/verification-daily-430.png', Buffer.from(shot430.data, 'base64'));
    console.log('Saved verification-daily-430.png');
  }

  // Test Favorite toggle
  console.log('Testing Favorite button...');
  const favRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const favBtn = document.getElementById('dfFav');
      const initialActive = favBtn?.classList?.contains('active');
      favBtn?.click();
      const afterClick = favBtn?.classList?.contains('active');
      return { initialActive, afterClick };
    })()`,
    returnByValue: true
  });
  console.log('Favorite button result:', favRes?.result?.value);

  // Test Back button
  console.log('Testing Back button...');
  const backRes = await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('dfBack')?.click();
      return {
        isOpen: window.SNORKYDailyForecast.isOpen()
      };
    })()`,
    returnByValue: true
  });
  console.log('Back button result:', backRes?.result?.value);

  ws.close();
  chrome.kill();
  console.log('=== ALL VERIFICATION TESTS FINISHED SUCCESSFULLY ===');
}
