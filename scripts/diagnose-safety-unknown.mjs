import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

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

async function run() {
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

  const diag = await send('Runtime.evaluate', {
    expression: `(async () => {
      // 1. Current Active Point
      const activePoint = window.SNORKYTodayConditionDetail?.activePoint || window.activePoint || (window.snorkyPoints?.find(p => p.id === 22 || p.id === 1));
      
      // 2. warningAreaCode check for Munam Beach (22) and all points
      const pointsMeta = (window.snorkyPoints || []).map(p => ({
        id: p.id,
        name: p.name,
        region: p.region,
        rawWarningAreaCode: p.warningAreaCode || p.warning_area_code,
        resolvedAreaCode: window.SNORKYMarineSafety?.pointAreaCode(p)
      }));

      // 3. SNORKYMarineSafety state
      const safetyState = window.SNORKYMarineSafety?.state;

      // 4. Point safety status for Munam (22)
      const testPoint = window.snorkyPoints?.find(p => p.id === 22) || { id: 22, name: '문암해변', lat: 38.3732, lng: 128.5096 };
      const pointSafety = window.SNORKYMarineSafety?.statusForPoint(testPoint);

      // 5. Direct invocation of kma-warnings edge function
      let directEdgeRes = null;
      try {
        const client = window.getSnorkySupabase?.();
        if (client) {
          const res = await client.functions.invoke("kma-warnings", { method: "GET" });
          directEdgeRes = res;
        }
      } catch (e) {
        directEdgeRes = { error: e.message };
      }

      // 6. Direct HTTP fetch to kma-warnings endpoint
      let directHttpRes = null;
      try {
        const url = "https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-warnings";
        const key = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
        const res = await fetch(url, {
          headers: { apikey: key, Authorization: "Bearer " + key }
        });
        const json = await res.json();
        directHttpRes = { status: res.status, ok: res.ok, data: json };
      } catch (e) {
        directHttpRes = { error: e.message };
      }

      // 7. Check UI elements on page
      const safetySection = document.getElementById("tcSafetySection");
      const safetyBanner = document.getElementById("tcSafetyBanner");
      const homeWarning = document.getElementById("homeMarineWarning");

      return {
        pointsCount: (window.snorkyPoints || []).length,
        munamPoint: pointsMeta.find(p => p.id === 22 || p.name?.includes('문암')),
        allPointsMeta: pointsMeta,
        safetyState,
        pointSafety,
        directEdgeRes,
        directHttpRes,
        ui: {
          safetySectionHidden: safetySection?.hidden,
          safetyBannerText: safetyBanner?.innerText,
          homeWarningText: homeWarning?.innerText
        }
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("=== Browser Marine Safety Diagnostic ===");
  console.log(JSON.stringify(diag?.result?.value, null, 2));

  ws.close();
  if (chrome) chrome.kill();
}

run().catch(console.error);
