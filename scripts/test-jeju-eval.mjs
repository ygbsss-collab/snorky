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

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        const jejuPoint = {
          id: 101,
          supabaseId: 101,
          name: '제주남쪽(중문)',
          region: '제주',
          lat: 33.245,
          lng: 126.412,
          warningAreaCode: 'S1323300'
        };

        const safety = window.SNORKYMarineSafety;
        const jejuSafety = safety?.statusForPoint(jejuPoint);

        // Add to active points
        window.SNORKY_ACTIVE_POINTS = [...(window.SNORKY_ACTIVE_POINTS || []), jejuPoint];

        // Trigger renderWarning
        const host = document.getElementById("homeMarineWarning");
        const allPoints = getAllActivePoints();
        const blockedPoints = allPoints.filter(p => window.SNORKYMarineSafety?.statusForPoint(p)?.status === "BLOCK");

        if (blockedPoints.length > 0) {
          host.className = "home-marine-warning is-warning";
          host.hidden = false;
          host.style.display = "flex";
          host.innerHTML = '<span class="home-warning-text">⚠️ 일부 포인트에 해상특보가 발효 중입니다 · 확인하기</span><span class="home-warning-chevron">›</span>';
          host.onclick = () => {
            if (typeof openWarningPointsOnMap === 'function') openWarningPointsOnMap();
          };
        }

        const style = window.getComputedStyle(host);
        return {
          jejuSafety,
          blockedPointsCount: blockedPoints.length,
          blockedNames: blockedPoints.map(p => p.name),
          bannerHidden: host.hidden,
          bannerDisplay: style.display,
          bannerText: host.innerText.trim()
        };
      } catch (e) {
        return { error: e.message, stack: e.stack };
      }
    })()`,
    returnByValue: true
  });

  console.log("Evaluation Result:", JSON.stringify(res?.result?.value, null, 2));
  ws.close();
}

main().catch(console.error);
