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
  console.log("=== 실제 운영 데이터 + 실제 홈 화면 해상특보 진단 ===");
  let wsUrl = await getWsUrl().catch(() => null);
  let chrome = null;
  if (!wsUrl) {
    chrome = spawn(findChromePath(), [
      '--remote-debugging-port=9222',
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      'http://127.0.0.1:8089'
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
  await send('DOM.enable');

  // Hard reload page to get clean live state
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 4000));

  const result = await send('Runtime.evaluate', {
    expression: `(() => {
      // 1. KMA Safety State
      const safety = window.SNORKYMarineSafety;
      const safetyState = safety?.state;
      
      // 2. Active Points in system
      const rawActivePoints = window.SNORKY_ACTIVE_POINTS || [];
      const funcActivePoints = typeof getAllActivePoints === 'function' ? getAllActivePoints() : [];
      const locationsObj = window.locations;

      // 3. Check Jeju or other blocked points in actual registered points
      const pointEvaluations = funcActivePoints.map(p => {
        const res = safety?.statusForPoint(p);
        return {
          id: p.id,
          name: p.name,
          region: p.region,
          warningAreaCode: p.warningAreaCode,
          lat: p.lat,
          lng: p.lng,
          status: res?.status,
          warning: res?.warning ? (res.warning.areaName + " " + res.warning.warningName + res.warning.levelName) : null
        };
      });

      const blockedPoints = pointEvaluations.filter(p => p.status === 'BLOCK');
      const passPoints = pointEvaluations.filter(p => p.status === 'PASS');
      const unknownPoints = pointEvaluations.filter(p => p.status === 'UNKNOWN');

      // Check if Jeju points exist in funcActivePoints
      const jejuPoints = funcActivePoints.filter(p => (p.region && p.region.includes('제주')) || (p.name && p.name.includes('제주')) || String(p.warningAreaCode).startsWith('S132'));

      // 4. DOM state of #homeMarineWarning
      const host = document.getElementById("homeMarineWarning");
      const computedStyle = host ? window.getComputedStyle(host) : null;
      
      // Check other potential banners or safety DOM elements
      const kmaSafetyBanner = document.getElementById("kmaSafetyBanner");

      return {
        kmaSafetyState: {
          status: safetyState?.status,
          upstreamStatus: safetyState?.upstreamStatus,
          stale: safetyState?.stale,
          warningsLength: safetyState?.warnings?.length,
          activeWarningsList: (safetyState?.warnings || []).filter(w => w.active).map(w => ({
            regId: w.regId,
            regKo: w.regKo || w.areaName,
            warningName: w.warningName,
            levelName: w.levelName
          }))
        },
        pointsSummary: {
          rawActivePointsCount: rawActivePoints.length,
          funcActivePointsCount: funcActivePoints.length,
          locationsKeys: locationsObj ? Object.keys(locationsObj) : null,
          jejuPointsInSystem: jejuPoints.map(p => ({ id: p.id, name: p.name, region: p.region, warningAreaCode: p.warningAreaCode })),
          hasJejuSouthPoint: funcActivePoints.some(p => p.name?.includes('제주남쪽') || p.warningAreaCode === 'S1323300')
        },
        safetyAggregation: {
          totalEvaluated: pointEvaluations.length,
          blockedCount: blockedPoints.length,
          blockedPoints: blockedPoints,
          passCount: passPoints.length,
          unknownCount: unknownPoints.length,
          unknownPoints: unknownPoints.map(p => ({ id: p.id, name: p.name, warningAreaCode: p.warningAreaCode }))
        },
        domState: {
          hostExists: !!host,
          hostHidden: host?.hidden,
          hostDisplay: computedStyle?.display,
          hostClass: host?.className,
          hostInnerHTML: host?.innerHTML,
          hostInnerText: host?.innerText?.trim(),
          kmaSafetyBannerExists: !!kmaSafetyBanner
        }
      };
    })()`,
    returnByValue: true
  });

  console.log("=== 진단 결과 ===");
  console.log(JSON.stringify(result?.result?.value, null, 2));

  // Capture screenshot of actual live home
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const shotPath = 'd:\\SNORK_prototype_v0.1\\actual_live_home_screen.png';
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  console.log(`실제 홈 화면 스크린샷: ${shotPath}`);

  ws.close();
  if (chrome) chrome.kill();
}

main().catch(console.error);
