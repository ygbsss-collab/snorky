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
  console.log("=== 홈 해상특보 전체 집계 및 BLOCK 필터링 브라우저 실시간 검증 ===");
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
  await send('DOM.enable');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });

  // Reload page
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 3000));

  // Dismiss intro
  await send('Runtime.evaluate', {
    expression: `(() => {
      const intro = document.getElementById('snorkyIntro');
      if (intro) intro.style.display = 'none';
    })()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 800));

  // -------------------------------------------------------------------------
  // [시나리오 1] 평시 상태 (현재 등록 포인트 전부 PASS인 경우)
  // -------------------------------------------------------------------------
  const passAgg = await send('Runtime.evaluate', {
    expression: `(() => {
      const allPoints = window.getAllActivePoints ? window.getAllActivePoints() : (window.SNORKY_ACTIVE_POINTS || []);
      const safety = window.SNORKYMarineSafety;
      const aggregated = allPoints.map(p => ({
        id: p.id,
        name: p.name,
        safety: safety?.statusForPoint(p)
      }));
      const blockedCount = aggregated.filter(a => a.safety?.status === 'BLOCK').length;
      const host = document.getElementById("homeMarineWarning");
      const style = host ? window.getComputedStyle(host) : null;

      return {
        totalPointsCount: allPoints.length,
        blockedCount,
        homeBanner: {
          hidden: host?.hidden,
          display: style?.display,
          text: host?.innerText?.trim()
        }
      };
    })()`,
    returnByValue: true
  });

  console.log("\n[1] 평시 전체 포인트 PASS 집계 결과:");
  console.log(JSON.stringify(passAgg?.result?.value, null, 2));

  const shotHomePass = await send('Page.captureScreenshot', { format: 'png' });
  const shotHomePassPath = 'd:\\SNORK_prototype_v0.1\\home_agg_pass_hidden.png';
  fs.writeFileSync(shotHomePassPath, Buffer.from(shotHomePass.data, 'base64'));
  console.log(`PASS 미노출 스크린샷: ${shotHomePassPath}`);

  // -------------------------------------------------------------------------
  // [시나리오 2] UNKNOWN 포인트가 포함된 경우 (BLOCK으로 간주하지 않음 검증)
  // -------------------------------------------------------------------------
  const unknownAgg = await send('Runtime.evaluate', {
    expression: `(() => {
      const originalPoints = window.SNORKY_ACTIVE_POINTS || [];
      // Add unknown point with invalid code
      window.SNORKY_ACTIVE_POINTS = [...originalPoints, { id: 999, name: '알수없는포인트', warningAreaCode: 'INVALID' }];
      
      const host = document.getElementById("homeMarineWarning");
      window.renderHomeWarning?.();
      
      const allPoints = window.getAllActivePoints();
      const blockedCount = allPoints.filter(p => window.SNORKYMarineSafety?.statusForPoint(p)?.status === "BLOCK").length;
      const unknownCount = allPoints.filter(p => window.SNORKYMarineSafety?.statusForPoint(p)?.status === "UNKNOWN").length;
      
      const style = window.getComputedStyle(host);
      const res = {
        blockedCount,
        unknownCount,
        homeBannerHidden: host.hidden,
        homeBannerDisplay: style.display,
        homeBannerText: host.innerText.trim()
      };

      // restore
      window.SNORKY_ACTIVE_POINTS = originalPoints;
      window.renderHomeWarning?.();
      return res;
    })()`,
    returnByValue: true
  });
  console.log("\n[2] UNKNOWN 포인트 포함 시 집계 결과 (미노출 유지):");
  console.log(JSON.stringify(unknownAgg?.result?.value, null, 2));

  // -------------------------------------------------------------------------
  // [시나리오 3] 제주남쪽 테스트 포인트 (S1323300 풍랑주의보) 등록 시 BLOCK 집계 및 배너 노출
  // -------------------------------------------------------------------------
  const jejuSouthPoint = {
    id: 101,
    supabaseId: 101,
    name: '제주남쪽(중문)',
    region: '제주',
    lat: 33.245,
    lng: 126.412,
    warningAreaCode: 'S1323300'
  };

  const blockAgg = await send('Runtime.evaluate', {
    expression: `(() => {
      const jejuPoint = ${JSON.stringify(jejuSouthPoint)};
      const originalPoints = window.SNORKY_ACTIVE_POINTS || [];
      window.SNORKY_ACTIVE_POINTS = [...originalPoints, jejuPoint];

      // Check statusForPoint on 제주남쪽
      const jejuSafety = window.SNORKYMarineSafety?.statusForPoint(jejuPoint);

      // Re-run renderWarning
      window.renderHomeWarning?.();

      const host = document.getElementById("homeMarineWarning");
      const allPoints = window.getAllActivePoints ? window.getAllActivePoints() : (window.SNORKY_ACTIVE_POINTS || []);
      const blockedPoints = allPoints.filter(p => window.SNORKYMarineSafety?.statusForPoint(p)?.status === "BLOCK");

      const style = window.getComputedStyle(host);
      return {
        jejuSafety: {
          status: jejuSafety?.status,
          warning: jejuSafety?.warning?.areaName + " " + jejuSafety?.warning?.warningName + jejuSafety?.warning?.levelName
        },
        blockedPointsCount: blockedPoints.length,
        blockedPointNames: blockedPoints.map(p => p.name),
        homeBanner: {
          hidden: host.hidden,
          display: style.display,
          className: host.className,
          text: host.innerText.trim()
        }
      };
    })()`,
    returnByValue: true
  });

  console.log("\n[3] 제주남쪽 테스트 포인트 BLOCK 집계 및 배너 노출 결과:");
  console.log(JSON.stringify(blockAgg?.result?.value, null, 2));

  const shotHomeBlock = await send('Page.captureScreenshot', { format: 'png' });
  const shotHomeBlockPath = 'd:\\SNORK_prototype_v0.1\\home_agg_block_visible.png';
  fs.writeFileSync(shotHomeBlockPath, Buffer.from(shotHomeBlock.data, 'base64'));
  console.log(`BLOCK 배너 노출 스크린샷: ${shotHomeBlockPath}`);

  // -------------------------------------------------------------------------
  // [시나리오 4] 확인하기 클릭 시 BLOCK 포인트/지역만 표시 검증
  // -------------------------------------------------------------------------
  const clickCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const host = document.getElementById("homeMarineWarning");
      if (host && host.onclick) {
        host.onclick();
      }

      const mapScreen = document.getElementById("snorkyMapScreen");
      const mapTitle = document.getElementById("snorkyMapTitle")?.innerText?.trim();
      const mapSubTitle = document.getElementById("snorkyMapSubTitle")?.innerText?.trim();
      const panelTitle = window.getSnorkyMapPanelTitle ? window.getSnorkyMapPanelTitle() : "";
      const filtered = window.getFilteredPoints ? window.getFilteredPoints() : [];
      const cards = Array.from(document.querySelectorAll("#snorkyMapCardsTrack .home-rank-row")).map(c => ({
        name: c.querySelector("strong")?.innerText?.trim(),
        scoreText: c.querySelector("small + span")?.innerText?.trim() || c.querySelector("span:last-of-type")?.innerText?.trim()
      }));

      return {
        mapScreenOpened: mapScreen?.classList?.contains("open"),
        mapTitle,
        mapSubTitle,
        panelTitle,
        filteredPointsCount: filtered.length,
        filteredPoints: filtered.map(p => ({
          name: p.name,
          region: p.region,
          warningAreaCode: p.warningAreaCode,
          safetyStatus: window.SNORKYMarineSafety?.statusForPoint(p)?.status
        })),
        renderedCardCount: cards.length
      };
    })()`,
    returnByValue: true
  });

  console.log("\n[4] 확인하기 클릭 후 지도 화면 BLOCK 포인트/지역 필터링 결과:");
  console.log(JSON.stringify(clickCheck?.result?.value, null, 2));

  await new Promise(r => setTimeout(r, 1200));

  const shotMapBlock = await send('Page.captureScreenshot', { format: 'png' });
  const shotMapBlockPath = 'd:\\SNORK_prototype_v0.1\\map_agg_blocked_points.png';
  fs.writeFileSync(shotMapBlockPath, Buffer.from(shotMapBlock.data, 'base64'));
  console.log(`지도 화면 BLOCK 필터링 스크린샷: ${shotMapBlockPath}`);

  ws.close();
  if (chrome) chrome.kill();
  console.log("\n=== 모든 집계 및 브라우저 검증 완료 ===");
}

main().catch(console.error);
