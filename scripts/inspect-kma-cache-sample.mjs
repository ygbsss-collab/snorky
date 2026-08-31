const supabaseUrl = "https://vqpkckonpsnzhuwuybav.supabase.co";
const apiKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";

async function run() {
  const res = await fetch(`${supabaseUrl}/rest/v1/kma_weather_cache?select=*&limit=3`, {
    headers: {
      "apikey": apiKey,
      "Authorization": `Bearer ${apiKey}`
    }
  });
  const data = await res.json();
  console.log("kma_weather_cache response:", Array.isArray(data) ? `Array(${data.length})` : data);
  if (Array.isArray(data) && data.length > 0) {
    const r = data[0];
    console.log("Sample cache keys:", Object.keys(r));
    console.log("grid_key / nx / ny:", { grid_key: r.grid_key, nx: r.nx, ny: r.ny, base_date: r.base_date, base_time: r.base_time, forecast_at: r.forecast_at });
    console.log("hourly count:", r.forecast_data?.hourly?.length);
    console.log("Sample hourly item 12시:", r.forecast_data?.hourly?.find(h => h.datetime?.includes("T12:")));
    console.log("Sample hourly item 15시:", r.forecast_data?.hourly?.find(h => h.datetime?.includes("T15:")));
    console.log("Sample hourly item 18시:", r.forecast_data?.hourly?.find(h => h.datetime?.includes("T18:")));
  }
}

run();
