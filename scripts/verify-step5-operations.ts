async function runStep5Verification() {
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const functionBase = "https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
    "Content-Type": "application/json",
  };

  console.log("=== Running Step 5 Live Operation Verifications ===");

  // Target point for tests
  const targetPointId = 22; // 초곡항·문암해변

  // --------------------------------------------------------------------------
  // Verification 1 & 2: Cache Refresh & Automatic Evaluation Trigger
  // --------------------------------------------------------------------------
  console.log("\n[1 & 2] Testing Cache Refresh & Automatic Re-Evaluation...");
  
  // 1-A. Get baseline evaluated_at
  const baselineRes = await fetch(`${restUrl}/point_evaluation_results?point_id=eq.${targetPointId}&select=evaluated_at,point_updated_at&limit=1`, { headers });
  const baselineRows = await baselineRes.json();
  const beforeEvalAt = baselineRows[0]?.evaluated_at || "N/A";
  console.log(`• Before evaluated_at: ${beforeEvalAt}`);

  // Wait 1 second to ensure timestamp difference
  await new Promise(r => setTimeout(r, 1000));

  // 1-B. Trigger RN1 Cache fetch & store
  const rn1Res = await fetch(`${functionBase}/kma-rn1-cache`, {
    method: "POST",
    headers,
    body: JSON.stringify({ nx: 92, ny: 132 })
  });
  console.log(`• RN1 Cache Endpoint HTTP: ${rn1Res.status}`);

  // Trigger evaluation refresh for point
  const reEvalRes = await fetch(`${functionBase}/point-evaluation-refresh`, {
    method: "POST",
    headers,
    body: JSON.stringify({ point_ids: [targetPointId] })
  });
  console.log(`• Evaluation Refresh Endpoint HTTP: ${reEvalRes.status}`);

  // 1-C. Check new evaluated_at
  const afterEvalRes = await fetch(`${restUrl}/point_evaluation_results?point_id=eq.${targetPointId}&select=evaluated_at,point_updated_at&limit=1`, { headers });
  const afterEvalRows = await afterEvalRes.json();
  const afterEvalAt = afterEvalRows[0]?.evaluated_at || "N/A";
  console.log(`• After evaluated_at:  ${afterEvalAt}`);
  const cacheEvalPass = afterEvalAt !== beforeEvalAt && afterEvalAt !== "N/A";
  console.log(`• Cache Re-evaluation: ${cacheEvalPass ? "PASS (Timestamp Updated)" : "FAIL"}`);

  // --------------------------------------------------------------------------
  // Verification 3: Admin Point Profile Save & Re-evaluation
  // --------------------------------------------------------------------------
  console.log("\n[3] Testing Admin Point Profile Save & Re-evaluation...");

  const beforePointRes = await fetch(`${restUrl}/points?id=eq.${targetPointId}&select=updated_at`, { headers });
  const beforePointRows = await beforePointRes.json();
  const beforePointUpdated = beforePointRows[0]?.updated_at || "N/A";
  console.log(`• Before point updated_at: ${beforePointUpdated}`);

  await new Promise(r => setTimeout(r, 1000));

  // Simulate admin save -> triggers point-evaluation-refresh with [targetPointId]
  const adminSaveEvalRes = await fetch(`${functionBase}/point-evaluation-refresh`, {
    method: "POST",
    headers,
    body: JSON.stringify({ point_ids: [targetPointId] })
  });
  const adminSaveEvalData = await adminSaveEvalRes.json();
  console.log(`• Admin Save Re-evaluation HTTP: ${adminSaveEvalRes.status}, Status: ${adminSaveEvalData.details?.[0]?.status}`);

  const afterPointEvalRes = await fetch(`${restUrl}/point_evaluation_results?point_id=eq.${targetPointId}&select=evaluated_at,point_updated_at&limit=1`, { headers });
  const afterPointEvalRows = await afterPointEvalRes.json();
  const afterPointEvalAt = afterPointEvalRows[0]?.evaluated_at || "N/A";
  console.log(`• After point evaluated_at: ${afterPointEvalAt}`);
  const adminEvalPass = adminSaveEvalData.ok && adminSaveEvalData.details?.[0]?.status === "SUCCESS";
  console.log(`• Admin Profile Save Re-evaluation: ${adminEvalPass ? "PASS" : "FAIL"}`);

  // --------------------------------------------------------------------------
  // Verification 4: KST 00:01 Midnight Date Switch Full Batch Evaluation
  // --------------------------------------------------------------------------
  console.log("\n[4] Testing Midnight Date Switch Full Batch Evaluation...");

  const midnightBatchRes = await fetch(`${functionBase}/point-evaluation-refresh`, {
    method: "POST",
    headers,
    body: JSON.stringify({ source: "supabase-cron", reason: "daily-date-switch" })
  });
  const midnightBatchData = await midnightBatchRes.json();
  console.log(`• Midnight Batch HTTP: ${midnightBatchRes.status}`);
  console.log(`• Total Points: ${midnightBatchData.total_points}`);
  console.log(`• Successful Points: ${midnightBatchData.successful_points}`);
  console.log(`• Failed Points: ${midnightBatchData.failed_points}`);
  console.log(`• Total Records Upserted: ${midnightBatchData.total_records_upserted}`);

  const expectedSlots = midnightBatchData.total_points * 22;
  const midnightPass = midnightBatchRes.ok &&
    midnightBatchData.ok &&
    midnightBatchData.failed_points === 0 &&
    midnightBatchData.total_records_upserted === expectedSlots;

  console.log(`• Midnight Batch Result: ${midnightPass ? "PASS (100% Full Batch Synchronized)" : "FAIL"}`);

  console.log("\n========================================================");
  console.log("ALL 4 OPERATIONAL VERIFICATIONS COMPLETE!");
  console.log("========================================================");
}

runStep5Verification();
