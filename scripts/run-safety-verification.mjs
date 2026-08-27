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
  console.log("=== 브라우저 라이브 환경 해상특보 검증 시작 ===");
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
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 200));
      wsUrl = await getWsUrl().catch(() => null);
      if (wsUrl) break;
    }
  }

  if (!wsUrl) {
    console.error("Chrome WS 연결 실패!");
    return;
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

  // Navigate to home to ensure fresh state
  await send('Page.navigate', { url: 'http://127.0.0.1:8089/index.html' });
  await new Promise(r => setTimeout(r, 3000));

  // Dismiss intro
  await send('Runtime.evaluate', {
    expression: `(() => {
      const intro = document.getElementById('snorkyIntro');
      if (intro) intro.style.display = 'none';
      if (typeof window.dismissIntro === 'function') window.dismissIntro();
    })()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 1500));

  // 1. Check points and safety status
  console.log("1. 전체 포인트 및 KMA Safety 판정 확인 중...");
  const evalPoints = await send('Runtime.evaluate', {
    expression: `(() => {
      const points = window.SNORKY_ACTIVE_POINTS || [];
      const safety = window.SNORKYMarineSafety;
      const safetyStatus = safety ? safety.getSafetyStatus() : null;

      const results = points.map(p => {
        const s = safety ? safety.statusForPoint(p) : { status: "NO_SAFETY" };
        return {
          id: p.id,
          name: p.name,
          regionName: p.regionName || p.region,
          warningAreaCode: p.warningAreaCode,
          safetyStatus: s.status,
          reason: s.reason,
          activeWarnings: s.activeWarnings
        };
      });

      const blocked = results.filter(r => r.safetyStatus === "BLOCK");
      const passed = results.filter(r => r.safetyStatus === "PASS");
      const unknown = results.filter(r => r.safetyStatus === "UNKNOWN");

      const banner = document.getElementById("homeMarineWarning");
      const computed = banner ? window.getComputedStyle(banner) : null;

      return {
        totalCount: points.length,
        safetyCacheStatus: safetyStatus?.status,
        warningCountInCache: safetyStatus?.warnings?.length || 0,
        blockedPoints: blocked,
        passCount: passed.length,
        unknownCount: unknown.length,
        banner: {
          exists: !!banner,
          hiddenAttr: banner?.hidden,
          display: computed?.display,
          text: banner?.innerText?.trim()
        }
      };
    })()`,
    returnByValue: true
  });

  const pRes = evalPoints?.result?.value;
  console.log("포인트 집계 결과:", JSON.stringify(pRes, null, 2));

  // Screenshot of Home Banner
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  const shotPath1 = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\83ad0068-7358-4dca-b8ba-09e105e2dbcc\\.tempmediaStorage\\live_home_banner_verified.png';
  fs.writeFileSync(shotPath1, Buffer.from(shot1.data, 'base64'));
  console.log("홈 배너 스크린샷:", shotPath1);

  // 2. Click '확인하기' and verify Map filter
  console.log("\n2. 홈 배너 '확인하기' 클릭 ➔ 지도 필터 검증...");
  const mapEval = await send('Runtime.evaluate', {
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
  console.log("지도 필터 결과:", JSON.stringify(mapEval?.result?.value, null, 2));

  await new Promise(r => setTimeout(r, 1000));
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  const shotPath2 = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\83ad0068-7358-4dca-b8ba-09e105e2dbcc\\.tempmediaStorage\\live_map_filter_verified.png';
  fs.writeFileSync(shotPath2, Buffer.from(shot2.data, 'base64'));
  console.log("지도 필터 스크린샷:", shotPath2);

  // 3. Open Jeju Test point detail modal (id: 132)
  console.log("\n3. 제주test (id: 132) Today 상세 모달 검증...");
  const detailEval = await send('Runtime.evaluate', {
    expression: `(async () => {
      const pt = (window.SNORKY_ACTIVE_POINTS || []).find(p => p.id === 132);
      if (!pt) return { error: "포인트 132 없음" };

      if (window.SNORKYTodayConditionDetail && typeof window.SNORKYTodayConditionDetail.open === "function") {
        await window.SNORKYTodayConditionDetail.open(pt);
        await new Promise(r => setTimeout(r, 2000));

        const badge = document.getElementById("todaySafetyBadge") || document.querySelector(".today-detail-safety-badge");
        const reason = document.getElementById("todaySafetyReason") || document.querySelector(".today-detail-safety-reason");
        const safetyBanner = document.getElementById("todayDetailSafetyBanner");
        const score = document.getElementById("todayConditionScore") || document.querySelector(".today-hero-score");
        const chip = document.getElementById("todayConditionStatusChip") || document.querySelector(".today-hero-status-chip");

        return {
          pointName: pt.name,
          warningAreaCode: pt.warningAreaCode,
          isOpen: window.SNORKYTodayConditionDetail.isOpen(),
          safetyBadge: badge?.innerText?.trim(),
          safetyReason: reason?.innerText?.trim(),
          safetyBanner: safetyBanner?.innerText?.trim(),
          scoreText: score?.innerText?.trim(),
          chipText: chip?.innerText?.trim()
        };
      }
      return { error: "open 함수 없음" };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log("제주test 상세 결과:", JSON.stringify(detailEval?.result?.value, null, 2));

  await new Promise(r => setTimeout(r, 500));
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  const shotPath3 = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\83ad0068-7358-4dca-b8ba-09e105e2dbcc\\.tempmediaStorage\\live_jeju_detail_verified.png';
  fs.writeFileSync(shotPath3, Buffer.from(shot3.data, 'base64'));
  console.log("제주 상세 스크린샷:", shotPath3);

  // 4. Open Gangwon Munam beach (id: 22) for PASS regression
  console.log("\n4. 문암해변 (강원 고성) Today 상세 회귀 검증...");
  const munamEval = await send('Runtime.evaluate', {
    expression: `(async () => {
      const pt = (window.SNORKY_ACTIVE_POINTS || []).find(p => p.name.includes("문암"));
      if (!pt) return { error: "문암해변 없음" };

      if (window.SNORKYTodayConditionDetail && typeof window.SNORKYTodayConditionDetail.open === "function") {
        await window.SNORKYTodayConditionDetail.open(pt);
        await new Promise(r => setTimeout(r, 2000));

        const badge = document.getElementById("todaySafetyBadge") || document.querySelector(".today-detail-safety-badge");
        const reason = document.getElementById("todaySafetyReason") || document.querySelector(".today-detail-safety-reason");
        const safetyBanner = document.getElementById("todayDetailSafetyBanner");
        const score = document.getElementById("todayConditionScore") || document.querySelector(".today-hero-score");

        return {
          pointName: pt.name,
          warningAreaCode: pt.warningAreaCode,
          isOpen: window.SNORKYTodayConditionDetail.isOpen(),
          safetyBadge: badge?.innerText?.trim(),
          safetyReason: reason?.innerText?.trim(),
          safetyBannerVisible: safetyBanner ? !safetyBanner.hidden && window.getComputedStyle(safetyBanner).display !== "none" : false,
          scoreText: score?.innerText?.trim()
        };
      }
      return { error: "open 함수 없음" };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log("문암해변 회귀 결과:", JSON.stringify(munamEval?.result?.value, null, 2));

  // 5. Check Ulsan Jujeon Mongdol (id: 123)
  console.log("\n5. 울산 주전몽돌 (id: 123) 검증...");
  const ulsanEval = await send('Runtime.evaluate', {
    expression: `(() => {
      const pt = (window.SNORKY_ACTIVE_POINTS || []).find(p => p.id === 123);
      const safety = window.SNORKYMarineSafety;
      const s = safety.statusForPoint(pt);
      return {
        id: pt?.id,
        name: pt?.name,
        code: pt?.warningAreaCode,
        safetyStatus: s.status,
        reason: s.reason
      };
    })()`,
    returnByValue: true
  });
  console.log("울산 주전몽돌 결과:", JSON.stringify(ulsanEval?.result?.value, null, 2));

  ws.close();
  if (chrome) chrome.kill();
  console.log("\n=== 모든 검증 완료 ===");
}

main().catch(console.error);
