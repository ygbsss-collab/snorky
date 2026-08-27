import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\user\\AppData\\Local\\Temp\\chrome_debug_' + Date.now();

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
  const CDP_PORT = 9447;
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1200,900',
    `http://127.0.0.1:${PORT}/index.html`
  ], { stdio: 'ignore' });

  for (let i = 0; i < 30; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${CDP_PORT}/json`, (r) => {
          let str = '';
          r.on('data', c => str += c);
          r.on('end', () => res(JSON.parse(str)));
        }).on('error', rej);
      });
      if (data && data[0]) {
        const ws = new WebSocket(data[0].webSocketDebuggerUrl);
        let msgId = 1;
        const send = (method, params = {}) => new Promise((resolve) => {
          const id = msgId++;
          const handler = (evt) => {
            const parsed = JSON.parse(evt.data);
            if (parsed.id === id) {
              ws.removeEventListener('message', handler);
              resolve(parsed.result);
            }
          };
          ws.addEventListener('message', handler);
          ws.send(JSON.stringify({ id, method, params }));
        });

        ws.onopen = async () => {
          ws.addEventListener('message', (evt) => {
            const parsed = JSON.parse(evt.data);
            if (parsed.method === 'Runtime.consoleAPICalled') {
              console.log('[CONSOLE]', parsed.params.type, parsed.params.args.map(a => a.value ?? a.description).join(' '));
            }
            if (parsed.method === 'Runtime.exceptionThrown') {
              console.log('[EXCEPTION]', parsed.params.exceptionDetails);
            }
          });

          await send('Runtime.enable');
          await send('Page.enable');

          console.log('Waiting 3s for initial page load...');
          await new Promise(r => setTimeout(r, 3000));

          console.log('Evaluating window state...');
          const evalRes = await send('Runtime.evaluate', {
            expression: `({
              hasSupabase: Boolean(window.snorkySupabase || window.supabase),
              hasReader: Boolean(window.SNORKYEvaluationResults),
              hasDailyForecast: Boolean(window.SNORKYDailyForecast),
              spotsCount: Object.values(window.locations || {}).flat().length
            })`,
            returnByValue: true
          });
          console.log('Window State:', evalRes?.result?.value);

          console.log('Calling window.SNORKYDailyForecast.open directly...');
          const openRes = await send('Runtime.evaluate', {
            expression: `(async () => {
              try {
                const pt = { id: 22, supabaseId: 22, name: '문암해변' };
                await window.SNORKYDailyForecast.open(pt);
                return {
                  success: true,
                  isOpen: window.SNORKYDailyForecast.isOpen(),
                  days: document.querySelectorAll('#dfDays .df-day-card').length,
                  slots: document.querySelectorAll('#dfDetail .df-slot-card').length,
                  html: document.getElementById('dailyForecastDetailModal')?.outerHTML?.slice(0, 500)
                };
              } catch (e) {
                return { success: false, error: e.message, stack: e.stack };
              }
            })()`,
            awaitPromise: true,
            returnByValue: true
          });
          console.log('Open Result:', openRes?.result?.value);

          // Take screenshot
          const shot = await send('Page.captureScreenshot', { format: 'png' });
          if (shot?.data) {
            fs.writeFileSync('d:/SNORK_prototype_v0.1/test-daily-render.png', Buffer.from(shot.data, 'base64'));
            console.log('Saved test-daily-render.png');
          }

          ws.close();
          chrome.kill();
          server.close();
          process.exit(0);
        };
        break;
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
});
