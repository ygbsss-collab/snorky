import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\user\\AppData\\Local\\Temp\\chrome_stitch_' + Date.now();

const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9333',
  `--user-data-dir=${userDataDir}`,
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1600,1200',
  'https://stitch.withgoogle.com/projects/5550177983917219663?node-id=aadf47b6d4874a7e810e14cd40f31a77'
], {
  stdio: 'ignore'
});

console.log('Spawned Chrome with PID:', chrome.pid);

async function waitPort() {
  for (let i = 0; i < 30; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get('http://127.0.0.1:9333/json', (r) => {
          let str = '';
          r.on('data', c => str += c);
          r.on('end', () => res(JSON.parse(str)));
        }).on('error', rej);
      });
      return data;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error('Port 9333 not ready');
}

async function main() {
  const tabs = await waitPort();
  console.log('Tabs count:', tabs.length);
  const pageTab = tabs.find(t => t.type === 'page') || tabs[0];
  console.log('Page tab:', pageTab);

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
      cb(data.result);
    }
  };

  ws.onopen = async () => {
    console.log('Connected to debugger WebSocket');
    await send('Page.enable');
    await send('Runtime.enable');

    console.log('Waiting 12 seconds for Stitch to fully load...');
    await new Promise(r => setTimeout(r, 12000));

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    if (shot && shot.data) {
      fs.writeFileSync('d:/SNORK_prototype_v0.1/stitch_screen.png', Buffer.from(shot.data, 'base64'));
      console.log('Saved stitch_screen.png');
    }

    const evalRes = await send('Runtime.evaluate', {
      expression: `(() => {
        return {
          title: document.title,
          url: window.location.href,
          allText: document.body.innerText.slice(0, 3000),
          elements: Array.from(document.querySelectorAll('*')).map(el => el.tagName).slice(0, 50)
        };
      })()`,
      returnByValue: true
    });
    console.log('Eval Result:', evalRes?.result?.value);

    ws.close();
    chrome.kill();
    process.exit(0);
  };
}

main().catch(err => {
  console.error('Error:', err);
  chrome.kill();
  process.exit(1);
});
