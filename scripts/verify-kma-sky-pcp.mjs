const supabaseUrl = "https://vqpkckonpsnzhuwuybav.supabase.co";
const apiKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";

function getWeatherIconInfo(row) {
  const ptyCode = Number(row?.precipitation_type ?? row?.precipitation_type_code ?? row?.pty ?? 0);
  const skyCode = Number(row?.sky_code);
  const precip = row?.precipitation;

  if (ptyCode === 1) return { icon: "rainy", label: "비", color: "#60a5fa" };
  if (ptyCode === 2) return { icon: "weather_mix", label: "비/눈", color: "#60a5fa" };
  if (ptyCode === 3) return { icon: "ac_unit", label: "눈", color: "#60a5fa" };
  if (ptyCode === 4) return { icon: "thunderstorm", label: "소나기", color: "#60a5fa" };
  if (ptyCode === 5) return { icon: "rainy", label: "빗방울", color: "#60a5fa" };
  if (ptyCode === 6) return { icon: "weather_mix", label: "빗방울/눈날림", color: "#60a5fa" };
  if (ptyCode === 7) return { icon: "ac_unit", label: "눈날림", color: "#60a5fa" };
  if (ptyCode > 0 || (Number.isFinite(precip) && precip > 0.5)) return { icon: "rainy", label: "비", color: "#60a5fa" };

  if (skyCode === 4) return { icon: "cloud", label: "흐림", color: "#94a3b8" };
  if (skyCode === 3) return { icon: "partly_cloudy_day", label: "구름많음", color: "#38bdf8" };
  if (skyCode === 1) return { icon: "sunny", label: "맑음", color: "#f59e0b" };

  return { icon: "sunny", label: "맑음", color: "#f59e0b" };
}

function formatRainAmount(precip) {
  if (precip === 0) return "0mm";
  if (Number.isFinite(precip)) return `${precip.toFixed(1)}mm`;
  return "--";
}

async function run() {
  console.log("=== 1. Refreshing point-evaluation-refresh for Point 4 ===");
  const refreshRes = await fetch(`${supabaseUrl}/functions/v1/point-evaluation-refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({ pointIds: [4] })
  });
  const refreshReport = await refreshRes.json();
  console.log("Refresh ok:", refreshReport.ok);

  console.log("\n=== 2. Reading point_evaluation_results ===");
  const todayDate = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const resultsRes = await fetch(`${supabaseUrl}/rest/v1/point_evaluation_results?point_id=eq.4&target_date=eq.${todayDate}&select=*&order=period_start`, {
    headers: { "apikey": apiKey, "Authorization": `Bearer ${apiKey}` }
  });
  const results = await resultsRes.json();

  const todayRow = results.find(r => r.mode === "TODAY");
  const hourlyRows = results.filter(r => r.mode === "TODAY_HOURLY");

  const testCases = [
    { label: "상단 (현재 시각 기준 TODAY)", row: todayRow, expectedSky: "구름많음", expectedPcp: "0mm" },
    { label: "12시 (TODAY_HOURLY)", row: hourlyRows.find(r => new Date(r.period_start).getHours() === 12), expectedSky: "구름많음", expectedPcp: "0mm" },
    { label: "18시 (TODAY_HOURLY)", row: hourlyRows.find(r => new Date(r.period_start).getHours() === 18), expectedSky: "맑음", expectedPcp: "0mm" },
  ];

  console.log("\n=== 3. Verification Results ===");
  for (const tc of testCases) {
    const m = tc.row?.metrics || {};
    const skyCode = m.sky_code;
    const ptyCode = m.precipitation_type;
    const precip = m.precipitation;

    const weatherInfo = getWeatherIconInfo({ ...tc.row, sky_code: skyCode, precipitation_type: ptyCode, precipitation: precip });
    const pcpText = formatRainAmount(precip);

    console.log(`\n[${tc.label}]`);
    console.log(`  • 원천값:  SKY=${skyCode}, PTY=${ptyCode}, PCP=${precip === 0 ? "강수없음(0mm)" : precip}`);
    console.log(`  • Result:  metrics.sky_code="${skyCode}", metrics.precipitation_type=${ptyCode}, metrics.precipitation=${precip}`);
    console.log(`  • UI 표시: 날씨="${weatherInfo.label}" (icon: ${weatherInfo.icon}), 강수량="${pcpText}"`);

    const skyPass = weatherInfo.label === tc.expectedSky;
    const pcpPass = pcpText === tc.expectedPcp;
    console.log(`  • 검증: ${skyPass && pcpPass ? "PASS ✅" : "FAIL ❌"} (SKY: ${skyPass ? "PASS" : "FAIL"}, PCP: ${pcpPass ? "PASS" : "FAIL"})`);
  }
}

run();
