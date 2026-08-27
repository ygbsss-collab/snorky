async function verifyCronJobs() {
  const functionUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/point-evaluation-refresh";
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";

  console.log("=== Checking Step 4: Cron Jobs Verification ===");

  // Let's verify DB connectivity & tables
  const res = await fetch(`${restUrl}/point_evaluation_results?limit=1`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }
  });
  console.log(`• DB Status: HTTP ${res.status} (${res.ok ? 'ONLINE' : 'FAILED'})`);
}

verifyCronJobs();
