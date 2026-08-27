const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
const headers = {
  "apikey": publishableKey,
  "Authorization": `Bearer ${publishableKey}`,
  "Content-Type": "application/json"
};

async function main() {
  console.log("==================================================");
  console.log("=== 해상특보 UNKNOWN 원인 분석 정밀 진단 스크립트 ===");
  console.log("==================================================");

  // 1. 포인트별 warning_area_code 확인 (특히 문암해변)
  const pointsRes = await fetch(`${restUrl}/snorky_points?order=id.asc&select=id,name,region,region_id,warning_area_code`, { headers });
  const points = await pointsRes.json();
  console.log("\n[1] 포인트별 warning_area_code:");
  if (Array.isArray(points)) {
    points.forEach(p => {
      console.log(`• ID ${p.id} [${p.name}] - region: "${p.region}", warning_area_code: "${p.warning_area_code}"`);
    });
  } else {
    console.log("Points error:", points);
  }

  // 2. kma_safety_cache 테이블의 최신 레코드 확인
  const cacheRes = await fetch(`${restUrl}/kma_safety_cache?order=fetched_at.desc&limit=5&select=*`, { headers });
  const cacheRows = await cacheRes.json();
  console.log("\n[2] kma_safety_cache 레코드 수:", Array.isArray(cacheRows) ? cacheRows.length : 0);
  if (Array.isArray(cacheRows) && cacheRows.length > 0) {
    cacheRows.forEach((r, i) => {
      console.log(`\n--- Cache Row ${i + 1} ---`);
      console.log(`• id: ${r.id}`);
      console.log(`• source_issued_at: ${r.source_issued_at}`);
      console.log(`• fetched_at: ${r.fetched_at}`);
      console.log(`• status: ${r.status}`);
      console.log(`• stale: ${r.stale}`);
      console.log(`• http_status: ${r.http_status}`);
      console.log(`• warning_payload:`, JSON.stringify(r.warning_payload));
      console.log(`• normalized_warnings:`, JSON.stringify(r.normalized_warnings, null, 2));
      console.log(`• warning_index:`, JSON.stringify(r.warning_index, null, 2));
    });
  } else {
    console.log("Cache rows empty or error:", cacheRows);
  }

  // 3. kma_api_request_log의 최근 warnings 호출 이력 확인
  const logRes = await fetch(`${restUrl}/kma_api_request_log?api_name=eq.warnings&order=request_timestamp.desc&limit=5&select=*`, { headers });
  const logs = await logRes.json();
  console.log("\n[3] kma_api_request_log (warnings) 최근 5건:");
  if (Array.isArray(logs)) {
    logs.forEach((l, i) => {
      console.log(`• Log ${i + 1}: ${l.request_timestamp} | HTTP ${l.http_status} | outcome: ${l.outcome} | completed_at: ${l.completed_at}`);
    });
  } else {
    console.log("Logs empty or error:", logs);
  }

  // 4. point_evaluation_results의 safety_status 확인
  const evalRes = await fetch(`${restUrl}/point_evaluation_results?point_id=eq.22&order=evaluated_at.desc&limit=5&select=id,point_id,target_date,mode,period_start,safety_status,safety_reasons,evaluated_at`, { headers });
  const evals = await evalRes.json();
  console.log("\n[4] 문암해변(22)의 최근 evaluation safety_status:");
  if (Array.isArray(evals)) {
    evals.forEach(e => {
      console.log(`• [${e.mode}] ${e.target_date} ${e.period_start} -> safety_status: ${e.safety_status}, reasons: ${JSON.stringify(e.safety_reasons)} (eval at ${e.evaluated_at})`);
    });
  } else {
    console.log("Evals error:", evals);
  }
}

main().catch(console.error);
