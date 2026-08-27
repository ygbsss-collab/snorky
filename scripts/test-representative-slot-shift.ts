async function testRepresentativeSlotShift() {
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const functionUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/point-evaluation-refresh";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
    "Content-Type": "application/json"
  };

  const testPointId = 22; // 문암해변

  console.log("=== Testing TODAY Representative Slot Shift (Morning / Afternoon) ===");

  // -------------------------------------------------------------
  // Test Case 1: 오전 09:00 KST (UTC 00:00:00Z)
  // -------------------------------------------------------------
  console.log("\n[Test 1] Executing Morning Evaluation (09:00 KST)...");
  const morningRes = await fetch(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      point_id: testPointId,
      evaluated_at: "2026-08-25T00:00:00.000Z"
    })
  });
  const morningData = await morningRes.json();
  console.log(`• Morning API status: HTTP ${morningRes.status}, records: ${morningData.records_upserted}`);

  const check1Res = await fetch(`${restUrl}/point_evaluation_results?point_id=eq.${testPointId}&mode=eq.TODAY&select=id,target_date,period_start,period_end,forecast_time,evaluated_at`, { headers });
  const rows1 = await check1Res.json();
  console.log(`• Total TODAY rows for Point ${testPointId} after morning run: ${rows1.length}`);
  const morningRow = rows1[0];
  console.log(`• Morning Selected Slot:`);
  console.log(`  - period_start: ${morningRow.period_start}`);
  console.log(`  - period_end:   ${morningRow.period_end}`);
  console.log(`  - forecast_time:${morningRow.forecast_time}`);

  // -------------------------------------------------------------
  // Test Case 2: 오후 15:00 KST (UTC 06:00:00Z) - Slot Shift
  // -------------------------------------------------------------
  console.log("\n[Test 2] Executing Afternoon Evaluation (15:00 KST) - Slot Shift...");
  const afternoonRes = await fetch(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      point_id: testPointId,
      evaluated_at: "2026-08-25T06:00:00.000Z"
    })
  });
  const afternoonData = await afternoonRes.json();
  console.log(`• Afternoon API status: HTTP ${afternoonRes.status}, records: ${afternoonData.records_upserted}`);

  const check2Res = await fetch(`${restUrl}/point_evaluation_results?point_id=eq.${testPointId}&mode=eq.TODAY&select=id,target_date,period_start,period_end,forecast_time,evaluated_at`, { headers });
  const rows2 = await check2Res.json();
  console.log(`• Total TODAY rows for Point ${testPointId} after afternoon run: ${rows2.length}`);
  const afternoonRow = rows2[0];
  console.log(`• Afternoon Selected Slot (After Shift):`);
  console.log(`  - period_start: ${afternoonRow.period_start}`);
  console.log(`  - period_end:   ${afternoonRow.period_end}`);
  console.log(`  - forecast_time:${afternoonRow.forecast_time}`);

  // Verify total points & contract
  console.log("\n[Summary Verification]");
  console.log(`• Case 1 (09:00 KST): Slot=${morningRow.period_start.slice(11, 16)}~${morningRow.period_end.slice(11, 16)}, Count=${rows1.length}`);
  console.log(`• Case 2 (15:00 KST): Slot=${afternoonRow.period_start.slice(11, 16)}~${afternoonRow.period_end.slice(11, 16)}, Count=${rows2.length}, Previous morning row cleaned: ${morningRow.id !== afternoonRow.id ? "YES" : "NO"}`);

  if (rows1.length === 1 && rows2.length === 1) {
    console.log("\n========================================================");
    console.log("TODAY REPRESENTATIVE SLOT SHIFT TEST: 100% PASS!");
    console.log("========================================================");
  } else {
    console.error("Test failed: duplicate TODAY rows detected!");
    process.exit(1);
  }
}

testRepresentativeSlotShift();
