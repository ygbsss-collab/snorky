import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://vqpkckonpsnzhuwuybav.supabase.co";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxcGtja29ucHNuemh1d3V5YmF2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTcwNjAxMSwiZXhwIjoyMDg3MjgyMDExfQ.12t223e74M9zL9Nf6D8l7p4m2J1k1K5z1q1W2e3R4t5";
const client = createClient(supabaseUrl, serviceRoleKey);

function degreeToKoreanWindDirection(deg: number | null | undefined): string {
  if (deg === null || deg === undefined || !Number.isFinite(Number(deg))) return "--";
  const d = (Number(deg) % 360 + 360) % 360;
  const directions = ["북풍", "북북동풍", "북동풍", "동북동풍", "동풍", "동남동풍", "남동풍", "남남동풍", "남풍", "남남서풍", "남서풍", "서남서풍", "서풍", "서북서풍", "북서풍", "북북서풍"];
  const index = Math.round(d / 22.5) % 16;
  return directions[index];
}

async function run() {
  console.log("1. Triggering point-evaluation-refresh for point_id=4 (영진해변)...");
  const refreshRes = await client.functions.invoke("point-evaluation-refresh", {
    body: { point_id: 4 }
  });
  console.log("Refresh response:", refreshRes.data);

  console.log("\n2. Checking KMA Cache Raw VEC...");
  const { data: kmaCache } = await client
    .from("kma_weather_cache")
    .select("forecast_data")
    .eq("grid_key", "92:132")
    .order("forecast_at", { ascending: false })
    .limit(1)
    .single();

  const sampleHourly = kmaCache?.forecast_data?.hourly?.[0];
  console.log("Sample KMA hourly item:", {
    datetime: sampleHourly?.datetime,
    windSpeed: sampleHourly?.windSpeed,
    windDirection: sampleHourly?.windDirection
  });

  console.log("\n3. Querying point_evaluation_results for point_id=4...");
  const { data: results, error } = await client
    .from("point_evaluation_results")
    .select("id, mode, target_date, forecast_time, period_start, metrics")
    .eq("point_id", 4)
    .order("mode")
    .order("period_start");

  if (error) {
    console.error("Query error:", error);
    return;
  }

  console.log(`Retrieved ${results.length} results.`);
  const modes = ["TODAY", "TODAY_HOURLY", "SHORT", "MID"];
  
  for (const m of modes) {
    const subset = results.filter(r => r.mode === m);
    console.log(`\n--- Mode: ${m} (${subset.length} rows) ---`);
    for (const row of subset.slice(0, 3)) {
      const metrics = (row.metrics || {}) as Record<string, any>;
      const deg = metrics.wind_direction_degree;
      const uiText = degreeToKoreanWindDirection(deg);
      console.log(`  [${row.mode}] time=${row.forecast_time || row.period_start} | wind_direction_degree=${deg} | UI 표시='${uiText}'`);
    }
  }
}

run();
