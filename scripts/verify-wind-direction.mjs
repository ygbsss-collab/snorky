const supabaseUrl = "https://vqpkckonpsnzhuwuybav.supabase.co";
const apiKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";

function degreeToKoreanWindDirection(deg) {
  if (deg === null || deg === undefined || !Number.isFinite(Number(deg))) return "--";
  const d = (Number(deg) % 360 + 360) % 360;
  const directions = ["북풍", "북북동풍", "북동풍", "동북동풍", "동풍", "동남동풍", "남동풍", "남남동풍", "남풍", "남남서풍", "남서풍", "서남서풍", "서풍", "서북서풍", "북서풍", "북북서풍"];
  const index = Math.round(d / 22.5) % 16;
  return directions[index];
}

async function run() {
  console.log("1. Querying point_evaluation_results for point_id=4 (영진해변)...");
  const res = await fetch(`${supabaseUrl}/rest/v1/point_evaluation_results?point_id=eq.4&select=id,mode,target_date,forecast_time,period_start,metrics&order=mode,period_start`, {
    headers: {
      "apikey": apiKey,
      "Authorization": `Bearer ${apiKey}`
    }
  });
  const results = await res.json();
  if (!Array.isArray(results)) {
    console.error("Query failed:", results);
    return;
  }
  console.log(`Retrieved ${results.length} results.`);
  
  const modes = ["TODAY", "TODAY_HOURLY", "SHORT", "MID"];
  for (const m of modes) {
    const subset = results.filter(r => r.mode === m);
    console.log(`\n=== Mode: ${m} (${subset.length} rows) ===`);
    for (const row of subset) {
      const metrics = row.metrics || {};
      const deg = metrics.wind_direction_degree;
      const uiText = degreeToKoreanWindDirection(deg);
      console.log(`  [${row.mode}] slot=${row.forecast_time || row.period_start} | wind_direction_degree=${deg} (${typeof deg}) | UI표시='${uiText}' | metrics.wind_speed=${metrics.wind_speed}m/s`);
    }
  }

  console.log("\n2. Checking KMA Cache Raw VEC for Point 4 (nx:92, ny:132)...");
  const kmaRes = await fetch(`${supabaseUrl}/rest/v1/kma_weather_cache?grid_key=eq.92:132&select=forecast_data&order=forecast_at.desc&limit=1`, {
    headers: {
      "apikey": apiKey,
      "Authorization": `Bearer ${apiKey}`
    }
  });
  const kmaJson = await kmaRes.json();
  const hourlyArr = kmaJson?.[0]?.forecast_data?.hourly || [];
  console.log(`Found ${hourlyArr.length} hourly items in KMA cache.`);
  for (const h of hourlyArr.slice(0, 3)) {
    console.log(`  [KMA Raw] datetime=${h.datetime} | VEC(windDirection)=${h.windDirection} | WSD(windSpeed)=${h.windSpeed}`);
  }
}

run();
