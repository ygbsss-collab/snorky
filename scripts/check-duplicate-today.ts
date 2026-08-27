async function checkDuplicateToday() {
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` };

  const res = await fetch(`${restUrl}/point_evaluation_results?mode=eq.TODAY&select=id,point_id,target_date,period_start,period_end,evaluated_at`, { headers });
  const rows = await res.json();

  const countByPoint = new Map();
  rows.forEach((r: any) => {
    const arr = countByPoint.get(r.point_id) || [];
    arr.push(r);
    countByPoint.set(r.point_id, arr);
  });

  for (const [pointId, list] of countByPoint.entries()) {
    if (list.length > 1) {
      console.log(`Point ID ${pointId} has ${list.length} TODAY rows:`, list);
    }
  }
}

checkDuplicateToday();
