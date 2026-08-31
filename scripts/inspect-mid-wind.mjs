const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";

async function main() {
  // 1. 포인트 1개 조회
  const pRes = await fetch(`${restUrl}/points?select=id,name&limit=1`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }
  });
  const points = await pRes.json();
  const point = points[0];
  console.log("=== 표본 포인트 ===", point);

  // 2. MID evaluation results 조회
  const res = await fetch(`${restUrl}/point_evaluation_results?point_id=eq.${point.id}&mode=eq.MID&order=period_start.asc`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }
  });
  const midRows = await res.json();
  console.log(`=== MID Rows (${midRows.length}개) ===`);
  for (const r of midRows) {
    console.log({
      target_date: r.target_date,
      period_start: r.period_start,
      wind_speed: r.wind_speed,
      wind_direction: r.wind_direction,
      wave_height: r.wave_height,
      water_temperature: r.water_temperature,
      metrics: r.metrics
    });
  }
}

main().catch(console.error);
