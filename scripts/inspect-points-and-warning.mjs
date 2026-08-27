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

  const result = await send('Runtime.evaluate', {
    expression: `(() => {
      const points = window.SNORKY_ACTIVE_POINTS || [];
      const safety = window.SNORKYMarineSafety;
      const pointSummary = points.map(p => ({
        id: p.supabaseId || p.id,
        name: p.name,
        region: p.region,
        warningAreaCode: p.warningAreaCode,
        safetyStatus: safety?.statusForPoint(p)?.status
      }));

      const regions = window.SNORKY_SUPABASE_REGIONS || [];

      return {
        regions: regions.map(r => ({ name: r.name, warningAreaCode: r.warningAreaCode })),
        totalPoints: points.length,
        pointsGroupedByRegion: points.reduce((acc, p) => {
          acc[p.region] = (acc[p.region] || 0) + 1;
          return acc;
        }, {}),
        allPointsDetail: pointSummary
      };
    })()`,
    returnByValue: true
  });

  console.log("=== 브라우저 내 실제 데이터 상세 ===");
  console.log(JSON.stringify(result?.result?.value, null, 2));

  ws.close();
}

main().catch(console.error);
