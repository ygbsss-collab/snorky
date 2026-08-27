async function diagnoseDbCacheContents() {
  const functionUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/point-evaluation-refresh";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
    "Content-Type": "application/json"
  };

  // We can write a diagnostic check within a temporary script or query via point-evaluation-refresh debug payload if supported,
  // or we can test using an edge function call.
  // Let's call open-meteo-marine-cache and kma-weather-cache to check their cache hits!
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";

  console.log("=== Checking Cache Status via Edge Functions ===");

  // 1. Marine Cache Test for point 22 (lat: 38.3344, lng: 128.535)
  const marineRes = await fetch(`https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/open-meteo-marine-cache?pointId=22&latitude=38.3344&longitude=128.535`, { headers });
  const marineData = await marineRes.json();
  console.log("• Marine Cache for Point 22:", {
    status: marineData.status,
    cacheStatus: marineData.cacheStatus,
    cacheKey: marineData.cacheKey,
    lastSuccessfulAt: marineData.lastSuccessfulAt,
    hourlyLength: marineData.hourly?.time?.length || 0
  });

  // 2. KMA Weather Cache Test for nx=87, ny=141
  const kmaRes = await fetch(`https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-weather-cache?nx=87&ny=141`, { headers });
  const kmaData = await kmaRes.json();
  console.log("• KMA Weather Cache for (87, 141):", {
    status: kmaData.status,
    cacheStatus: kmaData.cacheStatus,
    baseDate: kmaData.baseDate,
    baseTime: kmaData.baseTime,
    lastSuccessfulAt: kmaData.lastSuccessfulAt
  });
}

diagnoseDbCacheContents();
