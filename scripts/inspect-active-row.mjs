import http from 'http';

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

  const evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      // Find todayRows in page
      const reader = window.SNORKYEvaluationResults;
      const card21 = document.querySelector('[data-tc-hour="21"]');
      if (card21) card21.click();

      // Read active hour row from todayRows in memory
      let row21 = null;
      if (window._todayRowsDebug) {
        row21 = window._todayRowsDebug.find(r => r.hour === 21);
      }

      // Check current DOM text
      const heroChipText = document.getElementById("tcHeroStatusChipText")?.textContent;
      const heroCaption = document.getElementById("tcHeroCaption")?.textContent;
      const heroStatus = document.getElementById("tcHeroStatusText")?.textContent;
      const heroScore = document.getElementById("tcHeroScoreVal")?.textContent;

      return {
        heroScore,
        heroStatus,
        heroChipText,
        heroCaption,
        // Let's check window.SNORKYEvaluationResults loaded data
      };
    })()`,
    returnByValue: true
  });

  console.log("DOM text:", JSON.stringify(evalRes?.result?.value, null, 2));

  // Let's check what window.SNORKYEvaluationResults.loadTodayHourly(22) returns in the browser right now
  const readerData = await send('Runtime.evaluate', {
    expression: `(async () => {
      const rows = await window.SNORKYEvaluationResults.loadTodayHourly(22, true);
      const row21 = rows.find(r => {
        const kstHour = new Date(new Date(r.period_start).getTime() + 9 * 3600000).getUTCHours();
        return kstHour === 21;
      });
      return {
        rowsLength: rows.length,
        row21: {
          id: row21?.id,
          period_start: row21?.period_start,
          score: row21?.condition_score,
          status: row21?.condition_status,
          rec: row21?.recommendation,
          visScore: row21?.visibility_score,
          visGrade: row21?.visibility_grade
        }
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Reader data in browser:", JSON.stringify(readerData?.result?.value, null, 2));
  ws.close();
}

main().catch(console.error);
