const supabaseUrl = "https://vqpkckonpsnzhuwuybav.supabase.co";
const apiKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";

async function run() {
  console.log("=== 1. Refreshing Point 4 (영진해변) ===");
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

  console.log("\n=== 2. Reading point_evaluation_results for Point 4 ===");
  const todayDate = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const resultsRes = await fetch(`${supabaseUrl}/rest/v1/point_evaluation_results?point_id=eq.4&target_date=eq.${todayDate}&select=*&order=period_start`, {
    headers: { "apikey": apiKey, "Authorization": `Bearer ${apiKey}` }
  });
  const results = await resultsRes.json();

  const todayRow = results.find(r => r.mode === "TODAY");
  const hourlyRows = results.filter(r => r.mode === "TODAY_HOURLY");

  const slots = [
    { label: "상단 (현재 시각 TODAY)", row: todayRow },
    { label: "12시 (TODAY_HOURLY)", row: hourlyRows.find(r => new Date(r.period_start).getHours() === 12) },
    { label: "15시 (TODAY_HOURLY)", row: hourlyRows.find(r => new Date(r.period_start).getHours() === 15) },
    { label: "18시 (TODAY_HOURLY)", row: hourlyRows.find(r => new Date(r.period_start).getHours() === 18) },
    { label: "21시 (TODAY_HOURLY)", row: hourlyRows.find(r => new Date(r.period_start).getHours() === 21) },
  ];

  console.log("\n=== 3. Visual Condition Penalty Verification Table ===");
  for (const s of slots) {
    const row = s.row;
    if (!row) continue;
    const m = row.metrics || {};
    const baseScore = m.base_visibility_score ?? row.visibility_score;
    const penalty = m.visual_condition_penalty ?? 0;
    const finalScore = row.visibility_score;
    const lightState = m.visual_condition?.lightState;
    const weatherState = m.visual_condition?.weatherState;

    const lightLabel = ({ DAY: "낮", SUNRISE_EFFECT: "일출 영향", SUNSET_EFFECT: "일몰 영향", NIGHT: "밤" })[lightState] || lightState;
    const weatherLabel = ({ CLEAR: "맑음", MOSTLY_CLOUDY: "구름많음", OVERCAST: "흐림", RAIN: "비" })[weatherState] || weatherState;

    const uiApplied = lightState === "NIGHT" ? "자연광 부족 · Final 0점 적용" : penalty > 0 ? `${weatherLabel} (-${penalty}점)` : "정상 (감점 없음)";

    console.log(`\n[${s.label}]`);
    console.log(`  • 자연광: ${lightLabel} (${lightState})`);
    console.log(`  • 기상: ${weatherLabel} (${weatherState})`);
    console.log(`  • Base 점수: ${baseScore}점`);
    console.log(`  • 감점: -${penalty}점 (visualConditionPenalty: ${penalty})`);
    console.log(`  • Final 점수: ${finalScore}점 (${row.visibility_grade})`);
    console.log(`  • UI 표시: "${uiApplied}"`);
    
    // Check correctness:
    // If DAY + MOSTLY_CLOUDY: penalty === 5 && finalScore === baseScore - 5
    let pass = false;
    if (lightState === "DAY" && weatherState === "MOSTLY_CLOUDY") {
      pass = (penalty === 5 && finalScore === baseScore - 5);
    } else if (lightState === "NIGHT") {
      pass = (finalScore === 0);
    } else if (lightState === "SUNSET_EFFECT" && weatherState === "CLEAR") {
      pass = (penalty === 10 && finalScore === baseScore - 10);
    } else {
      pass = (finalScore === Math.max(0, baseScore - penalty));
    }

    console.log(`  • PASS/FAIL: ${pass ? "PASS ✅" : "FAIL ❌"}`);
  }
}

run();
