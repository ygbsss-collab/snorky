const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";

async function verifyEdgeFunction() {
  const edgeRes = await fetch("https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-warnings", {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }
  });
  const data = await edgeRes.json();
  
  console.log("=== 운영 Supabase Edge Function (kma-warnings) 실호출 검증 ===");
  console.log("• status:", data.status);
  console.log("• stale:", data.stale);
  console.log("• updatedAt:", data.updatedAt);
  console.log("• parsedRowCount:", data.diagnostic?.outcome?.parsedRowCount);
  console.log("• normalizedWarningCount:", data.diagnostic?.outcome?.normalizedWarningCount);
  console.log("• warnings length:", data.warnings?.length);
  console.log("• warningIndex keys count:", Object.keys(data.warningIndex || {}).length);
  console.log("• Active warning areas:");
  data.warnings?.forEach((w, i) => {
    console.log(`  [${i+1}] ${w.regId} (${w.areaName}): ${w.warningName} ${w.levelName} (${w.cmd}) active=${w.active}`);
  });

  // Check Munam (S1151100)
  const munamActive = (data.warningIndex?.["S1151100"] || []).filter(w => w.active);
  console.log(`\n• 문암해변 (S1151100): active 특보 ${munamActive.length}건 -> ${munamActive.length === 0 ? "PASS (정상)" : "BLOCK"}`);

  // Check Jeju East (S1323200) or South (S1323300)
  const jejuEastActive = (data.warningIndex?.["S1323200"] || []).filter(w => w.active);
  console.log(`• 제주동부앞바다 (S1323200): active 특보 ${jejuEastActive.length}건 -> ${jejuEastActive.length > 0 ? "BLOCK (입수 제한)" : "PASS"}`);
  if (jejuEastActive.length) {
    console.log(`  - 사유: ${jejuEastActive.map(w => `${w.areaName} ${w.warningName}${w.levelName}`).join(", ")}`);
  }
}

verifyEdgeFunction().catch(console.error);
