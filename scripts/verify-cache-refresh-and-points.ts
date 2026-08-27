async function verifyCacheRefreshAndPoints() {
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const functionUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/point-evaluation-refresh";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
    "Content-Type": "application/json"
  };

  console.log("=== Running Batch Re-evaluation with Fixed Cache Queries ===");

  // 1. Trigger Refresh
  const refreshRes = await fetch(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ source: "cache-query-fix-test" })
  });
  const refreshData = await refreshRes.json();
  console.log(`• Refresh Status: HTTP ${refreshRes.status}, Upserted: ${refreshData.total_records_upserted}`);

  // 2. Fetch Points Master to match names
  const pointsRes = await fetch(`${restUrl}/points?select=id,name,lat,lng,region_id&order=id.asc`, { headers });
  const pointsList = await pointsRes.json();
  const pointMap = new Map((pointsList || []).map((p: any) => [Number(p.id), p]));

  // 3. Query all 61 TODAY rows
  const todayRes = await fetch(`${restUrl}/point_evaluation_results?mode=eq.TODAY&order=point_id.asc`, { headers });
  const todayRows = await todayRes.json();

  let readyCount = 0;
  let partialCount = 0;
  let unknownCount = 0;
  let scoreValidCount = 0;
  let bestCandidateCount = 0;

  let yeongjinRow: any = null;
  let yeongjinPoint: any = null;

  todayRows.forEach((r: any) => {
    if (r.quality_status === "READY") readyCount++;
    else if (r.quality_status === "PARTIAL") partialCount++;
    else if (r.quality_status === "UNKNOWN") unknownCount++;

    if (r.condition_score !== null && r.condition_score !== undefined) {
      scoreValidCount++;
    }

    if (r.safety_status === "PASS" && r.condition_score !== null && r.condition_score !== undefined) {
      bestCandidateCount++;
    }

    const p = pointMap.get(Number(r.point_id));
    if (p && String(p.name).includes("영진해변")) {
      yeongjinRow = r;
      yeongjinPoint = p;
    }
  });

  console.log(`\n[TODAY 61 Points Summary]`);
  console.log(`• Total TODAY Rows: ${todayRows.length} / 61`);
  console.log(`• Quality Breakdown: READY=${readyCount}, PARTIAL=${partialCount}, UNKNOWN=${unknownCount}`);
  console.log(`• Valid Condition Score: ${scoreValidCount} / 61`);
  console.log(`• BEST Filter Candidates (PASS & score!=null): ${bestCandidateCount}`);

  console.log(`\n[영진해변 Evaluation Detail]`);
  if (yeongjinRow && yeongjinPoint) {
    const m = yeongjinRow.metrics || {};
    console.log(`• Point ID: ${yeongjinPoint.id} (${yeongjinPoint.name})`);
    console.log(`• Wave Height (Hs): ${m.wave_height ?? "--"} m`);
    console.log(`• Current Speed: ${m.current_speed ?? "--"} m/s`);
    console.log(`• Wind Speed: ${m.wind_speed ?? "--"} m/s`);
    console.log(`• Condition Score: ${yeongjinRow.condition_score ?? "--"} 점`);
    console.log(`• Condition Status: ${yeongjinRow.condition_status}`);
    console.log(`• Safety Status: ${yeongjinRow.safety_status} (${yeongjinRow.safety_reasons?.join(", ") || "None"})`);
    console.log(`• Recommendation: ${yeongjinRow.recommendation}`);
    console.log(`• Visibility Grade: ${yeongjinRow.visibility_grade} (${yeongjinRow.visibility_score ?? "--"} 점)`);
  } else {
    console.log("• 영진해변 row not found!");
  }

  // Top 5 BEST Candidates
  const scored = todayRows
    .filter((r: any) => r.safety_status === "PASS" && r.condition_score !== null)
    .sort((a: any, b: any) => b.condition_score - a.condition_score)
    .slice(0, 5);

  console.log(`\n[Top 5 Today BEST Candidates]`);
  scored.forEach((s: any, idx: number) => {
    const pt = pointMap.get(Number(s.point_id));
    console.log(`  ${idx + 1}. ${pt?.name || s.point_id}: ${s.condition_score}점 | ${s.condition_status} | 파고 ${s.metrics?.wave_height ?? "--"}m | 시야 ${s.visibility_grade}`);
  });
}

verifyCacheRefreshAndPoints();
