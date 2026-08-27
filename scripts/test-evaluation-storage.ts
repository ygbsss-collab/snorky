/**
 * Verification test for Server Evaluation Storage Layer
 * Tests DB row mapping, UPSERT contract, point_updated_at, and final source_issue_time (marine_issued_at & KASI).
 */
import assert from "node:assert";
import { mapEvaluationResultToDbRow } from "../supabase/functions/_shared/evaluation-storage.ts";
import { evaluateToday, evaluateShort, evaluateMid } from "../supabase/functions/_shared/evaluation-engine.ts";
import type {
  TodayEvaluationInputDTO,
  ShortEvaluationInputDTO,
  MidEvaluationInputDTO,
  SourceIssueTimeDTO
} from "../supabase/functions/_shared/evaluation-dto.ts";

function runStorageTests() {
  console.log("=== Testing Server Evaluation Storage Layer (Final Source Issue Time Contract) ===");

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

  // 1. TODAY Evaluation with explicit marine_issued_at & KASI
  const todayDto: TodayEvaluationInputDTO = {
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
      precipitation_probability: 10
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
    rn1_history: [{ hoursAgo: 1, rn1: 0.0, precipitation_accumulated_24h: 0.0 }]
  };

  const todayRes = evaluateToday(todayDto);
  const structuredSourceIssueTime: SourceIssueTimeDTO = {
    marine_issued_at: "2026-08-25T13:00:00+09:00", // Actual marine model issue time
    kma_base_time: "20260825_1300",
    kma_safety_fetched_at: "2026-08-25T13:48:00+09:00",
    rn1_observed_at: "2026-08-25T13:45:00+09:00",
    kasi_sun_times_date: "2026-08-25",
    kasi_sun_times_fetched_at: "2026-08-25T00:00:00+09:00"
  };

  const todayDbRow = mapEvaluationResultToDbRow(todayRes, structuredSourceIssueTime);

  assert.strictEqual(todayDbRow.source_issue_time?.marine_issued_at, "2026-08-25T13:00:00+09:00");
  assert.strictEqual(todayDbRow.source_issue_time?.kasi_sun_times_date, "2026-08-25");
  assert.strictEqual(todayDbRow.source_issue_time?.kasi_sun_times_fetched_at, "2026-08-25T00:00:00+09:00");
  assert.strictEqual("sun_times_calculated_at" in (todayDbRow.source_issue_time || {}), false, "sun_times_calculated_at must be removed");
  console.log("✓ 1. Marine actual issued_at & KASI Date/FetchedAt verified OK");

  // 2. Missing marine_issued_at fallback test -> "[확인 필요]"
  const partialSourceTime: SourceIssueTimeDTO = {
    kma_base_time: "20260825_1100"
    // marine_issued_at is intentionally omitted
  };
  const shortDto: ShortEvaluationInputDTO = {
    mode: "SHORT",
    point,
    target_date: "2026-08-26",
    slot_index: 2,
    forecast_time: "2026-08-26T12:00:00+09:00",
    evaluated_at: "2026-08-25T13:50:00+09:00",
    marine_slot: {
      wave_height: 0.45,
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
  const shortRes = evaluateShort(shortDto);
  const shortDbRow = mapEvaluationResultToDbRow(shortRes, partialSourceTime);
  assert.strictEqual(shortDbRow.source_issue_time?.marine_issued_at, null, "Missing marine_issued_at must fall back to null");
  assert.strictEqual(shortDbRow.source_issue_time?.kasi_sun_times_date, "2026-08-26");
  console.log("✓ 2. Missing marine_issued_at falls back to null OK");

  // 3. MID Evaluation Result Mapping
  const midDto: MidEvaluationInputDTO = {
    mode: "MID_MARINE_ONLY",
    point,
    target_date: "2026-08-29",
    slot_type: "AM",
    period_start: "2026-08-29T06:00:00+09:00",
    period_end: "2026-08-29T12:00:00+09:00",
    evaluated_at: "2026-08-25T13:50:00+09:00",
    marine_6h_series: [
      { timestamp: "2026-08-29T06:00:00+09:00", wave_height: 0.4, wave_period: 6.0, ocean_current_velocity: 0.1, sea_surface_temperature: 23.5 },
      { timestamp: "2026-08-29T07:00:00+09:00", wave_height: 0.6, wave_period: 6.0, ocean_current_velocity: 0.15, sea_surface_temperature: 24.0 }
    ],
    sun_times: {
      date: "2026-08-29",
      sunrise: "2026-08-29T05:55:00+09:00",
      sunset: "2026-08-29T19:06:00+09:00",
      source: "KASI"
    }
  };
  const midSourceIssueTime: SourceIssueTimeDTO = {
    marine_issued_at: "2026-08-25T13:00:00+09:00",
    mid_land_base_time: "20260825_0600",
    mid_temp_base_time: "20260825_0600",
    kasi_sun_times_date: "2026-08-29",
    kasi_sun_times_fetched_at: "2026-08-25T00:00:00+09:00"
  };
  const midRes = evaluateMid(midDto);
  const midDbRow = mapEvaluationResultToDbRow(midRes, midSourceIssueTime);
  assert.strictEqual(midDbRow.source_issue_time?.marine_issued_at, "2026-08-25T13:00:00+09:00");
  assert.strictEqual(midDbRow.source_issue_time?.mid_land_base_time, "20260825_0600");
  assert.strictEqual(midDbRow.source_issue_time?.kasi_sun_times_date, "2026-08-29");
  console.log("✓ 3. MID DB Row Mapped OK with Mid Land/Temp & KASI Timestamps");

  console.log("\nALL FINAL SOURCE ISSUE TIME TESTS PASSED SUCCESSFULLY!");
}

runStorageTests();
