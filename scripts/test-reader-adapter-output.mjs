const supabaseUrl = "https://vqpkckonpsnzhuwuybav.supabase.co";
const apiKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";

function getSkyWeatherText(skyCode, ptyCode) {
  if (ptyCode === 1 || ptyCode === 4) return "비";
  if (ptyCode === 2) return "비/눈";
  if (ptyCode === 3) return "눈";
  if (String(skyCode) === "1") return "맑음";
  if (String(skyCode) === "3") return "구름많음";
  if (String(skyCode) === "4") return "흐림";
  return "--";
}

async function run() {
  const todayDate = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  
  // 1. loadTodayResults (상단용)
  const todayRes = await fetch(`${supabaseUrl}/rest/v1/point_evaluation_results?point_id=eq.4&mode=eq.TODAY&target_date=eq.${todayDate}&select=*`, {
    headers: { "apikey": apiKey, "Authorization": `Bearer ${apiKey}` }
  });
  const todayRows = await todayRes.json();
  const todayRow = todayRows[0];

  // 2. loadTodayHourly (하단 스크러버용)
  const hourlyRes = await fetch(`${supabaseUrl}/rest/v1/point_evaluation_results?point_id=eq.4&mode=eq.TODAY_HOURLY&target_date=eq.${todayDate}&select=*&order=period_start`, {
    headers: { "apikey": apiKey, "Authorization": `Bearer ${apiKey}` }
  });
  const hourlyRows = await hourlyRes.json();

  console.log("=== Reader Adapter Verification for Point 4 (영진해변) ===");
  console.log(`TODAY Row: 1건 (forecast_time: ${todayRow?.forecast_time})`);
  console.log(`TODAY_HOURLY Rows: ${hourlyRows?.length}건 (03, 06, 09, 12, 15, 18, 21시)`);

  const slots = [
    { name: "상단 현재 슬롯 (TODAY)", row: todayRow },
    { name: "12시 슬롯 (TODAY_HOURLY)", row: hourlyRows.find(r => new Date(r.period_start).getHours() === 12) },
    { name: "15시 슬롯 (TODAY_HOURLY)", row: hourlyRows.find(r => new Date(r.period_start).getHours() === 15) },
    { name: "18시 슬롯 (TODAY_HOURLY)", row: hourlyRows.find(r => new Date(r.period_start).getHours() === 18) },
  ];

  for (const s of slots) {
    const m = s.row?.metrics || {};
    const weather = getSkyWeatherText(m.sky_code, m.precipitation_type);
    const temp = m.temperature !== null && m.temperature !== undefined ? `${m.temperature}°C` : "--";
    const precip = m.precipitation !== null && m.precipitation !== undefined ? `${m.precipitation}mm` : "0mm (강수없음)";
    const pop = m.precipitation_probability !== null && m.precipitation_probability !== undefined ? `${m.precipitation_probability}%` : "--";
    
    console.log(`\n[${s.name}]`);
    console.log(`  • 날씨: ${weather} (SKY:${m.sky_code}, PTY:${m.precipitation_type})`);
    console.log(`  • 기온: ${temp}`);
    console.log(`  • 강수량: ${precip}`);
    console.log(`  • 강수확률: ${pop}`);
    console.log(`  • metrics 원본:`, JSON.stringify(m));
  }
}

run();
