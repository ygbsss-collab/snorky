async function cleanOldTodayRows() {
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
    "Content-Type": "application/json"
  };

  console.log("=== Cleaning Old Hourly TODAY Rows ===");

  // Delete any TODAY row where period_start is NOT 2026-08-25T00:00:00+09:00
  // In UTC that's 2026-08-24T15:00:00+00:00 or ISO string with +09:00
  const fetchRes = await fetch(`${restUrl}/point_evaluation_results?mode=eq.TODAY&select=id,period_start,evaluated_at&order=id.asc`, { headers });
  const allToday = await fetchRes.json();
  console.log(`Total TODAY rows before cleanup: ${allToday.length}`);

  // Find the newest 61 rows (one per point) or rows with standard start
  // Let's group by point_id and delete all but the latest
  const fetchByPointRes = await fetch(`${restUrl}/point_evaluation_results?mode=eq.TODAY&select=id,point_id,evaluated_at,period_start&order=evaluated_at.desc`, { headers });
  const rows = await fetchByPointRes.json();

  const keptByPoint = new Set();
  const toDeleteIds: number[] = [];

  for (const r of rows) {
    if (!keptByPoint.has(r.point_id)) {
      keptByPoint.add(r.point_id);
    } else {
      toDeleteIds.push(r.id);
    }
  }

  console.log(`Keeping latest ${keptByPoint.size} rows. Deleting ${toDeleteIds.length} obsolete rows...`);

  for (const id of toDeleteIds) {
    await fetch(`${restUrl}/point_evaluation_results?id=eq.${id}`, {
      method: "DELETE",
      headers
    });
  }

  // Final check
  const checkRes = await fetch(`${restUrl}/point_evaluation_results?mode=eq.TODAY&select=id,point_id`, { headers });
  const checkRows = await checkRes.json();
  console.log(`• Final active points in points table: 61`);
  console.log(`• Final TODAY rows in point_evaluation_results: ${checkRows.length}`);
}

cleanOldTodayRows();
