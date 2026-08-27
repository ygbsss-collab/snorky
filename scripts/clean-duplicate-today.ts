async function cleanDuplicateToday() {
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const functionUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/point-evaluation-refresh";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
    "Content-Type": "application/json"
  };

  console.log("=== Cleaning Duplicate TODAY Row & Re-syncing ===");

  // 1. Delete id 1 (stale initial test row)
  const delRes = await fetch(`${restUrl}/point_evaluation_results?id=eq.1`, {
    method: "DELETE",
    headers
  });
  console.log(`• Delete stale test row id=1: HTTP ${delRes.status}`);

  // 2. Re-deploy point-evaluation-refresh with fixed TODAY bounds
  // Then invoke batch refresh
  const batchRes = await fetch(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ source: "fix-bounds" })
  });
  const batchData = await batchRes.json();
  console.log(`• Batch evaluation refresh: HTTP ${batchRes.status}, Total points: ${batchData.total_points}, Upserted: ${batchData.total_records_upserted}`);

  // 3. Verify total TODAY rows
  const verifyRes = await fetch(`${restUrl}/point_evaluation_results?mode=eq.TODAY&select=id,point_id`, { headers });
  const verifyRows = await verifyRes.json();
  console.log(`• Total points in DB: 61`);
  console.log(`• Total TODAY rows in point_evaluation_results: ${verifyRows.length} (Expected: exactly 61)`);

  if (verifyRows.length === 61) {
    console.log("\nALL 61 POINTS HAVE EXACTLY 1 TODAY ROW (1:1 CORRESPONDENCE VERIFIED)!");
  } else {
    console.error(`Mismatch: expected 61, got ${verifyRows.length}`);
    process.exit(1);
  }
}

cleanDuplicateToday();
