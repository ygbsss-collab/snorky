async function runSinglePointEvaluation() {
  const functionUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/point-evaluation-refresh";
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";

  console.log("=== Testing Single Point Evaluation against Live Edge Function ===");

  // 1. Check available point id in DB
  const ptsRes = await fetch(`${restUrl}/points?select=id,name&limit=1`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }
  });
  const pts = await ptsRes.json();
  const targetPointId = pts[0]?.id || 22;
  const targetPointName = pts[0]?.name || "Test Point";
  console.log(`Target point: ID ${targetPointId} (${targetPointName})`);

  // 2. Invoke deployed point-evaluation-refresh Edge Function
  const evalRes = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": publishableKey,
      "Authorization": `Bearer ${publishableKey}`
    },
    body: JSON.stringify({ point_ids: [targetPointId] })
  });

  console.log(`HTTP Status: ${evalRes.status}`);
  const evalData = await evalRes.json();
  console.log("Edge Response:", JSON.stringify(evalData, null, 2));

  if (!evalRes.ok || !evalData.ok) {
    console.error("Edge evaluation invocation failed!");
    process.exit(1);
  }

  // 3. Query point_evaluation_results from Remote DB
  const queryRes = await fetch(
    `${restUrl}/point_evaluation_results?point_id=eq.${targetPointId}&select=mode,target_date,period_start,period_end,safety_status,quality_status,condition_status,condition_score,visibility_grade,recommendation,source_issue_time`,
    {
      headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }
    }
  );
  const rows = await queryRes.json();
  if (!Array.isArray(rows)) {
    console.error("Error querying point_evaluation_results:", rows);
    process.exit(1);
  }

  console.log(`\nStored rows in DB for point ${targetPointId}: ${rows.length} rows`);

  const todayRows = rows.filter((r: any) => r.mode === "TODAY");
  const shortRows = rows.filter((r: any) => r.mode === "SHORT");
  const midRows = rows.filter((r: any) => r.mode === "MID_MARINE_ONLY");

  console.log(`• TODAY rows: ${todayRows.length} (Expected: 1)`);
  console.log(`• SHORT rows: ${shortRows.length} (Expected: 15)`);
  console.log(`• MID rows:   ${midRows.length} (Expected: 6)`);
  console.log(`• Total rows: ${rows.length} (Expected: 22)`);

  const samples = [
    { mode: "TODAY", sample: todayRows[0] },
    { mode: "SHORT", sample: shortRows[0] },
    { mode: "MID_MARINE_ONLY", sample: midRows[0] }
  ];
  console.log("\nSample Slot Results:");
  console.log(JSON.stringify(samples, null, 2));

  if (todayRows.length === 1 && shortRows.length === 15 && midRows.length === 6 && rows.length === 22) {
    console.log("\n========================================================");
    console.log("SINGLE POINT EVALUATION VERIFIED 100% PERFECTLY (22/22)!");
    console.log("========================================================");
  } else {
    console.error("Slot count mismatch!");
    process.exit(1);
  }
}

runSinglePointEvaluation();
