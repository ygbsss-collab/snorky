const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";

async function main() {
  // 1. points 테이블 확인 (대나리방파제 id 확인)
  const pRes = await fetch(`${restUrl}/points?name=ilike.*대나리*&select=*`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }
  });
  const points = await pRes.json();
  console.log("=== 대나리방파제 Point ===", JSON.stringify(points, null, 2));

  // 2. evaluation_source_caches 테이블 조회 (혹시 여기에 저장되어 있는지)
  const scRes = await fetch(`${restUrl}/evaluation_source_caches?limit=10`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }
  });
  if (scRes.ok) {
    const scData = await scRes.json();
    console.log("=== evaluation_source_caches ===", scData.map(d => ({ source_key: d.source_key, fetched_at: d.fetched_at })));
  } else {
    console.log("evaluation_source_caches status:", scRes.status);
  }

  // 3. kma_weather_cache 조회
  const kwRes = await fetch(`${restUrl}/kma_weather_cache?limit=5`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }
  });
  if (kwRes.ok) {
    const kwData = await kwRes.json();
    console.log("=== kma_weather_cache count:", kwData.length);
    if (kwData.length) console.log("Sample:", Object.keys(kwData[0]));
  }
}

main().catch(console.error);
