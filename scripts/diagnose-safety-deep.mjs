const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
const edgeUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1";
const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";

const headers = {
  "apikey": publishableKey,
  "Authorization": `Bearer ${publishableKey}`
};

async function main() {
  console.log("================================================================================");
  console.log("=== [1] GET /functions/v1/kma-warnings 직접 호출 (Edge Function 상태 확인) ===");
  console.log("================================================================================");
  try {
    const res = await fetch(`${edgeUrl}/kma-warnings`, { headers });
    console.log(`HTTP Status: ${res.status} ${res.statusText}`);
    const json = await res.json();
    console.log("kma-warnings 응답 전체:", JSON.stringify(json, null, 2));
  } catch (e) {
    console.error("kma-warnings 호출 실패:", e);
  }

  console.log("\n================================================================================");
  console.log("=== [2] DB kma_safety_cache 테이블 최근 5건 조회 ===");
  console.log("================================================================================");
  try {
    const res = await fetch(`${restUrl}/kma_safety_cache?select=*&order=fetched_at.desc&limit=5`, { headers });
    console.log(`HTTP Status: ${res.status}`);
    const rows = await res.json();
    console.log(`조회 건수: ${rows?.length}`);
    if (Array.isArray(rows)) {
      for (const r of rows) {
        console.log(`• ID: ${r.id} | Status: ${r.status} | Stale: ${r.stale} | FetchedAt: ${r.fetched_at} | LastSuccess: ${r.last_successful_at} | HTTP: ${r.http_status} | Warnings: ${r.normalized_warnings?.length}건`);
        console.log(`  - warning_index:`, JSON.stringify(r.warning_index));
      }
    }
  } catch (e) {
    console.error("kma_safety_cache 조회 실패:", e);
  }

  console.log("\n================================================================================");
  console.log("=== [3] DB kma_api_request_log 테이블 최근 10건 조회 ===");
  console.log("================================================================================");
  try {
    const res = await fetch(`${restUrl}/kma_api_request_log?provider=eq.KMA&api_name=eq.warnings&select=*&order=request_timestamp.desc&limit=10`, { headers });
    console.log(`HTTP Status: ${res.status}`);
    const rows = await res.json();
    if (Array.isArray(rows)) {
      for (const r of rows) {
        console.log(`• Log ID: ${r.id} | Timestamp: ${r.request_timestamp} | HTTP: ${r.http_status} | Outcome: ${r.outcome}`);
      }
    }
  } catch (e) {
    console.error("kma_api_request_log 조회 실패:", e);
  }

  console.log("\n================================================================================");
  console.log("=== [4] DB points 테이블에서 문암해변 및 전체 포인트 특보구역 코드 확인 ===");
  console.log("================================================================================");
  try {
    const res = await fetch(`${restUrl}/points?select=id,name,region,warning_area_code,lat,lng&order=id.asc`, { headers });
    const pts = await res.json();
    console.log(`전체 포인트 수: ${pts?.length}`);
    const munam = pts?.find(p => p.id === 22 || p.name?.includes("문암"));
    console.log("문암해변 정보:", munam);
    
    // 특보구역 코드 목록 집계
    const areaCodes = new Set(pts?.map(p => p.warning_area_code));
    console.log("고유 특보구역 코드 목록:", [...areaCodes]);
  } catch (e) {
    console.error("points 조회 실패:", e);
  }
}

main().catch(console.error);
