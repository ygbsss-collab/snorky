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

  // Navigate to home
  await send('Page.navigate', { url: 'http://127.0.0.1:5501/index.html' });
  await new Promise(r => setTimeout(r, 2000));

  // Dismiss intro
  await send('Runtime.evaluate', {
    expression: `(() => {
      const intro = document.getElementById('snorkyIntro');
      if (intro) intro.style.display = 'none';
      if (typeof window.dismissIntro === 'function') window.dismissIntro();
    })()`
  });
  await new Promise(r => setTimeout(r, 2000));

  const bannerRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const banner = document.getElementById("homeMarineWarning");
      const bannerText = document.getElementById("homeMarineWarningText");
      const style = banner ? window.getComputedStyle(banner) : null;
      const pts = window.SNORKY_ACTIVE_POINTS || [];
      const safety = window.SNORKYMarineSafety;
      
      const blockPts = pts.filter(p => safety && safety.statusForPoint(p).status === "BLOCK");
      const passPts = pts.filter(p => safety && safety.statusForPoint(p).status === "PASS");

      return {
        totalPoints: pts.length,
        blockCount: blockPts.length,
        passCount: passPts.length,
        blockedList: blockPts.map(p => ({ name: p.name, region: p.regionName || p.region, code: p.warningAreaCode })),
        banner: {
          exists: !!banner,
          hidden: banner ? banner.hidden : null,
          display: style ? style.display : null,
          innerText: banner ? banner.innerText.trim() : null,
          textContent: bannerText ? bannerText.textContent.trim() : null
        }
      };
    })()`,
    returnByValue: true
  });

  console.log("=== 홈 해상특보 배너 최종 검증 결과 ===");
  console.log(JSON.stringify(bannerRes.result.value, null, 2));

  ws.close();
}

main().catch(console.error);
