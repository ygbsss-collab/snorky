async function testTodayHourlyScrubber() {
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const functionUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/point-evaluation-refresh";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
    "Content-Type": "application/json"
  };

  const testPointId = 22; // 문암해변

  console.log("=== Testing Today Hourly Scrubber Server Integration ===");

  // 1. Run Full Batch Refresh
  console.log("\n1. Running Batch Refresh for All 61 Points with TODAY_HOURLY...");
  const refreshRes = await fetch(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ source: "today-hourly-test" })
  });
  const refreshData = await refreshRes.json();
  console.log(`• Batch Refresh Status: HTTP ${refreshRes.status}`);
  console.log(`• Total Points: ${refreshData.total_points}`);
  console.log(`• Total Upserted Records: ${refreshData.total_records_upserted} (Expected: 61 * 29 = 1769)`);

  // 2. Query TODAY_HOURLY rows for single point
  console.log(`\n2. Querying TODAY_HOURLY Slots for Point ${testPointId}...`);
  const hourlyRes = await fetch(
    `${restUrl}/point_evaluation_results?point_id=eq.${testPointId}&mode=eq.TODAY_HOURLY&order=period_start.asc&select=id,point_id,target_date,mode,slot_index,period_start,period_end,forecast_time,condition_score,condition_status,safety_status,visibility_grade,metrics`,
    { headers }
  );
  const hourlyRows = await hourlyRes.json();
  console.log(`• Point ${testPointId} TODAY_HOURLY slots count: ${hourlyRows.length} (Expected: 7)`);

  const expectedHours = [3, 6, 9, 12, 15, 18, 21];
  const loadedHours: number[] = [];

  hourlyRows.forEach((r: any, idx: number) => {
    const hour = new Date(r.period_start).getHours();
    loadedHours.push(hour);
    console.log(`  [Slot ${idx}] Hour ${String(hour).padStart(2, "0")}:00 -> Score: ${r.condition_score ?? "--"}, Status: ${r.condition_status}, Safety: ${r.safety_status}, Visibility: ${r.visibility_grade}`);
  });

  const hoursMatch = expectedHours.every(h => loadedHours.includes(h));
  console.log(`• Expected 7 Hours [03, 06, 09, 12, 15, 18, 21]: ${hoursMatch ? "ALL MATCH ✅" : "MISMATCH ❌"}`);

  // 3. Verify Entire DB Count by Mode
  console.log("\n3. Verifying Entire DB Mode Breakdown (61 Points)...");
  const [todayAll, hourlyAll, shortAll, midAll] = await Promise.all([
    fetch(`${restUrl}/point_evaluation_results?mode=eq.TODAY&select=id`, { headers }).then(r => r.json()),
    fetch(`${restUrl}/point_evaluation_results?mode=eq.TODAY_HOURLY&select=id`, { headers }).then(r => r.json()),
    fetch(`${restUrl}/point_evaluation_results?mode=eq.SHORT&select=id`, { headers }).then(r => r.json()),
    fetch(`${restUrl}/point_evaluation_results?mode=eq.MID_MARINE_ONLY&select=id`, { headers }).then(r => r.json()),
  ]);

  console.log(`• TODAY (Representative 1):      ${todayAll.length} (Expected: 61)`);
  console.log(`• TODAY_HOURLY (7 Scrubber):     ${hourlyAll.length} (Expected: 61 * 7 = 427)`);
  console.log(`• SHORT (+1~+3, 15 slots):       ${shortAll.length} (Expected: 61 * 15 = 915)`);
  console.log(`• MID_MARINE_ONLY (+4~+6, 6 slots): ${midAll.length} (Expected: 61 * 6 = 366)`);
  console.log(`• Total All Records in DB:       ${todayAll.length + hourlyAll.length + shortAll.length + midAll.length} (Expected: 1769)`);

  const allExact = todayAll.length === 61 &&
                   hourlyAll.length === 427 &&
                   shortAll.length === 915 &&
                   midAll.length === 366;

  if (allExact && hourlyRows.length === 7 && hoursMatch) {
    console.log("\n========================================================");
    console.log("TODAY HOURLY SCRUBBER SERVER INTEGRATION: 100% PASS!");
    console.log("========================================================");
  } else {
    console.error("Mismatch in record counts or slot hours!");
    process.exit(1);
  }
}

testTodayHourlyScrubber();
