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

  console.log("=== 1. 포인트 목록 상세 점검 ===");
  const ptsRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const pts = window.SNORKY_ACTIVE_POINTS || [];
      const safety = window.SNORKYMarineSafety;
      const safetyStatus = safety ? safety.getSafetyStatus() : null;

      const results = pts.map(p => {
        const s = safety ? safety.statusForPoint(p) : { status: "NO_SAFETY" };
        return {
          id: p.id,
          name: p.name,
          regionName: p.regionName || p.region,
          warningAreaCode: p.warningAreaCode,
          safetyStatus: s.status,
          reason: s.reason
        };
      });

      return JSON.stringify({
        count: pts.length,
        safetyStatusReady: safetyStatus?.status,
        allPoints: results
      });
    })()`,
    returnByValue: true
  });

  const rawJson = ptsRes?.result?.value;
  console.log("Raw JSON type:", typeof rawJson);
  const ptsData = JSON.parse(rawJson || "{}");
  console.log(`총 포인트: ${ptsData.count}개`);
  console.log(`Safety 상태: ${ptsData.safetyStatusReady}`);

  const blockPoints = (ptsData.allPoints || []).filter(p => p.safetyStatus === "BLOCK");
  const passPoints = (ptsData.allPoints || []).filter(p => p.safetyStatus === "PASS");
  const unknownPoints = (ptsData.allPoints || []).filter(p => p.safetyStatus === "UNKNOWN");

  console.log(`\nBLOCK (${blockPoints.length}개):`);
  blockPoints.forEach(p => console.log(`  - [ID: ${p.id}] ${p.name} (${p.regionName}) | 코드: ${p.warningAreaCode} | 사유: ${p.reason}`));

  console.log(`\nUNKNOWN (${unknownPoints.length}개):`);
  unknownPoints.forEach(p => console.log(`  - [ID: ${p.id}] ${p.name} (${p.regionName}) | 코드: ${p.warningAreaCode} | 사유: ${p.reason}`));

  console.log(`\nPASS (${passPoints.length}개)`);

  // 2. Open Jeju test detail modal
  console.log("\n=== 2. 제주test 상세 모달 오픈 및 DOM 확인 ===");
  const modalRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const pt = (window.SNORKY_ACTIVE_POINTS || []).find(p => p.name === "제주test");
      if (!pt) return JSON.stringify({ error: "제주test 찾을 수 없음" });

      await window.SNORKYTodayConditionDetail.open(pt);
      await new Promise(r => setTimeout(r, 2000));

      const modal = document.getElementById("todayConditionDetailModal");
      const badge = document.getElementById("tcHeroStatusChipText");
      const statusText = document.getElementById("tcHeroStatusText");
      const scoreVal = document.getElementById("tcHeroScoreVal");
      const safetyBanner = document.getElementById("todayDetailSafetyBanner");
      const bannerReason = document.getElementById("todaySafetyReason");

      return JSON.stringify({
        isOpen: window.SNORKYTodayConditionDetail.isOpen(),
        pointName: pt.name,
        warningAreaCode: pt.warningAreaCode,
        heroStatusText: statusText?.innerText?.trim(),
        heroScoreVal: scoreVal?.innerText?.trim(),
        heroBadge: badge?.innerText?.trim(),
        safetyBannerVisible: safetyBanner ? !safetyBanner.hidden && window.getComputedStyle(safetyBanner).display !== "none" : false,
        safetyBannerText: safetyBanner?.innerText?.trim(),
        safetyReasonText: bannerReason?.innerText?.trim()
      });
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log("제주test 모달 상세:", JSON.parse(modalRes?.result?.value || "{}"));

  // Screenshot modal
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const shotPath = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\83ad0068-7358-4dca-b8ba-09e105e2dbcc\\.tempmediaStorage\\jeju_test_detail_modal_exact.png';
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  console.log("제주 모달 스크린샷 저장 완료:", shotPath);

  ws.close();
}

main().catch(console.error);
