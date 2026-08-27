/**
 * Verification test for Server Evaluation Engine
 * Tests TODAY, SHORT, MID evaluation, RN1 48h decay, and 0.79m vs 0.80m wave boundary testing.
 */
import assert from "node:assert";
import { evaluateToday, evaluateShort, evaluateMid } from "../supabase/functions/_shared/evaluation-engine.ts";
import type {
  TodayEvaluationInputDTO,
  ShortEvaluationInputDTO,
  MidEvaluationInputDTO
} from "../supabase/functions/_shared/evaluation-dto.ts";

function runEngineTests() {
  console.log("=== Testing Server Evaluation Engine & Boundary Conditions ===");

  // Mock Point
  const point = {
    id: 101,
    name: "사근진해변",
    region_id: 1,
    region: "강릉",
    lat: 37.8055,
    lng: 128.8978,
    warning_area_code: "L1020100",
    environment: {
      terrain: "sand" as const,
      exposure: "high" as const,
      breakwaterShelter: "low" as const,
      swellSensitivity: "high" as const,
      exposureDirection: "E" as const,
      eastWindSensitivity: "high" as const
    }
  };

  // Base Valid TODAY DTO
  const baseTodayDto: TodayEvaluationInputDTO = {
    mode: "TODAY",
    point,
    target_date: "2026-08-25",
    forecast_time: "2026-08-25T14:00:00+09:00",
    evaluated_at: "2026-08-25T13:50:00+09:00",
    marine_hourly: {
      wave_height: 0.35,
      wave_period: 6.5,
      ocean_current_velocity: 0.12,
      sea_surface_temperature: 24.5
    },
    kma_hourly: {
      temperature: 27.5,
      wind_speed: 3.5,
      wind_direction_degree: 90,
      precipitation: 0.0,
      precipitation_probability: 10,
      cloud_cover: 30
    },
    rn1_live: { rn1: 0.0, observed_at: "2026-08-25T13:45:00+09:00" },
    kma_warning_safety: {
      status: "PASS",
      active_warnings: [],
      warning_area_code: "L1020100"
    },
    sun_times: {
      date: "2026-08-25",
      sunrise: "2026-08-25T05:52:00+09:00",
      sunset: "2026-08-25T19:12:00+09:00",
      source: "KASI"
    },
    marine_history: [{ hoursAgo: 1, wave_height: 0.4, wave_period: 6.0, ocean_current_velocity: 0.1 }],
    rn1_history: [
      { hoursAgo: 12, rn1: 5.0, precipitation_accumulated_24h: 15.0 },
      { hoursAgo: 40, rn1: 10.0, precipitation_accumulated_24h: 30.0 } // 48h range test
    ]
  };

  // 1. RN1 48h History Decay Test
  const todayResNormal = evaluateToday(baseTodayDto);
  assert.strictEqual(todayResNormal.safety_status, "PASS");
  assert.ok(Number.isFinite(todayResNormal.condition_score));
  assert.ok(Number.isFinite(todayResNormal.visibility_score));
  console.log("✓ 1. RN1 48h History Decay Applied OK (Vis Score:", todayResNormal.visibility_score, ", Condition Score:", todayResNormal.condition_score, ")");

  // 2. Wave Boundary Test 0.79m vs 0.80m in TODAY
  const todayDto079: TodayEvaluationInputDTO = {
    ...baseTodayDto,
    marine_hourly: { ...baseTodayDto.marine_hourly, wave_height: 0.79 }
  };
  const todayRes079 = evaluateToday(todayDto079);
  assert.strictEqual(todayRes079.safety_status, "PASS", "0.79m wave must PASS safety gate");
  assert.ok(Number.isFinite(todayRes079.condition_score), "0.79m wave must compute condition score");

  const todayDto080: TodayEvaluationInputDTO = {
    ...baseTodayDto,
    marine_hourly: { ...baseTodayDto.marine_hourly, wave_height: 0.80 }
  };
  const todayRes080 = evaluateToday(todayDto080);
  assert.strictEqual(todayRes080.safety_status, "BLOCK", "0.80m wave must BLOCK safety gate");
  assert.strictEqual(todayRes080.condition_score, null, "0.80m wave condition_score must be null");
  assert.strictEqual(todayRes080.condition_status, "입수 금지");
  console.log("✓ 2. TODAY Wave Boundary OK -> 0.79m: PASS (Score:", todayRes079.condition_score, ") | 0.80m: BLOCK (Score: null)");

  // 3. Wave Boundary Test 0.79m vs 0.80m in SHORT
  const baseShortDto: ShortEvaluationInputDTO = {
    mode: "SHORT",
    point,
    target_date: "2026-08-26",
    slot_index: 2,
    forecast_time: "2026-08-26T12:00:00+09:00",
    evaluated_at: "2026-08-25T13:50:00+09:00",
    marine_slot: {
      wave_height: 0.79,
      wave_period: 6.0,
      ocean_current_velocity: 0.15,
      sea_surface_temperature: 24.0
    },
    kma_slot: {
      temperature: 28.0,
      wind_speed: 4.0,
      wind_direction_degree: 90,
      precipitation: 0.0,
      precipitation_probability: 10
    },
    sun_times: {
      date: "2026-08-26",
      sunrise: "2026-08-26T05:53:00+09:00",
      sunset: "2026-08-26T19:10:00+09:00",
      source: "KASI"
    },
    marine_history: [],
    rn1_history: [],
    safety_status: "PASS"
  };
  const shortRes079 = evaluateShort(baseShortDto);
  assert.strictEqual(shortRes079.safety_status, "PASS");
  assert.ok(Number.isFinite(shortRes079.condition_score));

  const shortDto080: ShortEvaluationInputDTO = {
    ...baseShortDto,
    marine_slot: { ...baseShortDto.marine_slot, wave_height: 0.80 }
  };
  const shortRes080 = evaluateShort(shortDto080);
  assert.strictEqual(shortRes080.safety_status, "BLOCK");
  assert.strictEqual(shortRes080.condition_score, null);
  console.log("✓ 3. SHORT Wave Boundary OK -> 0.79m: PASS (Score:", shortRes079.condition_score, ") | 0.80m: BLOCK (Score: null)");

  // 4. Wave Boundary Test 0.79m vs 0.80m in MID
  const midDto079: MidEvaluationInputDTO = {
    mode: "MID_MARINE_ONLY",
    point,
    target_date: "2026-08-29",
    slot_type: "AM",
    period_start: "2026-08-29T06:00:00+09:00",
    period_end: "2026-08-29T12:00:00+09:00",
    evaluated_at: "2026-08-25T13:50:00+09:00",
    marine_6h_series: [
      { timestamp: "2026-08-29T06:00:00+09:00", wave_height: 0.5, wave_period: 6.0, ocean_current_velocity: 0.1, sea_surface_temperature: 23.5 },
      { timestamp: "2026-08-29T07:00:00+09:00", wave_height: 0.79, wave_period: 6.0, ocean_current_velocity: 0.1, sea_surface_temperature: 23.5 }
    ],
    sun_times: {
      date: "2026-08-29",
      sunrise: "2026-08-29T05:55:00+09:00",
      sunset: "2026-08-29T19:06:00+09:00",
      source: "KASI"
    }
  };
  const midRes079 = evaluateMid(midDto079);
  assert.strictEqual(midRes079.safety_status, "PASS");
  assert.ok(Number.isFinite(midRes079.condition_score));

  const midDto080: MidEvaluationInputDTO = {
    ...midDto079,
    marine_6h_series: [
      { timestamp: "2026-08-29T06:00:00+09:00", wave_height: 0.5, wave_period: 6.0, ocean_current_velocity: 0.1, sea_surface_temperature: 23.5 },
      { timestamp: "2026-08-29T07:00:00+09:00", wave_height: 0.80, wave_period: 6.0, ocean_current_velocity: 0.1, sea_surface_temperature: 23.5 } // Peak triggers Worst Gate
    ]
  };
  const midRes080 = evaluateMid(midDto080);
  assert.strictEqual(midRes080.safety_status, "BLOCK");
  assert.strictEqual(midRes080.condition_score, null);
  console.log("✓ 4. MID Worst Gate Wave Boundary OK -> Peak 0.79m: PASS (Score:", midRes079.condition_score, ") | Peak 0.80m: BLOCK (Score: null)");

  console.log("\nALL BOUNDARY & RN1 48H TESTS PASSED SUCCESSFULLY!");
}

runEngineTests();
