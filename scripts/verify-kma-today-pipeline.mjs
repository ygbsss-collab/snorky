const supabaseUrl = "https://vqpkckonpsnzhuwuybav.supabase.co";
const apiKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";

function getKoreanSkyLabel(skyCode, ptyCode) {
  if (ptyCode === 1 || ptyCode === 4) return "비";
  if (ptyCode === 2) return "비/눈";
  if (ptyCode === 3) return "눈";
  if (String(skyCode) === "1") return "맑음";
  if (String(skyCode) === "3") return "구름많음";
  if (String(skyCode) === "4") return "흐림";
  return "--";
}

async function run() {
  console.log("=== 1. Triggering point-evaluation-refresh for Point 4 (영진해변) ===");
  const refreshRes = await fetch(`${supabaseUrl}/functions/v1/point-evaluation-refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({ pointIds: [4] })
  });
  const refreshReport = await refreshRes.json();
  console.log("Refresh Report:", {
    ok: refreshReport.ok,
    successful_points: refreshReport.successful_points,
    total_records_upserted: refreshReport.total_records_upserted,
  });

  console.log("\n=== 2. Reading KMA Cache (grid_key = 92:132) ===");
  const kmaRes = await fetch(`${supabaseUrl}/rest/v1/kma_weather_cache?grid_key=eq.92:132&select=grid_key,forecast_at,forecast_data&order=forecast_at.desc&limit=1`, {
    headers: {
      "apikey": apiKey,
      "Authorization": `Bearer ${apiKey}`
    }
  });
  const kmaData = await kmaRes.json();
  const kmaHourly = kmaData?.[0]?.forecast_data?.hourly || [];
  console.log(`KMA Cache has ${kmaHourly.length} hourly items. Latest forecast_at: ${kmaData?.[0]?.forecast_at}`);

  const kmaByHourMap = new Map();
  for (const h of kmaHourly) {
    if (h.datetime) {
      const hourKst = new Date(h.datetime).getHours();
      kmaByHourMap.set(hourKst, h);
    }
  }

  console.log("\n=== 3. Reading point_evaluation_results for Point 4 ===");
  const todayDate = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const resultsRes = await fetch(`${supabaseUrl}/rest/v1/point_evaluation_results?point_id=eq.4&target_date=eq.${todayDate}&select=id,mode,target_date,forecast_time,period_start,metrics&order=mode,period_start`, {
    headers: {
      "apikey": apiKey,
      "Authorization": `Bearer ${apiKey}`
    }
  });
  const results = await resultsRes.json();
  
  const todayRow = results.find(r => r.mode === "TODAY");
  const hourlyRows = results.filter(r => r.mode === "TODAY_HOURLY");

  console.log(`Retrieved TODAY row: ${Boolean(todayRow)}, TODAY_HOURLY rows: ${hourlyRows.length}`);

  const targets = [
    { label: "현재값(TODAY 대표)", hour: todayRow ? new Date(todayRow.forecast_time || todayRow.period_start).getHours() : 12, row: todayRow },
    { label: "12시(TODAY_HOURLY)", hour: 12, row: hourlyRows.find(r => new Date(r.period_start).getHours() === 12) },
    { label: "15시(TODAY_HOURLY)", hour: 15, row: hourlyRows.find(r => new Date(r.period_start).getHours() === 15) },
    { label: "18시(TODAY_HOURLY)", hour: 18, row: hourlyRows.find(r => new Date(r.period_start).getHours() === 18) },
  ];

  console.log("\n=== 4. Verification Table Data ===");
  for (const t of targets) {
    const kmaItem = kmaByHourMap.get(t.hour);
    const rawPcp = typeof kmaItem?.precipitation === "object" ? kmaItem.precipitation.mm : kmaItem?.precipitation;
    const rawSky = kmaItem?.sky?.code ?? kmaItem?.sky;
    const rawPty = kmaItem?.precipitationType?.code ?? kmaItem?.precipitationType;
    const rawPop = kmaItem?.precipitationProbability;
    const rawTmp = kmaItem?.temperature;
    const kmaWeatherLabel = getKoreanSkyLabel(rawSky, rawPty);

    const m = t.row?.metrics || {};
    const resTmp = m.temperature;
    const resPcp = m.precipitation;
    const resPop = m.precipitation_probability;
    const resSky = m.sky_code;
    const resPty = m.precipitation_type;
    const resWeatherLabel = getKoreanSkyLabel(resSky, resPty);

    console.log(`\n[${t.label}] (Hour: ${t.hour}시)`);
    console.log(`  • Cache값:  날씨=${kmaWeatherLabel}(SKY:${rawSky}, PTY:${rawPty}) | 기온=${rawTmp}°C | 강수량=${rawPcp}mm | 강수확률=${rawPop}%`);
    console.log(`  • Result값: 날씨=${resWeatherLabel}(SKY:${resSky}, PTY:${resPty}) | 기온=${resTmp}°C | 강수량=${resPcp}mm | 강수확률=${resPop}%`);
    
    // Reader adapter mapping check
    const isPass = (
      (rawTmp === undefined || resTmp === rawTmp || Number(resTmp) === Number(rawTmp)) &&
      (rawPcp === undefined || resPcp === rawPcp || Number(resPcp) === Number(rawPcp)) &&
      (rawPop === undefined || resPop === rawPop || Number(resPop) === Number(rawPop))
    );
    console.log(`  • 일치 여부: ${isPass ? "PASS ✅" : "FAIL ❌"}`);
  }
}

run();
