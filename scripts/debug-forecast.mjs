import http from 'http';
import fs from 'fs';
import { spawn } from 'child_process';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\user\\AppData\\Local\\Temp\\chrome_debug_' + Date.now();

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

async function debugRun() {
  const CDP_PORT = 9399;
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=390,844',
    'http://127.0.0.1:5501/index.html'
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
    if (data.method === 'Runtime.consoleAPICalled') {
      const args = data.params.args.map(a => a.value || a.description).join(' ');
      console.log(`[Browser Console ${data.params.type}]`, args);
    } else if (data.method === 'Runtime.exceptionThrown') {
      console.error(`[Browser Exception]`, data.params.exceptionDetails?.text, data.params.exceptionDetails?.exception?.description);
    }

    if (data.id && cbs.has(data.id)) {
      const cb = cbs.get(data.id);
      cbs.delete(data.id);
      cb(data);
    }
  };

  await new Promise((res) => { ws.onopen = res; });
  await send('Page.enable');
  await send('Runtime.enable');

  console.log('Waiting 3s for page load...');
  await new Promise(r => setTimeout(r, 3000));

  console.log('Checking window globals...');
  const globals = await send('Runtime.evaluate', {
    expression: `({
      hasSNORKYDailyForecast: Boolean(window.SNORKYDailyForecast),
      hasSNORKYEvaluationResults: Boolean(window.SNORKYEvaluationResults),
      hasSupabase: Boolean(window.supabase),
      hasSnorkySupabase: Boolean(window.snorkySupabase),
      modalInDOM: Boolean(document.getElementById('dailyForecastDetailModal'))
    })`,
    returnByValue: true
  });
  console.log('Globals:', globals?.result?.value);

  console.log('Calling window.SNORKYDailyForecast.open({ id: 22, supabaseId: 22, name: "문암해변" })...');
  const openRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const p = { id: 22, supabaseId: 22, name: '문암해변' };
      console.log('Starting open() for point 22');
      await window.SNORKYDailyForecast.open(p);
      console.log('Finished open()');
      return {
        isOpen: window.SNORKYDailyForecast.isOpen(),
        modalDisplay: getComputedStyle(document.getElementById('dailyForecastDetailModal')).display,
        daysCount: document.querySelectorAll('#dfDays .df-day-card').length,
        slotsCount: document.querySelectorAll('#dfDetail .df-slot-card').length,
        daysHtml: document.getElementById('dfDays')?.innerHTML?.slice(0, 300),
        detailHtml: document.getElementById('dfDetail')?.innerHTML?.slice(0, 300)
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Open Result:', openRes?.result?.value);

  // Click tab 4 (+4일 Mid)
  console.log('Clicking 4th tab...');
  const clickRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = document.querySelectorAll('#dfDays .df-day-card');
      if (cards.length >= 4) cards[3].click();
      return {
        selectedDate: document.querySelector('#dfDays .df-day-card.selected')?.dataset?.date,
        slotsCount: document.querySelectorAll('#dfDetail .df-slot-card').length,
        detailHtml: document.getElementById('dfDetail')?.innerHTML?.slice(0, 300)
      };
    })()`,
    returnByValue: true
  });
  console.log('Mid Tab Click Result:', clickRes?.result?.value);

  ws.close();
  chrome.kill();
  process.exit(0);
}

debugRun().catch(e => {
  console.error('Debug error:', e);
  process.exit(1);
});
