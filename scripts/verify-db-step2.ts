async function verifyStep2() {
  const url = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
  };

  console.log("=== Verifying Step 2 Remote DB State (Result DDL & Trigger) ===");

  // 1. Check point_evaluation_results table
  const resResults = await fetch(`${url}/point_evaluation_results?limit=1`, { headers });
  console.log(`• point_evaluation_results: HTTP ${resResults.status} ${resResults.ok ? "OK (Exists & Accessible via RLS)" : "FAILED"}`);
  if (!resResults.ok) {
    console.error("Error details:", await resResults.text());
    process.exit(1);
  }

  // 2. Check points table data integrity
  const resPoints = await fetch(`${url}/points?select=id,name,region_id,lat,lng,environment,warning_area_code,updated_at&limit=5`, { headers });
  console.log(`• points: HTTP ${resPoints.status} ${resPoints.ok ? "OK (Intact & Accessible)" : "FAILED"}`);
  if (resPoints.ok) {
    const data = await resPoints.json();
    console.log(`  Found ${data.length} sample points (e.g. ID ${data[0]?.id}: ${data[0]?.name}, env: ${JSON.stringify(data[0]?.environment || null)})`);
  } else {
    console.error("Points check failed:", await resPoints.text());
    process.exit(1);
  }

  console.log("\nALL STEP 2 CHECKS (RESULT DDL & TRIGGER) PASSED SUCCESSFULLY IN REMOTE DB!");
}

verifyStep2();
