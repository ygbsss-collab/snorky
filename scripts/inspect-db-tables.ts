async function inspectDbTables() {
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
    "Content-Type": "application/json"
  };

  const tables = [
    "open_meteo_marine_cache",
    "kma_weather_cache",
    "kma_safety_cache",
    "kma_rn1_cache",
    "kma_mid_weather_cache"
  ];

  for (const t of tables) {
    const res = await fetch(`${restUrl}/${t}?limit=1`, { headers });
    const data = await res.json();
    console.log(`Table '${t}': HTTP ${res.status}, Sample:`, Array.isArray(data) && data.length > 0 ? Object.keys(data[0]) : data);
  }
}

inspectDbTables();
