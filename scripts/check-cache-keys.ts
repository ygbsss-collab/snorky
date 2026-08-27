async function checkCacheKeys() {
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const functionBaseUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
    "Content-Type": "application/json"
  };

  // Get Point 4 (영진해변)
  const pointRes = await fetch(`${restUrl}/points?id=eq.4`, { headers });
  const [point4] = await pointRes.json();
  console.log("Point 4:", point4);

  // Let's call open-meteo-marine-cache for Point 4
  const marineRes = await fetch(`${functionBaseUrl}/open-meteo-marine-cache?pointId=4&latitude=${point4.lat}&longitude=${point4.lng}`, { headers });
  const marineData = await marineRes.json();
  console.log("Marine response for Point 4:", {
    status: marineData.status,
    cacheStatus: marineData.cacheStatus,
    cacheKey: marineData.cacheKey,
    lastSuccessfulAt: marineData.lastSuccessfulAt,
    hourlyLength: marineData.hourly?.time?.length || 0,
    sampleHourly: marineData.hourly ? {
      time0: marineData.hourly.time?.[0],
      wave0: marineData.hourly.wave_height?.[0],
      current0: marineData.hourly.ocean_current_velocity?.[0]
    } : null
  });

  // Check how cacheKey was computed
  const lat = Number(point4.lat);
  const lng = Number(point4.lng);
  console.log("lat.toFixed(4):lng.toFixed(4) =", `${lat.toFixed(4)}:${lng.toFixed(4)}`);
  console.log("marineData.cacheKey =", marineData.cacheKey);
}

checkCacheKeys();
