import http from 'http';
import fs from 'fs';
import { spawn } from 'child_process';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\user\\AppData\\Local\\Temp\\chrome_cdp_verify_' + Date.now();
const LOCAL_URL = 'http://127.0.0.1:5501/index.html';
const CDP_PORT = 9225;

async function waitPort(port) {
  for (let i = 0; i < 30; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${port}/json`, (r) => {
          let str = '';
          r.on('data', c => str += c);
          r.on('end', () => res(JSON.parse(str)));
        }).on('error', rej);
      });
      return data;
    } catch (e) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw new Error(`Port ${port} not ready`);
}

async function main() {
  console.log("=== Chrome CDP 실제 브라우저 검증 시작 ===");
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=430,932',
    LOCAL_URL
  ], { stdio: 'ignore' });

  try {
    const tabs = await waitPort(CDP_PORT);
    const pageTab = tabs.find(t => t.type === 'page') || tabs[0];
    console.log("Browser Connected! Debugger:", pageTab.webSocketDebuggerUrl);

    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
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

    await new Promise(r => ws.onopen = r);

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    console.log("1. 페이지 로드 및 인트로 닫기...");
    await new Promise(r => setTimeout(r, 3000));

    // Dismiss intro if present
    await send('Runtime.evaluate', {
      expression: `(() => {
        const intro = document.getElementById('snorkyIntro');
        if (intro) intro.style.display = 'none';
        if (typeof window.dismissIntro === 'function') window.dismissIntro();
      })()`,
      returnByValue: true
    });

    console.log("2. 포인트 및 KMA Safety READY 대기 중 (최대 15초)...");
    let isReady = false;
    for (let i = 0; i < 30; i++) {
      const checkRes = await send('Runtime.evaluate', {
        expression: `({
          pointsCount: window.SNORKY_ACTIVE_POINTS?.length || 0,
          safetyStatus: window.SNORKYMarineSafety?.getSafetyStatus()?.status
        })`,
        returnByValue: true
      });
      const val = checkRes?.result?.value;
      if (val && val.pointsCount >= 59 && val.safetyStatus === "READY") {
        isReady = true;
        console.log(`[대기 성공] pointsCount: ${val.pointsCount}, safetyStatus: ${val.safetyStatus}`);
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }

    if (!isReady) {
      console.log("대기 상태 점검:");
      const debugRes = await send('Runtime.evaluate', {
        expression: `({
          pointsCount: window.SNORKY_ACTIVE_POINTS?.length || 0,
          safetyStatus: window.SNORKYMarineSafety?.getSafetyStatus()?.status,
          warnings: window.SNORKYMarineSafety?.getSafetyStatus()?.warnings?.length
        })`,
        returnByValue: true
      });
      console.log(debugRes?.result?.value);
    }

    // 2. Evaluate all points safety
    const evalData = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const points = window.SNORKY_ACTIVE_POINTS || [];
          const safety = window.SNORKYMarineSafety;
          const statusObj = safety.getSafetyStatus();
          
          const evals = points.map(p => {
            const st = safety.statusForPoint(p);
            return {
              id: p.id,
              name: p.name,
              regionName: p.regionName || p.region,
              warningAreaCode: p.warningAreaCode,
              status: st.status,
              reason: st.reason,
              activeWarnings: st.activeWarnings
            };
          });

          const blocked = evals.filter(e => e.status === "BLOCK");
          const passed = evals.filter(e => e.status === "PASS");
          const unknown = evals.filter(e => e.status === "UNKNOWN");

          const banner = document.getElementById("homeMarineWarning");
          const style = banner ? window.getComputedStyle(banner) : null;

          return {
            totalPoints: points.length,
            safetyCacheStatus: statusObj?.status,
            blockedPoints: blocked,
            passCount: passed.length,
            unknownCount: unknown.length,
            banner: {
              exists: !!banner,
              hidden: banner?.hidden,
              display: style?.display,
              text: banner?.innerText?.trim()
            }
          };
        })()
      `,
      returnByValue: true
    });

    const res = evalData?.result?.value;
    console.log("\n============================================================");
    console.log("2. 전체 포인트 안전상태 판정 결과:");
    console.log("============================================================");
    console.log(`- 총 포인트 수: ${res.totalPoints}개`);
    console.log(`- KMA Safety 캐시 상태: ${res.safetyCacheStatus}`);
    console.log(`- PASS 포인트 수: ${res.passCount}개`);
    console.log(`- BLOCK 포인트 수: ${res.blockedPoints.length}개`);
    console.log(`- UNKNOWN 포인트 수: ${res.unknownCount}개`);

    console.log("\n[BLOCK된 포인트 상세]");
    res.blockedPoints.forEach(b => {
      console.log(`  * ID ${b.id} | ${b.name} (${b.regionName}) | 구역코드: ${b.warningAreaCode}`);
      console.log(`    사유: ${b.reason}`);
      console.log(`    발효특보:`, JSON.stringify(b.activeWarnings));
    });

    console.log("\n[홈 해상특보 배너(#homeMarineWarning) DOM 상태]");
    console.log(`- 배너 존재: ${res.banner.exists}`);
    console.log(`- 배너 hidden 속성: ${res.banner.hidden}`);
    console.log(`- 배너 display 스타일: ${res.banner.display}`);
    console.log(`- 배너 노출 텍스트: "${res.banner.text}"`);

    // Take screenshot of home banner
    const shot1 = await send('Page.captureScreenshot', { format: 'png' });
    const shotPath1 = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\83ad0068-7358-4dca-b8ba-09e105e2dbcc\\.tempmediaStorage\\live_home_banner_verified.png';
    fs.writeFileSync(shotPath1, Buffer.from(shot1.data, 'base64'));
    console.log(`\n홈 화면 스크린샷 저장 완료: ${shotPath1}`);

    // 3. Click '확인하기' -> Map Warning Filter
    console.log("\n============================================================");
    console.log("3. '확인하기' 클릭 ➔ 지도 특보 필터 검증:");
    console.log("============================================================");
    const clickEval = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const banner = document.getElementById("homeMarineWarning");
          if (banner) banner.click();
          
          const filter = window.snorkyMapActiveFilter;
          const filtered = typeof window.getFilteredPoints === "function" ? window.getFilteredPoints() : [];
          const title = typeof window.getSnorkyMapPanelTitle === "function" ? window.getSnorkyMapPanelTitle() : "";
          return {
            filter,
            panelTitle: title,
            filteredCount: filtered.length,
            filteredPoints: filtered.map(p => ({ id: p.id, name: p.name, code: p.warningAreaCode }))
          };
        })()
      `,
      returnByValue: true
    });
    console.log("지도 전환 결과:", JSON.stringify(clickEval?.result?.value, null, 2));

    await new Promise(r => setTimeout(r, 1000));
    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    const shotPath2 = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\83ad0068-7358-4dca-b8ba-09e105e2dbcc\\.tempmediaStorage\\live_map_filter_verified.png';
    fs.writeFileSync(shotPath2, Buffer.from(shot2.data, 'base64'));
    console.log(`지도 필터 스크린샷 저장 완료: ${shotPath2}`);

    // 4. Test Point Detail modal for Jeju test (id: 132)
    console.log("\n============================================================");
    console.log("4. 제주test (id: 132) 상세 화면 Safety BLOCK 검증:");
    console.log("============================================================");
    const detailEval = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          const pt = (window.SNORKY_ACTIVE_POINTS || []).find(p => p.id === 132);
          if (!pt) return { error: "포인트 없음" };
          
          if (window.SNORKYTodayConditionDetail?.open) {
            await window.SNORKYTodayConditionDetail.open(pt);
            await new Promise(r => setTimeout(r, 2000));
            
            const badge = document.getElementById("todaySafetyBadge") || document.querySelector(".today-detail-safety-badge") || document.querySelector(".detail-safety-badge");
            const reason = document.getElementById("todaySafetyReason") || document.querySelector(".today-detail-safety-reason") || document.querySelector(".detail-safety-reason");
            const score = document.getElementById("todayConditionScore") || document.querySelector(".today-hero-score");
            const safetyBanner = document.getElementById("todayDetailSafetyBanner");
            
            return {
              isOpen: window.SNORKYTodayConditionDetail.isOpen(),
              pointName: pt.name,
              warningAreaCode: pt.warningAreaCode,
              safetyBadgeText: badge ? badge.innerText.trim() : null,
              safetyReasonText: reason ? reason.innerText.trim() : null,
              safetyBannerText: safetyBanner ? safetyBanner.innerText.trim() : null,
              conditionScoreText: score ? score.innerText.trim() : null
            };
          }
          return { error: "SNORKYTodayConditionDetail.open 함수 없음" };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    console.log("제주test 상세 모달 결과:", JSON.stringify(detailEval?.result?.value, null, 2));

    const shot3 = await send('Page.captureScreenshot', { format: 'png' });
    const shotPath3 = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\83ad0068-7358-4dca-b8ba-09e105e2dbcc\\.tempmediaStorage\\live_jeju_detail_verified.png';
    fs.writeFileSync(shotPath3, Buffer.from(shot3.data, 'base64'));
    console.log(`제주 상세 모달 스크린샷 저장 완료: ${shotPath3}`);

    // 5. Test Gangwon Munam Beach regression (id: 22 or 2)
    console.log("\n============================================================");
    console.log("5. 기존 강원 고성 문암해변 Safety 회귀검증:");
    console.log("============================================================");
    const munamEval = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const pt = (window.SNORKY_ACTIVE_POINTS || []).find(p => p.name.includes("문암"));
          const safety = window.SNORKYMarineSafety;
          const st = safety.statusForPoint(pt);
          return {
            id: pt?.id,
            name: pt?.name,
            code: pt?.warningAreaCode,
            status: st.status,
            reason: st.reason
          };
        })()
      `,
      returnByValue: true
    });
    console.log("문암해변 회귀검증 결과:", JSON.stringify(munamEval?.result?.value, null, 2));

    // 6. Test Ulsan Jujeon Mongdol (id: 123)
    console.log("\n============================================================");
    console.log("6. 울산 주전몽돌 (id: 123) Safety 검증:");
    console.log("============================================================");
    const ulsanEval = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const pt = (window.SNORKY_ACTIVE_POINTS || []).find(p => p.id === 123);
          const safety = window.SNORKYMarineSafety;
          const st = safety.statusForPoint(pt);
          return {
            id: pt?.id,
            name: pt?.name,
            code: pt?.warningAreaCode,
            status: st.status,
            reason: st.reason
          };
        })()
      `,
      returnByValue: true
    });
    console.log("울산 주전몽돌 결과:", JSON.stringify(ulsanEval?.result?.value, null, 2));

  } finally {
    chrome.kill('SIGTERM');
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

main().catch(console.error);
