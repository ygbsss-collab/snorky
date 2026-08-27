async function verifyFinalAllModes() {
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const functionUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/point-evaluation-refresh";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
    "Content-Type": "application/json"
  };

  console.log("=== Final All-Modes Verification (TODAY, TODAY_HOURLY, SHORT, MID) ===");

  // 1. Batch refresh
  const refreshRes = await fetch(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ source: "mid-mode-verify" })
  });
  const refreshData = await refreshRes.json();
  console.log(`• Batch Refresh Status: HTTP ${refreshRes.status}, total upserted: ${refreshData.total_records_upserted}`);

  // 2. Query distinct mode counts
  const [todayAll, hourlyAll, shortAll, midAll, oldMidAll] = await Promise.all([
    fetch(`${restUrl}/point_evaluation_results?mode=eq.TODAY&select=id`, { headers }).then(r => r.json()),
    fetch(`${restUrl}/point_evaluation_results?mode=eq.TODAY_HOURLY&select=id`, { headers }).then(r => r.json()),
    fetch(`${restUrl}/point_evaluation_results?mode=eq.SHORT&select=id`, { headers }).then(r => r.json()),
    fetch(`${restUrl}/point_evaluation_results?mode=eq.MID&select=id`, { headers }).then(r => r.json()),
    fetch(`${restUrl}/point_evaluation_results?mode=eq.MID_MARINE_ONLY&select=id`, { headers }).then(r => r.json()),
  ]);

  console.log("\n[DB Mode Breakdown (61 Points)]");
  console.log(`• mode = 'TODAY':        ${todayAll.length} / 61`);
  console.log(`• mode = 'TODAY_HOURLY': ${hourlyAll.length} / 427`);
  console.log(`• mode = 'SHORT':        ${shortAll.length} / 915`);
  console.log(`• mode = 'MID':          ${midAll.length} / 366`);
  console.log(`• mode = 'MID_MARINE_ONLY' (obsolete): ${oldMidAll.length} (Expected: 0)`);

  const total = todayAll.length + hourlyAll.length + shortAll.length + midAll.length;
  console.log(`• Total Active Records:   ${total} / 1769`);

  // Sample MID Slot check
  const sampleMidRes = await fetch(`${restUrl}/point_evaluation_results?mode=eq.MID&point_id=eq.22&order=period_start.asc&select=point_id,mode,target_date,slot_index,period_start,period_end,condition_score,condition_status,min_max_metrics`, { headers });
  const sampleMidRows = await sampleMidRes.json();
  console.log(`\n• Sample Point 22 MID Slots count: ${sampleMidRows.length} (Expected: 6)`);
  console.log(`• Sample MID Row: Mode=${sampleMidRows[0].mode}, Date=${sampleMidRows[0].target_date}, Status=${sampleMidRows[0].condition_status}, Range=${JSON.stringify(sampleMidRows[0].min_max_metrics || null)}`);

  const pass = todayAll.length === 61 &&
               hourlyAll.length === 427 &&
               shortAll.length === 915 &&
               midAll.length === 366 &&
               oldMidAll.length === 0 &&
               sampleMidRows.length === 6;

  if (pass) {
    console.log("\n========================================================");
    console.log("ALL MODES CONTRACT VERIFICATION: 100% PASS!");
    console.log("========================================================");
  } else {
    console.error("Verification failed!");
    process.exit(1);
  }
}

verifyFinalAllModes();
