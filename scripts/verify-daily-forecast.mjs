import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\user\\AppData\\Local\\Temp\\chrome_test_' + Date.now();

const PORT = 8089;
const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/' || !reqPath) reqPath = '/index.html';
  const cleanPath = reqPath.replace(/^\/+/, '').replace(/\//g, path.sep);
  const filePath = path.join('d:\\SNORK_prototype_v0.1', cleanPath);
  
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404);
    res.end('Not found: ' + filePath);
  }
});

server.listen(PORT, async () => {
  console.log(`Test server running on http://127.0.0.1:${PORT}`);
  runBrowserTests().catch(err => {
    console.error('Test error:', err);
    server.close();
    process.exit(1);
  });
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
      await new Promise(r => setTimeout(r, 400));
    }
  }
  throw new Error(`Port ${port} not ready`);
}

async function runBrowserTests() {
  const CDP_PORT = 9446;
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1200,900',
    `http://127.0.0.1:${PORT}/index.html?testDaily=22`
  ], { stdio: 'ignore' });

  const tabs = await waitPort(CDP_PORT);
  const pageTab = tabs.find(t => t.type === 'page') || tabs[0];
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
  
  let id = 1;
  const cbs = new Map();
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      cbs.set(msgId, (res, err) => {
        if (err) reject(err);
        else resolve(res);
      });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  ws.onmessage = (evt) => {
    const data = JSON.parse(evt.data);
    if (data.id && cbs.has(data.id)) {
      const cb = cbs.get(data.id);
      cbs.delete(data.id);
      if (data.error) {
        cb(null, new Error(JSON.stringify(data.error)));
      } else {
        cb(data.result, null);
      }
    }
  };

  await new Promise((res) => { ws.onopen = res; });
  console.log('Connected to CDP debugger');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });

  console.log('Waiting for testDaily=22 modal to render in DOM...');
  for (let i = 0; i < 30; i++) {
    const res = await send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('#dfDays .df-day-card') && (document.querySelector('#dfDetail .df-time-card') || document.querySelector('#dfDetail .df-mid-card') || document.querySelector('#dfDetail .df-empty-card')))`,
      returnByValue: true
    });
    if (res?.result?.value === true) {
      console.log('Modal is fully rendered with day cards!');
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Evaluate Short forecast summary
  const info = await send('Runtime.evaluate', {
    expression: `(() => {
      const title = document.getElementById('dfTitle')?.textContent;
      const dayCards = Array.from(document.querySelectorAll('#dfDays .df-day-card')).map(c => ({
        label: c.querySelector('.df-day-label')?.textContent?.trim(),
        score: c.querySelector('.df-day-score-big')?.textContent?.trim(),
        pill: c.querySelector('.df-day-pill')?.textContent?.trim(),
        isSelected: c.classList.contains('selected')
      }));
      const timeCards = Array.from(document.querySelectorAll('#dfDetail .df-time-card')).map(s => ({
        time: s.querySelector('.df-time-label')?.textContent?.trim(),
        aux: s.querySelector('.df-time-aux')?.textContent?.trim(),
        pill: s.querySelector('.df-time-pill')?.textContent?.trim(),
        isSelected: s.classList.contains('selected')
      }));
      const bentoCards = Array.from(document.querySelectorAll('#dfDetail .df-bento-card')).map(b => ({
        label: b.querySelector('.df-bento-label')?.textContent?.trim(),
        value: b.querySelector('.df-bento-value')?.textContent?.trim(),
        unit: b.querySelector('.df-bento-unit')?.textContent?.trim(),
        pill: b.querySelector('.df-bento-pill')?.textContent?.trim()
      }));
      return { title, daysCount: dayCards.length, dayCards, timeCardsCount: timeCards.length, timeCards, bentoCount: bentoCards.length, bento: bentoCards.slice(0, 4) };
    })()`,
    returnByValue: true
  });
  console.log('Short Forecast Details:', JSON.stringify(info?.result?.value, null, 2));

  // 1. Capture 390px short forecast
  console.log('Capturing 390px Short Forecast...');
  const shot390 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('d:/SNORK_prototype_v0.1/verification-daily-390-short.png', Buffer.from(shot390.data, 'base64'));

  // 2. Click +4th day (Mid forecast)
  console.log('Clicking on +4일 (Mid forecast) tab...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = document.querySelectorAll('#dfDays .df-day-card');
      if (cards.length >= 4) cards[3].click();
    })()`
  });
  await new Promise(r => setTimeout(r, 600));

  const midInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const isMid = document.querySelector('#dfDetail .df-badge-mid') !== null;
      const slots = Array.from(document.querySelectorAll('#dfDetail .df-slot-card')).map(s => ({
        period: s.querySelector('.df-slot-time')?.textContent?.trim(),
        score: s.querySelector('.df-score-num')?.textContent?.trim(),
        status: s.querySelector('.df-slot-status')?.textContent?.trim(),
        metrics: Array.from(s.querySelectorAll('.df-metric-item')).map(m => m.textContent?.trim())
      }));
      return { isMid, slotsCount: slots.length, slots };
    })()`,
    returnByValue: true
  });
  console.log('Mid Forecast Details:', JSON.stringify(midInfo?.result?.value, null, 2));

  console.log('Capturing 390px Mid Forecast...');
  const shot390Mid = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('d:/SNORK_prototype_v0.1/verification-daily-390-mid.png', Buffer.from(shot390Mid.data, 'base64'));

  // 3. Test 360px viewport
  console.log('Capturing 360px viewport...');
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 400));
  const shot360 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('d:/SNORK_prototype_v0.1/verification-daily-360.png', Buffer.from(shot360.data, 'base64'));

  // 4. Test 375px viewport
  console.log('Capturing 375px viewport...');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 400));
  const shot375 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('d:/SNORK_prototype_v0.1/verification-daily-375.png', Buffer.from(shot375.data, 'base64'));

  // 5. Test 430px viewport
  console.log('Capturing 430px viewport...');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 400));
  const shot430 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('d:/SNORK_prototype_v0.1/verification-daily-430.png', Buffer.from(shot430.data, 'base64'));

  // 6. Test favorite button
  console.log('Testing Favorite button interaction...');
  const favRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const favBtn = document.getElementById('dfFav');
      const before = favBtn?.classList?.contains('active');
      favBtn?.click();
      const after = favBtn?.classList?.contains('active');
      return { before, after };
    })()`,
    returnByValue: true
  });
  console.log('Favorite button toggle:', favRes?.result?.value);

  // 7. Test back button
  console.log('Testing Back button interaction...');
  const backRes = await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('dfBack')?.click();
      return {
        isDailyOpen: window.SNORKYDailyForecast?.isOpen?.()
      };
    })()`,
    returnByValue: true
  });
  console.log('Back button result:', backRes?.result?.value);

  ws.close();
  chrome.kill();
  server.close();
  console.log('=== ALL 6-DAY DAILY FORECAST VERIFICATIONS COMPLETE ===');
  process.exit(0);
}
