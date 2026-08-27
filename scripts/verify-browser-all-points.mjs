import puppeteer from 'puppeteer';
import path from 'path';

async function main() {
  console.log("=== 브라우저 실제 환경 검증 시작 ===");
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915 }); // Mobile viewport

  console.log("1. http://127.0.0.1:8089/ 접속 중...");
  await page.goto("http://127.0.0.1:8089/", { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for points and safety
  console.log("2. Supabase 포인트 및 KMA Safety 데이터 로드 대기 중...");
  await page.waitForFunction(() => {
    return window.SNORKY_ACTIVE_POINTS &&
           window.SNORKY_ACTIVE_POINTS.length >= 59 &&
           window.SNORKYMarineSafety &&
           window.SNORKYMarineSafety.getSafetyStatus &&
           window.SNORKYMarineSafety.getSafetyStatus()?.status === "READY";
  }, { timeout: 20000 });

  // 3. Evaluate points and safety
  const results = await page.evaluate(() => {
    const points = window.SNORKY_ACTIVE_POINTS || [];
    const safety = window.SNORKYMarineSafety;
    const safetyStatus = safety.getSafetyStatus();

    const evaluations = points.map(p => {
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

    const blockList = evaluations.filter(e => e.status === "BLOCK");
    const passList = evaluations.filter(e => e.status === "PASS");
    const unknownList = evaluations.filter(e => e.status === "UNKNOWN");

    // Check banner DOM
    const banner = document.getElementById("homeMarineWarning");
    const bannerComputedStyle = banner ? window.getComputedStyle(banner) : null;
    const bannerVisible = banner && !banner.hidden && bannerComputedStyle.display !== "none";
    const bannerText = banner ? banner.innerText : "";

    return {
      totalPoints: points.length,
      safetyStatusReady: safetyStatus.status === "READY",
      blockList,
      passCount: passList.length,
      unknownCount: unknownList.length,
      bannerExists: !!banner,
      bannerVisible,
      bannerText,
      bannerHiddenAttr: banner ? banner.hidden : null,
      bannerDisplay: bannerComputedStyle ? bannerComputedStyle.display : null
    };
  });

  console.log("\n=== 포인트 안전상태 판정 결과 ===");
  console.log("총 포인트 수:", results.totalPoints);
  console.log("Safety 캐시 상태:", results.safetyStatusReady ? "READY (정상)" : "비정상");
  console.log("PASS 포인트 수:", results.passCount);
  console.log("BLOCK 포인트 수:", results.blockList.length);
  console.log("UNKNOWN 포인트 수:", results.unknownCount);

  console.log("\n=== BLOCK 포인트 목록 ===");
  results.blockList.forEach(b => {
    console.log(` - [ID ${b.id}] ${b.name} (${b.regionName}) | 구역코드: ${b.warningAreaCode} | 사유: ${b.reason}`);
  });

  console.log("\n=== 홈 해상특보 배너(#homeMarineWarning) 상태 ===");
  console.log("배너 노출 여부 (Visible):", results.bannerVisible);
  console.log("배너 텍스트:", results.bannerText);
  console.log("배너 hidden 속성:", results.bannerHiddenAttr);
  console.log("배너 display 스타일:", results.bannerDisplay);

  // Take screenshot of home
  const homeScreenshot = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\83ad0068-7358-4dca-b8ba-09e105e2dbcc\\.tempmediaStorage\\home_warning_verified.png';
  await page.screenshot({ path: homeScreenshot });
  console.log("\n홈 화면 스크린샷 저장:", homeScreenshot);

  // 4. Test "확인하기" click -> Map with warning filter
  console.log("\n4. '확인하기' 클릭 테스트...");
  const clickResult = await page.evaluate(() => {
    const banner = document.getElementById("homeMarineWarning");
    if (!banner) return { error: "No banner" };
    banner.click();
    return {
      activeTab: window.currentTab || "unknown",
      mapFilter: window.snorkyMapActiveFilter,
      filteredPointsCount: typeof window.getFilteredPoints === "function" ? window.getFilteredPoints().length : -1,
      filteredPointNames: typeof window.getFilteredPoints === "function" ? window.getFilteredPoints().map(p => p.name) : []
    };
  });

  console.log("클릭 후 지도 상태:", clickResult);
  await new Promise(r => setTimeout(r, 1000));
  const mapScreenshot = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\83ad0068-7358-4dca-b8ba-09e105e2dbcc\\.tempmediaStorage\\map_warning_filter_verified.png';
  await page.screenshot({ path: mapScreenshot });
  console.log("지도 화면 스크린샷 저장:", mapScreenshot);

  // 5. Test Point Detail for Jeju Test (id: 132)
  console.log("\n5. 제주test (id: 132) 상세 모달 진입 테스트...");
  const detailResult = await page.evaluate(async () => {
    const pt = (window.SNORKY_ACTIVE_POINTS || []).find(p => p.id === 132 || p.name === "제주test");
    if (!pt) return { error: "No jeju point" };
    
    if (window.SNORKYTodayConditionDetail && typeof window.SNORKYTodayConditionDetail.open === "function") {
      window.SNORKYTodayConditionDetail.open(pt);
      // wait a bit
      await new Promise(r => setTimeout(r, 1500));
      
      const badge = document.getElementById("todaySafetyBadge") || document.querySelector(".today-detail-safety-badge");
      const title = document.getElementById("todayPointName");
      const warningArea = document.getElementById("todaySafetyWarningArea");
      const score = document.getElementById("todayConditionScore");
      
      return {
        pointName: title?.textContent,
        safetyBadgeText: badge?.textContent,
        warningAreaText: warningArea?.textContent,
        conditionScoreHidden: score?.textContent === "--" || score?.textContent === "" || !score?.offsetParent
      };
    }
    return { error: "No detail modal function" };
  });

  console.log("제주test 상세 모달 결과:", detailResult);
  const detailScreenshot = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\83ad0068-7358-4dca-b8ba-09e105e2dbcc\\.tempmediaStorage\\jeju_detail_modal_verified.png';
  await page.screenshot({ path: detailScreenshot });
  console.log("제주 상세 모달 스크린샷 저장:", detailScreenshot);

  await browser.close();
  console.log("\n=== 모든 브라우저 검증 완료 ===");
}

main().catch(console.error);
