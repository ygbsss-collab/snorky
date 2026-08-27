const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";

async function checkDeployment() {
  console.log("=== Supabase 운영 Edge Function (kma-warnings) 상태 및 배포 여부 확인 ===");
  
  // 1. GET /functions/v1/kma-warnings
  const edgeRes = await fetch("https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-warnings", {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }
  });
  const edgeJson = await edgeRes.json();
  console.log("[1] Edge Function GET 응답:", JSON.stringify(edgeJson, null, 2));

  // 2. Query kma_api_request_log
  const logRes = await fetch(`${restUrl}/kma_api_request_log?select=*&order=request_timestamp.desc&limit=3`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }
  });
  const logs = await logRes.json();
  console.log("\n[2] 최근 KMA 요청 로그:", JSON.stringify(logs, null, 2));

  // 3. Query kma_safety_cache
  const cacheRes = await fetch(`${restUrl}/kma_safety_cache?select=*&order=fetched_at.desc&limit=1`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }
  });
  const cache = await cacheRes.json();
  console.log("\n[3] 최신 캐시 레코드:", JSON.stringify(cache, null, 2));
}

checkDeployment().catch(console.error);
