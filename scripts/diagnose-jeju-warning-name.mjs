import http from 'http';
import fs from 'fs';

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
  const wsUrl = await getWsUrl();
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
    expression: `(async () => {
      const pt = (window.SNORKY_ACTIVE_POINTS || []).find(p => p.name === "제주test");
      const safety = window.SNORKYMarineSafety;
      const safetyStatusObj = safety ? safety.getSafetyStatus() : null;
      const pointSafety = safety ? safety.statusForPoint(pt) : null;

      // Check evaluation_results from reader
      const reader = window.SNORKYEvaluationResults;
      let hourlyResults = null;
      if (reader && reader.loadTodayHourly) {
        hourlyResults = await reader.loadTodayHourly(pt.id, true);
      }

      return JSON.stringify({
        point: {
          id: pt?.id,
          name: pt?.name,
          warningAreaCode: pt?.warningAreaCode,
          lat: pt?.lat,
          lng: pt?.lng
        },
        safetyCacheStatus: safetyStatusObj?.status,
        safetyCacheActiveWarnings: (safetyStatusObj?.warnings || []).filter(w => w.active),
        pointSafety: pointSafety,
        hourlyResultV12: hourlyResults?.[0] ? {
          condition_status: hourlyResults[0].condition_status,
          condition_score: hourlyResults[0].condition_score,
          safety: hourlyResults[0].safety,
          safety_reasons: hourlyResults[0].safety_reasons,
          metrics: hourlyResults[0].metrics
        } : null
      });
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("=== 제주test 진단 결과 ===");
  console.log(JSON.stringify(JSON.parse(res.result.value), null, 2));

  ws.close();
}

main().catch(console.error);
