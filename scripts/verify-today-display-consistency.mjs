const supabaseUrl = "https://vqpkckonpsnzhuwuybav.supabase.co";
const apiKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";

function degreeToKoreanWindDirection(deg) {
  if (!Number.isFinite(Number(deg))) return "--";
  const d = (Number(deg) % 360 + 360) % 360;
  const directions = ["북풍", "북북동풍", "북동풍", "동북동풍", "동풍", "동남동풍", "남동풍", "남남동풍", "남풍", "남남서풍", "남서풍", "서남서풍", "서풍", "서북서풍", "북서풍", "북북서풍"];
  const index = Math.round(d / 22.5) % 16;
  return directions[index];
}

function getWeatherLabel(skyCode, precipType, precip) {
  if (precipType === 1 || precipType === 4 || (precip && precip > 0.5)) return "비";
  if (precipType === 2) return "비/눈";
  if (precipType === 3) return "눈";
  if (String(skyCode) === "4") return "흐림";
  if (String(skyCode) === "3") return "구름많음";
  if (String(skyCode) === "1") return "맑음";
  return "--";
}

function fmt(num, digits = 1) {
  if (!Number.isFinite(Number(num))) return "--";
  return Number(num).toFixed(digits);
}

async function run() {
  const todayDate = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const res = await fetch(`${supabaseUrl}/rest/v1/point_evaluation_results?point_id=eq.4&target_date=eq.${todayDate}&select=*&order=period_start`, {
    headers: { "apikey": apiKey, "Authorization": `Bearer ${apiKey}` }
  });
  const results = await res.json();

  const todayRow = results.find(r => r.mode === "TODAY");
  const hourlyRows = results.filter(r => r.mode === "TODAY_HOURLY");
  const getKstHour = (dtStr) => {
    if (!dtStr) return -1;
    const dt = new Date(dtStr);
    const kst = new Date(dt.getTime() + 9 * 3600000);
    return kst.getUTCHours();
  };

  const row12 = hourlyRows.find(r => getKstHour(r.period_start) === 12);
  const row15 = hourlyRows.find(r => getKstHour(r.period_start) === 15);
  const row18 = hourlyRows.find(r => getKstHour(r.period_start) === 18);

  const extract = (row) => {
    if (!row) return {};
    const m = row.metrics || {};
    const sky = row.sky_code ?? m.sky_code;
    const pty = row.precipitation_type ?? m.precipitation_type;
    const precip = row.precipitation ?? m.precipitation;
    const precipProb = row.precipitation_probability ?? m.precipitation_probability;
    const temp = row.temperature ?? m.temperature;
    const wave = row.wave_height ?? m.wave_height;
    const wind = row.wind_speed ?? m.wind_speed;
    const period = row.wave_period ?? m.wave_period;
    const seaTemp = row.sea_temperature ?? m.sea_temperature;
    const current = row.current_speed ?? m.current_speed;
    const windDeg = row.wind_direction_degree ?? m.wind_direction_degree;
    const visScore = row.visibility_score ?? m.visibility_score;
    const visGrade = row.visibility_grade ?? m.visibility_grade;

    return {
      weather: getWeatherLabel(sky, pty, precip),
      temp: Number.isFinite(temp) ? `${Math.round(temp)}°C` : "--",
      precip: precip === 0 ? "0mm" : Number.isFinite(precip) ? `${fmt(precip, 1)}mm` : "--",
      precipProb: Number.isFinite(precipProb) ? `${Math.round(precipProb)}%` : "--",
      wave: Number.isFinite(wave) ? `${fmt(wave, 1)}m` : "--",
      wind: Number.isFinite(wind) ? `${fmt(wind, 1)}m/s` : "--",
      period: Number.isFinite(period) ? `${fmt(period, 1)}초` : "--",
      seaTemp: Number.isFinite(seaTemp) ? `${fmt(seaTemp, 1)}°C` : "--",
      current: Number.isFinite(current) ? `${fmt(current, 2)}m/s` : "--",
      windDir: Number.isFinite(windDeg) ? `${degreeToKoreanWindDirection(windDeg)} (${Math.round(windDeg)}°)` : "--",
      vis: Number.isFinite(visScore) ? `${Math.round(visScore)}점 (${visGrade})` : "--",
    };
  };

  const t = extract(todayRow);
  const h12 = extract(row12);
  const h15 = extract(row15);
  const h18 = extract(row18);

  const items = [
    { name: "날씨 (SKY/PTY)", t: t.weather, h12: h12.weather, h15: h15.weather, h18: h18.weather, ui: "아이콘 + 한글 라벨" },
    { name: "기온", t: t.temp, h12: h12.temp, h15: h15.temp, h18: h18.temp, ui: "정수 표기 (°)" },
    { name: "강수량 (PCP)", t: t.precip, h12: h12.precip, h15: h15.precip, h18: h18.precip, ui: "0이면 0mm / 결측 --" },
    { name: "강수확률 (POP)", t: t.precipProb, h12: h12.precipProb, h15: h15.precipProb, h18: h18.precipProb, ui: "% 표기" },
    { name: "유의파고", t: t.wave, h12: h12.wave, h15: h15.wave, h18: h18.wave, ui: "m 표기" },
    { name: "풍속 (해상)", t: t.wind, h12: h12.wind, h15: h15.wind, h18: h18.wind, ui: "m/s 표기" },
    { name: "파주기", t: t.period, h12: h12.period, h15: h15.period, h18: h18.period, ui: "초 표기" },
    { name: "수온", t: t.seaTemp, h12: h12.seaTemp, h15: h15.seaTemp, h18: h18.seaTemp, ui: "°C 표기" },
    { name: "조류/유속", t: t.current, h12: h12.current, h15: h15.current, h18: h18.current, ui: "m/s 표기" },
    { name: "풍향 (해상)", t: t.windDir, h12: h12.windDir, h15: h15.windDir, h18: h18.windDir, ui: "16방위 변환 표기" },
    { name: "예상 수중시야", t: t.vis, h12: h12.vis, h15: h15.vis, h18: h18.vis, ui: "점수 + 등급 (V1.5 §21)" },
  ];

  console.log("=== Verification Table ===");
  console.log("항목 | TODAY 현재값 | 12시 | 15시 | 18시 | UI 표시 | PASS/FAIL");
  for (const it of items) {
    const pass = it.t !== "--" && it.h12 !== "--" && it.h15 !== "--" && it.h18 !== "--";
    console.log(`${it.name} | ${it.t} | ${it.h12} | ${it.h15} | ${it.h18} | ${it.ui} | ${pass ? "PASS ✅" : "FAIL ❌"}`);
  }
}

run();
