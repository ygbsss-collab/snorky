import http from 'http';

import fs from 'fs';
import { spawn } from 'child_process';

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

async function main() {
  let wsUrl = await getWsUrl().catch(() => null);
  let chrome = null;
  if (!wsUrl) {
    chrome = spawn(findChromePath(), [
      '--remote-debugging-port=9222',
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      'http://127.0.0.1:5501'
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

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      // 1. Check window.SNORKYTodayConditionDetail data
      const modal = document.getElementById('todayConditionDetailModal');
      const card21 = document.querySelector('[data-tc-hour="21"]');
      
      // trigger click
      if (card21) card21.click();

      // Read active hour row from todayRows if accessible, or DOM
      return {
        card21Found: !!card21,
        heroScore: document.getElementById('tcHeroScoreVal')?.innerText?.trim(),
        heroStatus: document.getElementById('tcHeroStatusText')?.innerText?.trim(),
        heroChip: document.getElementById('tcHeroStatusChipText')?.innerText?.trim(),
        heroCaption: document.getElementById('tcHeroCaption')?.innerText?.trim(),
        // Evaluation results from window.SNORKYEvaluationResults
      };
    })()`,
    returnByValue: true
  });

  console.log("Debug result:", JSON.stringify(res?.result?.value, null, 2));

  // Also query reader directly in browser
  const readerRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const reader = window.SNORKYEvaluationResults;
      if (reader && reader.loadTodayHourly) {
        const hourly = await reader.loadTodayHourly(22, true);
        return hourly.map(h => ({
          period_start: h.period_start,
          score: h.condition_score,
          status: h.condition_status,
          recommendation: h.recommendation,
          metrics: h.metrics
        }));
      }
      return null;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Reader direct query result:", JSON.stringify(readerRes?.result?.value, null, 2));

  ws.close();
}

main().catch(console.error);
