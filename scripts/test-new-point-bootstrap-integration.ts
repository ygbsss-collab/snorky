async function testNewPointBootstrap() {
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const functionUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/point-evaluation-refresh";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
    "Content-Type": "application/json"
  };

  console.log("=== Testing 1 Point On-Demand Bootstrap & Evaluation Generation ===");

  // Trigger evaluation for single point (Point 4: 영진해변)
  const refreshRes = await fetch(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ pointIds: [4] })
  });

  const refreshData = await refreshRes.json();
  console.log(`• Refresh API Response: HTTP ${refreshRes.status}, Success: ${refreshData.successful_points} point(s), Upserted: ${refreshData.total_records_upserted}`);

  // Query DB results for Point 4 across all modes
  const point4ResultsRes = await fetch(`${restUrl}/point_evaluation_results?point_id=eq.4&order=target_date.asc,forecast_time.asc`, { headers });
  const rows = await point4ResultsRes.json();

  const modeCounts: Record<string, number> = {};
  for (const r of rows) {
    modeCounts[r.mode] = (modeCounts[r.mode] || 0) + 1;
  }

  console.log("\n[Point 4 DB Stored Results Breakdown]");
  console.log(`• TODAY (대표 1건): ${modeCounts["TODAY"] || 0}건`);
  console.log(`• TODAY_HOURLY (7개 슬롯): ${modeCounts["TODAY_HOURLY"] || 0}건`);
  console.log(`• SHORT (15개 슬롯): ${modeCounts["SHORT"] || 0}건`);
  console.log(`• MID (6개 슬롯): ${modeCounts["MID"] || 0}건`);
  console.log(`• Total Stored Slots: ${rows.length} / 29건`);

  console.log("\n[Point 4 Sample Result Values]");
  const todayRow = rows.find((r: any) => r.mode === "TODAY");
  if (todayRow) {
    console.log(`• TODAY: target_date=${todayRow.target_date}, slot=${todayRow.forecast_time}, score=${todayRow.condition_score ?? "--"}, safety=${todayRow.safety_status}, condition=${todayRow.condition_status}`);
  }
  const midRow = rows.find((r: any) => r.mode === "MID");
  if (midRow) {
    console.log(`• MID Sample: target_date=${midRow.target_date}, slot=${midRow.forecast_time}, score=${midRow.condition_score ?? "--"}, safety=${midRow.safety_status}`);
  }
}

testNewPointBootstrap().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
