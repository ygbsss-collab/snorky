async function inspectHomeBestIssue() {
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
    "Content-Type": "application/json"
  };

  console.log("=== Inspecting Home BEST Data Issue ===");

  // 1. Check RLS SELECT via publishableKey (anon)
  const anonRes = await fetch(`${restUrl}/point_evaluation_results?mode=eq.TODAY`, { headers });
  console.log(`• Anon Query HTTP Status: ${anonRes.status}`);
  const anonData = await anonRes.json();
  console.log(`• Anon Query Rows Count: ${Array.isArray(anonData) ? anonData.length : "ERROR: " + JSON.stringify(anonData)}`);

  // 2. Query all 61 TODAY rows
  if (Array.isArray(anonData)) {
    const todayTotal = anonData.length;
    let readyCount = 0;
    let partialCount = 0;
    let unknownQualityCount = 0;

    let passSafetyCount = 0;
    let blockSafetyCount = 0;
    let unknownSafetyCount = 0;

    let scoreNotNullCount = 0;
    let bestCandidateCount = 0;

    anonData.forEach((row: any) => {
      if (row.quality_status === "READY") readyCount++;
      else if (row.quality_status === "PARTIAL") partialCount++;
      else if (row.quality_status === "UNKNOWN") unknownQualityCount++;

      if (row.safety_status === "PASS") passSafetyCount++;
      else if (row.safety_status === "BLOCK") blockSafetyCount++;
      else if (row.safety_status === "UNKNOWN") unknownSafetyCount++;

      if (row.condition_score !== null && row.condition_score !== undefined) {
        scoreNotNullCount++;
      }

      // Best candidate criteria: safety_status === 'PASS' && condition_score !== null
      if (row.safety_status === "PASS" && row.condition_score !== null && row.condition_score !== undefined) {
        bestCandidateCount++;
      }
    });

    console.log(`• TODAY Total: ${todayTotal}`);
    console.log(`• Quality Breakdown: READY=${readyCount}, PARTIAL=${partialCount}, UNKNOWN=${unknownQualityCount}`);
    console.log(`• Safety Breakdown: PASS=${passSafetyCount}, BLOCK=${blockSafetyCount}, UNKNOWN=${unknownSafetyCount}`);
    console.log(`• Condition Score IS NOT NULL: ${scoreNotNullCount}`);
    console.log(`• BEST Filter Passed (PASS & Score!=null): ${bestCandidateCount}`);

    // Check sample rows to see why safety/quality is what it is
    if (anonData.length > 0) {
      console.log("\n• Sample Row 1:", {
        point_id: anonData[0].point_id,
        target_date: anonData[0].target_date,
        mode: anonData[0].mode,
        period_start: anonData[0].period_start,
        quality_status: anonData[0].quality_status,
        safety_status: anonData[0].safety_status,
        safety_reasons: anonData[0].safety_reasons,
        condition_score: anonData[0].condition_score,
        condition_status: anonData[0].condition_status,
        metrics: anonData[0].metrics
      });
    }
  }
}

inspectHomeBestIssue();
