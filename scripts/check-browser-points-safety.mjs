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

  const diag = await send('Runtime.evaluate', {
    expression: `(() => {
      const pts = window.snorkyPoints || [];
      const res = pts.map(p => ({
        id: p.id,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        directCode: p.warningAreaCode || p.warning_area_code,
        resolvedCode: window.SNORKYMarineSafety?.pointAreaCode(p),
        safetyStatus: window.SNORKYMarineSafety?.statusForPoint(p)
      }));

      const safetyState = window.SNORKYMarineSafety?.state;

      return {
        pointsCount: pts.length,
        safetyState,
        points: res.slice(0, 10), // first 10
        munam: res.find(p => p.id === 22 || p.name?.includes('문암'))
      };
    })()`,
    returnByValue: true
  });

  console.log("Points safety diagnostic in browser:", JSON.stringify(diag?.result?.value, null, 2));
  ws.close();
}

main().catch(console.error);
