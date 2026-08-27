/**
 * Verification test for Server Evaluation Orchestrator
 * Tests full pipeline: Mock Cache -> DTO Generation -> Engine Evaluation (TODAY/SHORT/MID) -> Storage Mapping.
 */
import assert from "node:assert";
import { evaluateAndStorePoint } from "../supabase/functions/_shared/evaluation-orchestrator.ts";
import { mapEvaluationResultToDbRow } from "../supabase/functions/_shared/evaluation-storage.ts";

function runOrchestratorTests() {
  console.log("=== Testing Server Evaluation Orchestrator Pipeline ===");

  const point = {
    id: 101,
    name: "사근진해변",
    region_id: 1,
    region: "강릉",
    lat: 37.8055,
    lng: 128.8978,
    warning_area_code: "L1020100",
    updated_at: "2026-08-20T10:00:00+09:00",
    environment: {
      terrain: "sand" as const,
      exposure: "high" as const,
      breakwaterShelter: "low" as const,
      swellSensitivity: "high" as const,
      exposureDirection: "E" as const,
      eastWindSensitivity: "high" as const
    }
  };

  // Mock 7-day hourly marine series (168 hours)
  const baseTime = new Date("2026-08-25T00:00:00+09:00").getTime();
  const marineTimes: string[] = [];
  const marineWaveH: number[] = [];
  const marineWaveP: number[] = [];
  const marineCurV: number[] = [];
  const marineSeaTemp: number[] = [];

  for (let h = 0; h < 168; h++) {
    const d = new Date(baseTime + h * 3600000 + 9 * 3600000);
    const dateStr = d.toISOString().slice(0, 10);
    const hourStr = String(d.getUTCHours()).padStart(2, "0");
    marineTimes.push(`${dateStr}T${hourStr}:00`);
    marineWaveH.push(0.35 + (h % 5) * 0.05); // 0.35m ~ 0.55m (safe)
    marineWaveP.push(6.0 + (h % 3) * 0.5);
    marineCurV.push(0.12 + (h % 4) * 0.02);
    marineSeaTemp.push(24.0 + (h % 2) * 0.5);
  }

  const mockMarineCache = {
    fetched_at: "2026-08-25T13:40:00+09:00",
    status: "fresh",
    hourly: {
      time: marineTimes,
      wave_height: marineWaveH,
      wave_period: marineWaveP,
      ocean_current_velocity: marineCurV,
      sea_surface_temperature: marineSeaTemp
    }
  };

  // Mock KMA 3-day short forecast
  const kmaHourly: any[] = [];
  for (let h = 0; h < 72; h++) {
    const d = new Date(baseTime + h * 3600000 + 9 * 3600000);
    const dateStr = d.toISOString().slice(0, 10);
    const hourStr = String(d.getUTCHours()).padStart(2, "0");
    kmaHourly.push({
      datetime: `${dateStr} ${hourStr}:00`,
      temperature: 26.0 + (h % 5),
      windSpeed: 3.5,
      windDirectionDegree: 90,
      precipitation: 0.0,
      precipitationProbability: 10
    });
  }

  const mockKmaWeatherCache = {
    base_time: "20260825_1100",
    fetched_at: "2026-08-25T13:42:00+09:00",
    status: "fresh",
    forecast_data: { hourly: kmaHourly }
  };

  // Mock KMA Safety Cache (No active warning for this test)
  const mockKmaSafetyCache = {
    fetched_at: "2026-08-25T13:48:00+09:00",
    status: "fresh",
    warnings: []
  };

  // Dummy supabase client for dry-run
  const dummyClient = {} as any;

  // 1. Normal Pipeline Run (dry-run mode)
  evaluateAndStorePoint(
    dummyClient,
    point,
    {
      marineCache: mockMarineCache,
      kmaWeatherCache: mockKmaWeatherCache,
      kmaSafetyCache: mockKmaSafetyCache
    },
    { dryRun: true, evaluatedAt: "2026-08-25T13:50:00+09:00" }
  ).then(orchRes => {
    assert.strictEqual(orchRes.point_id, 101);
    assert.strictEqual(orchRes.today_count, 1, "1 TODAY result expected");
    assert.strictEqual(orchRes.short_count, 15, "15 SHORT results expected (3 days * 5 slots)");
    assert.strictEqual(orchRes.mid_count, 6, "6 MID results expected (3 days * 2 slots)");
    assert.strictEqual(orchRes.results.length, 22, "Total 22 results expected");

    // TODAY validation
    const todayResult = orchRes.results.find(r => r.mode === "TODAY")!;
    assert.ok(todayResult);
    assert.strictEqual(todayResult.quality_status, "READY");
    assert.strictEqual(todayResult.safety_status, "PASS");
    assert.ok(Number.isFinite(todayResult.condition_score));
    console.log("✓ 1. Orchestrator TODAY Evaluation OK (Score:", todayResult.condition_score, ")");

    // SHORT validation (Safety PASS, no warning bleed)
    const shortResults = orchRes.results.filter(r => r.mode === "SHORT");
    assert.strictEqual(shortResults.length, 15);
    assert.ok(shortResults.every(r => r.safety_status === "PASS"));
    assert.ok(shortResults.every(r => Number.isFinite(r.condition_score)));
    console.log("✓ 2. Orchestrator 15 SHORT Evaluations OK (All PASS, 3h slots: 06, 09, 12, 15, 18)");

    // MID validation (MID_MARINE_ONLY with min_max_metrics)
    const midResults = orchRes.results.filter(r => r.mode === "MID_MARINE_ONLY");
    assert.strictEqual(midResults.length, 6);
    assert.ok(midResults.every(r => r.quality_status === "READY"));
    assert.ok(midResults.every(r => r.min_max_metrics && r.min_max_metrics.wave_height));
    console.log("✓ 3. Orchestrator 6 MID Evaluations OK (MID_MARINE_ONLY, min~max 3 metrics)");

    // DB Row Mapping & Unique Key Uniqueness Check
    const keys = new Set<string>();
    for (const r of orchRes.results) {
      const dbRow = mapEvaluationResultToDbRow(r);
      assert.strictEqual(dbRow.point_id, 101);
      assert.strictEqual(dbRow.point_updated_at, "2026-08-20T10:00:00+09:00");
      assert.strictEqual("marine_history" in dbRow, false);
      assert.strictEqual("distance" in dbRow, false);

      const naturalKey = `${dbRow.point_id}:${dbRow.target_date}:${dbRow.mode}:${dbRow.period_start}:${dbRow.period_end}`;
      assert.strictEqual(keys.has(naturalKey), false, `Duplicate natural key detected: ${naturalKey}`);
      keys.add(naturalKey);
    }
    assert.strictEqual(keys.size, 22);
    console.log("✓ 4. All 22 Natural Keys Unique & Verified in Storage Contract");

    // 2. Test Missing Marine Cache Handling -> UNKNOWN, condition_score: null
    const emptyMarineCache = {
      fetched_at: "2026-08-25T13:40:00+09:00",
      status: "stale",
      hourly: { time: [], wave_height: [] }
    };

    return evaluateAndStorePoint(
      dummyClient,
      point,
      {
        marineCache: emptyMarineCache,
        kmaWeatherCache: mockKmaWeatherCache,
        kmaSafetyCache: mockKmaSafetyCache
      },
      { dryRun: true, evaluatedAt: "2026-08-25T13:50:00+09:00" }
    ).then(missingRes => {
      assert.strictEqual(missingRes.results.length, 22);
      assert.ok(missingRes.results.every(r => r.quality_status === "UNKNOWN"), "Missing marine must result in UNKNOWN");
      assert.ok(missingRes.results.every(r => r.condition_score === null), "Missing marine condition_score must be null (no fallback)");
      assert.ok(missingRes.results.every(r => r.condition_status === "확인 필요"));
      console.log("✓ 5. Missing Cache Handling OK (All 22 results UNKNOWN, condition_score: null, status: '확인 필요')");

      console.log("\nALL 5 ORCHESTRATOR PIPELINE TESTS PASSED SUCCESSFULLY!");
    });
  });
}

runOrchestratorTests();
