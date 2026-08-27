async function inspectMarineCache() {
  const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
    "Content-Type": "application/json"
  };

  const marineRes = await fetch(`${restUrl}/marine_forecast_cache?select=point_id,forecast_date,issue_time,hourly,updated_at&limit=5`, { headers });
  const marineRows = await marineRes.json();
  console.log(`• Marine Cache Rows Count: ${Array.isArray(marineRows) ? marineRows.length : "ERROR: " + JSON.stringify(marineRows)}`);
  if (Array.isArray(marineRows) && marineRows.length > 0) {
    console.log("• Sample Marine Row:", {
      point_id: marineRows[0].point_id,
      forecast_date: marineRows[0].forecast_date,
      issue_time: marineRows[0].issue_time,
      updated_at: marineRows[0].updated_at,
      hourly_sample: marineRows[0].hourly ? Object.keys(marineRows[0].hourly) : null,
      hourly_time_sample: marineRows[0].hourly?.time ? marineRows[0].hourly.time.slice(0, 5) : null
    });
  }

  // Also check kma_village_forecast_cache
  const kmaRes = await fetch(`${restUrl}/kma_village_forecast_cache?select=grid_x,grid_y,base_date,base_time,hourly,updated_at&limit=3`, { headers });
  const kmaRows = await kmaRes.json();
  console.log(`• KMA Village Cache Rows Count: ${Array.isArray(kmaRows) ? kmaRows.length : "ERROR: " + JSON.stringify(kmaRows)}`);
}

inspectMarineCache();
