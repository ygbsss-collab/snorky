async function checkPointsCount() {
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` };

  const [ptsRes, resultsRes] = await Promise.all([
    fetch(`${restUrl}/points?select=id,name,region_id,updated_at&order=id.asc`, { headers }),
    fetch(`${restUrl}/point_evaluation_results?mode=eq.TODAY&select=point_id,target_date&order=point_id.asc`, { headers })
  ]);

  const points = await ptsRes.json();
  const results = await resultsRes.json();

  console.log(`• Points count in points table: ${points.length}`);
  console.log(`• TODAY rows in point_evaluation_results: ${results.length}`);

  const pointIds = new Set(points.map((p: any) => p.id));
  const orphanResults = results.filter((r: any) => !pointIds.has(r.point_id));
  console.log(`• Orphan results (not in points table): ${orphanResults.length}`, orphanResults);

  const resultPointIds = new Set(results.map((r: any) => r.point_id));
  const missingResults = points.filter((p: any) => !resultPointIds.has(p.id));
  console.log(`• Points without TODAY results: ${missingResults.length}`, missingResults);
}

checkPointsCount();
