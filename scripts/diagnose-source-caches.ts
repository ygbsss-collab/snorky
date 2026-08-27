async function diagnoseSourceCaches() {
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const functionBaseUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
    "Content-Type": "application/json"
  };

  console.log("=== Diagnosing Source Caches & Pipeline Execution ===");

  // 1. Test invoking open-meteo-marine-cache Edge Function directly for a sample point
  console.log("\n1. Testing Edge Functions...");
  let marineEdgeStatus = 0;
  let marineEdgeData: any = null;
  try {
    const res = await fetch(`${functionBaseUrl}/open-meteo-marine-cache?pointId=22&latitude=38.334&longitude=128.535`, { headers });
    marineEdgeStatus = res.status;
    marineEdgeData = await res.json();
    console.log(`• open-meteo-marine-cache: HTTP ${marineEdgeStatus}`, {
      status: marineEdgeData.status,
      cacheStatus: marineEdgeData.cacheStatus,
      hourlyKeys: marineEdgeData.hourly ? Object.keys(marineEdgeData.hourly) : null
    });
  } catch (err: any) {
    console.error("• open-meteo-marine-cache error:", err.message);
  }

  // 2. Test kma-weather-cache
  let kmaEdgeStatus = 0;
  let kmaEdgeData: any = null;
  try {
    const res = await fetch(`${functionBaseUrl}/kma-weather-cache?nx=87&ny=141`, { headers });
    kmaEdgeStatus = res.status;
    kmaEdgeData = await res.json();
    console.log(`• kma-weather-cache: HTTP ${kmaEdgeStatus}`, {
      status: kmaEdgeData.status,
      baseDate: kmaEdgeData.baseDate,
      baseTime: kmaEdgeData.baseTime
    });
  } catch (err: any) {
    console.error("• kma-weather-cache error:", err.message);
  }

  // 3. Test open-meteo-marine-refresh
  try {
    const res = await fetch(`${functionBaseUrl}/open-meteo-marine-refresh`, {
      method: "POST",
      headers,
      body: JSON.stringify({ source: "diag-test" })
    });
    const data = await res.json();
    console.log(`• open-meteo-marine-refresh: HTTP ${res.status}`, data);
  } catch (err: any) {
    console.error("• open-meteo-marine-refresh error:", err.message);
  }

  // 4. Test kma-weather-refresh
  try {
    const res = await fetch(`${functionBaseUrl}/kma-weather-refresh`, {
      method: "POST",
      headers,
      body: JSON.stringify({ source: "diag-test" })
    });
    const data = await res.json();
    console.log(`• kma-weather-refresh: HTTP ${res.status}`, data);
  } catch (err: any) {
    console.error("• kma-weather-refresh error:", err.message);
  }
}

diagnoseSourceCaches();
