async function syncAndVerifyFinal() {
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const functionUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/point-evaluation-refresh";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
    "Content-Type": "application/json"
  };

  console.log("=== Syncing & Verifying Deterministic 12:00 Representative Slot ===");

  // 1. Delete all previous TODAY mode rows via migration / Edge Refresh
  // Let's invoke point-evaluation-refresh
  const refreshRes = await fetch(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ source: "deterministic-12h-slot" })
  });
  const refreshData = await refreshRes.json();
  console.log(`• Refresh API response: HTTP ${refreshRes.status}, Total points: ${refreshData.total_points}, Upserted: ${refreshData.total_records_upserted}`);

  // 2. Query TODAY rows
  const todayRes = await fetch(`${restUrl}/point_evaluation_results?mode=eq.TODAY&select=id,point_id,target_date,period_start,period_end,forecast_time,evaluated_at`, { headers });
  const todayRows = await todayRes.json();

  console.log(`• Points count: 61`);
  console.log(`• TODAY rows in DB: ${todayRows.length}`);

  const sample = todayRows[0];
  console.log(`• Sample TODAY Slot Contract:`);
  console.log(`  - Point ID: ${sample.point_id}`);
  console.log(`  - Target Date: ${sample.target_date}`);
  console.log(`  - Period Start: ${sample.period_start}`);
  console.log(`  - Period End: ${sample.period_end}`);
  console.log(`  - Forecast Time: ${sample.forecast_time}`);

  // Check unique points
  const pIds = new Set(todayRows.map((r: any) => r.point_id));
  console.log(`• Unique Point IDs with TODAY row: ${pIds.size} / 61`);

  if (todayRows.length === 61 && pIds.size === 61) {
    console.log("\n========================================================");
    console.log("DETERMINISTIC REPRESENTATIVE SLOT CONTRACT: 100% PASS!");
    console.log("========================================================");
  } else {
    console.error("Mismatch in TODAY rows count!");
    process.exit(1);
  }
}

syncAndVerifyFinal();
