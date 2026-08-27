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

function parseVal(v) {
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch (e) { return v; }
  }
  return v || {};
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

  // Navigate to clean home
  await send('Page.navigate', { url: 'http://127.0.0.1:8089/index.html' });
  await new Promise(r => setTimeout(r, 3000));

  // Dismiss intro
  await send('Runtime.evaluate', {
    expression: `(() => {
      const intro = document.getElementById('snorkyIntro');
      if (intro) intro.style.display = 'none';
      if (typeof window.dismissIntro === 'function') window.dismissIntro();
    })()`
  });
  await new Promise(r => setTimeout(r, 1000));

  // 1. Full Audit of all 59 points
  console.log("=== 1. SNORKY 59개 전체 포인트 Safety 상태 전수 검증 ===");
  const auditRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      for (let i = 0; i < 30; i++) {
        if (window.SNORKY_ACTIVE_POINTS?.length >= 59 && window.SNORKYMarineSafety?.getSafetyStatus()?.status === "READY") break;
        await new Promise(r => setTimeout(r, 200));
      }

      const pts = window.SNORKY_ACTIVE_POINTS || [];
      const safety = window.SNORKYMarineSafety;
      const safetyStatus = safety ? safety.getSafetyStatus() : null;

      const evaluations = pts.map(p => {
        const s = safety ? safety.statusForPoint(p) : { status: "ERROR" };
        return {
          id: p.id,
          name: p.name,
          regionName: p.regionName || p.region,
          warningAreaCode: p.warningAreaCode,
          lat: p.lat,
          lng: p.lng,
          status: s.status,
          reason: s.reason,
          activeWarningsCount: (s.activeWarnings || []).length
        };
      });

      const banner = document.getElementById("homeMarineWarning");
      const bannerStyle = banner ? window.getComputedStyle(banner) : null;

      return {
        pointsCount: pts.length,
        safetyStatus: safetyStatus?.status,
        upstreamStatus: safetyStatus?.upstreamStatus,
        evaluations,
        banner: {
          exists: !!banner,
          hidden: banner ? banner.hidden : null,
          display: bannerStyle ? bannerStyle.display : null,
          text: banner ? banner.innerText.trim() : null
        }
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  const auditData = parseVal(auditRes?.result?.value);
  console.log(`총 포인트: ${auditData.pointsCount}개`);
  console.log(`Safety 상태: ${auditData.safetyStatus} (Upstream: ${auditData.upstreamStatus})`);

  const blockList = (auditData.evaluations || []).filter(e => e.status === "BLOCK");
  const passList = (auditData.evaluations || []).filter(e => e.status === "PASS");
  const unknownList = (auditData.evaluations || []).filter(e => e.status === "UNKNOWN");

  console.log(`\n- PASS: ${passList.length}개`);
  console.log(`- BLOCK: ${blockList.length}개`);
  console.log(`- UNKNOWN: ${unknownList.length}개`);

  console.log("\n[BLOCK된 포인트 목록]");
  blockList.forEach(b => {
    console.log(`  * [ID ${b.id}] ${b.name} (${b.regionName}) | 구역코드: ${b.warningAreaCode} | 사유: ${b.reason}`);
  });

  if (unknownList.length > 0) {
    console.log("\n[UNKNOWN 포인트 목록]");
    unknownList.forEach(u => {
      console.log(`  * [ID ${u.id}] ${u.name} (${u.regionName}) | 구역코드: ${u.warningAreaCode} | 사유: ${u.reason}`);
    });
  }

  console.log("\n[홈 해상특보 배너(#homeMarineWarning) 상태]");
  console.log(`- 존재 여부: ${auditData.banner?.exists}`);
  console.log(`- hidden 속성: ${auditData.banner?.hidden}`);
  console.log(`- display 스타일: ${auditData.banner?.display}`);
  console.log(`- 노출 텍스트: "${auditData.banner?.text}"`);

  // Screenshot home
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  const shotPath1 = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\83ad0068-7358-4dca-b8ba-09e105e2dbcc\\.tempmediaStorage\\live_home_banner_final.png';
  fs.writeFileSync(shotPath1, Buffer.from(shot1.data, 'base64'));
  console.log("홈 배너 스크린샷 저장:", shotPath1);

  // 2. Click '확인하기' and verify Map filter
  console.log("\n=== 2. '확인하기' 클릭 ➔ 지도 특보 필터링 검증 ===");
  const mapClickRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const banner = document.getElementById("homeMarineWarning");
      if (banner) banner.click();

      const activeFilter = window.snorkyMapActiveFilter;
      const filtered = typeof window.getFilteredPoints === "function" ? window.getFilteredPoints() : [];
      const title = typeof window.getSnorkyMapPanelTitle === "function" ? window.getSnorkyMapPanelTitle() : "";
      return {
        activeFilter,
        panelTitle: title,
        filteredCount: filtered.length,
        filteredPoints: filtered.map(p => ({ id: p.id, name: p.name, code: p.warningAreaCode, region: p.regionName || p.region }))
      };
    })()`,
    returnByValue: true
  });
  console.log("지도 필터 결과:", JSON.stringify(parseVal(mapClickRes?.result?.value), null, 2));

  await new Promise(r => setTimeout(r, 1000));
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  const shotPath2 = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\83ad0068-7358-4dca-b8ba-09e105e2dbcc\\.tempmediaStorage\\live_map_filter_final.png';
  fs.writeFileSync(shotPath2, Buffer.from(shot2.data, 'base64'));
  console.log("지도 필터 스크린샷 저장:", shotPath2);

  // 3. Point Detail verification for Jeju test (id: 132)
  console.log("\n=== 3. 제주test 포인트 상세 입수 금지(BLOCK) 검증 ===");
  const detailRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const pt = (window.SNORKY_ACTIVE_POINTS || []).find(p => p.name === "제주test");
      if (!pt) return { error: "제주test 포인트 없음" };

      await window.SNORKYTodayConditionDetail.open(pt);
      await new Promise(r => setTimeout(r, 2000));

      const statusText = document.getElementById("tcHeroStatusText");
      const scoreVal = document.getElementById("tcHeroScoreVal");
      const badge = document.getElementById("tcHeroStatusChipText");
      const caption = document.getElementById("tcHeroCaption");
      const safetyBanner = document.getElementById("todayDetailSafetyBanner");
      const safetyReason = document.getElementById("todaySafetyReason");

      return {
        isOpen: window.SNORKYTodayConditionDetail.isOpen(),
        pointName: pt.name,
        warningAreaCode: pt.warningAreaCode,
        heroStatusText: statusText?.innerText?.trim(),
        heroScoreVal: scoreVal?.innerText?.trim(),
        heroBadge: badge?.innerText?.trim(),
        heroCaption: caption?.innerText?.trim(),
        safetyBannerVisible: safetyBanner ? !safetyBanner.hidden && window.getComputedStyle(safetyBanner).display !== "none" : false,
        safetyBannerText: safetyBanner?.innerText?.trim(),
        safetyReasonText: safetyReason?.innerText?.trim()
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log("제주test 상세 결과:", JSON.stringify(parseVal(detailRes?.result?.value), null, 2));

  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  const shotPath3 = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\83ad0068-7358-4dca-b8ba-09e105e2dbcc\\.tempmediaStorage\\live_jeju_detail_final.png';
  fs.writeFileSync(shotPath3, Buffer.from(shot3.data, 'base64'));
  console.log("제주 상세 스크린샷 저장:", shotPath3);

  // 4. Munam beach PASS regression
  console.log("\n=== 4. 강원 고성 문암해변 PASS 회귀 검증 ===");
  const munamRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const pt = (window.SNORKY_ACTIVE_POINTS || []).find(p => p.name.includes("문암"));
      if (!pt) return { error: "문암해변 포인트 없음" };

      await window.SNORKYTodayConditionDetail.open(pt);
      await new Promise(r => setTimeout(r, 2000));

      const statusText = document.getElementById("tcHeroStatusText");
      const scoreVal = document.getElementById("tcHeroScoreVal");
      const badge = document.getElementById("tcHeroStatusChipText");

      return {
        isOpen: window.SNORKYTodayConditionDetail.isOpen(),
        pointName: pt.name,
        warningAreaCode: pt.warningAreaCode,
        heroStatusText: statusText?.innerText?.trim(),
        heroScoreVal: scoreVal?.innerText?.trim(),
        heroBadge: badge?.innerText?.trim()
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log("문암해변 상세 결과:", JSON.stringify(parseVal(munamRes?.result?.value), null, 2));

  // 5. Ulsan Jujeon Mongdol regression
  console.log("\n=== 5. 울산 주전몽돌 PASS 회귀 검증 ===");
  const ulsanRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const pt = (window.SNORKY_ACTIVE_POINTS || []).find(p => p.name.includes("주전"));
      if (!pt) return { error: "주전몽돌 포인트 없음" };

      const safety = window.SNORKYMarineSafety;
      const st = safety.statusForPoint(pt);

      return {
        pointName: pt.name,
        warningAreaCode: pt.warningAreaCode,
        safetyStatus: st.status,
        safetyReason: st.reason
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log("울산 주전몽돌 결과:", JSON.stringify(parseVal(ulsanRes?.result?.value), null, 2));

  ws.close();
}

main().catch(console.error);
