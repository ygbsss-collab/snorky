async function verifyStep1() {
  const url = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
  };

  console.log("=== Verifying Step 1 Remote DB State via REST API ===");

  const tables = [
    "kma_rn1_cache",
    "kasi_sun_times_cache",
    "kma_mid_weather_cache",
    "points",
    "open_meteo_marine_cache"
  ];

  for (const table of tables) {
    const res = await fetch(`${url}/${table}?limit=1`, { headers });
    const status = res.status;
    console.log(`• ${table}: HTTP ${status} ${res.ok ? "OK (Exists & Accessible via RLS)" : "FAILED"}`);
    if (!res.ok) {
      const errText = await res.text();
      console.error(`Error details for ${table}:`, errText);
      process.exit(1);
    }
  }

  console.log("\nALL 3 NEW CACHE TABLES VERIFIED SUCCESSFULLY IN REMOTE DB!");
}

verifyStep1();
