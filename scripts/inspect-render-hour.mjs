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
      // Find card 21 and check its event listener / data
      const card21 = document.querySelector('[data-tc-hour="21"]');
      card21.click();

      // Check current DOM values
      const heroChipText = document.getElementById("tcHeroStatusChipText")?.textContent;
      const heroCaption = document.getElementById("tcHeroCaption")?.textContent;
      const heroStatus = document.getElementById("tcHeroStatusText")?.textContent;
      const heroScore = document.getElementById("tcHeroScoreVal")?.textContent;

      // Check raw todayRows in memory
      // We can inspect todayRows by looking at activePoint or reader
      return {
        heroScore,
        heroStatus,
        heroChipText,
        heroCaption
      };
    })()`,
    returnByValue: true
  });

  console.log("Current state on click:", JSON.stringify(evalRes?.result?.value, null, 2));
  ws.close();
}

main().catch(console.error);
