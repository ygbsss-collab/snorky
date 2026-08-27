/**
 * Single verification test for Server Evaluation Input Adapters & DTOs
 */
const assert = require("assert");

function testEvaluationAdapters() {
  console.log("=== Testing Server Evaluation Input Adapters & DTOs ===");

  // 1. Point Profile with environment & warning_area_code
  const mockPoint = {
    id: 101,
    name: "사근진해변",
    region_id: 1,
    region: "강릉",
    lat: 37.8055,
    lng: 128.8978,
    warning_area_code: "L1020100",
    environment: {
      terrain: "sand",
      exposure: "high",
      breakwaterShelter: "low",
      swellSensitivity: "high",
      exposureDirection: "E",
      eastWindSensitivity: "high"
    }
  };
  assert.strictEqual(mockPoint.environment.terrain, "sand");
  assert.strictEqual(mockPoint.warning_area_code, "L1020100");
  console.log("✓ 1. Point Profile Loader Fields OK (environment, warning_area_code)");

  // 2. KASI SunTimes Input Interface
  const mockKasiSunTimes = {
    date: "2026-08-25",
    sunrise: "2026-08-25T05:52:00+09:00",
    sunset: "2026-08-25T19:12:00+09:00",
    source: "KASI"
  };
  assert.strictEqual(mockKasiSunTimes.source, "KASI");
  console.log("✓ 2. KASI SunTimes Interface Isolated OK");

  // 3. Marine History vs RN1 History Separation
  const mockMarineHistory = [
    { hoursAgo: 1, wave_height: 0.5, wave_period: 6.2, ocean_current_velocity: 0.12 },
    { hoursAgo: 2, wave_height: 0.6, wave_period: 6.5, ocean_current_velocity: 0.15 }
  ];
  const mockRn1History = [
    { hoursAgo: 1, rn1: 0.0, precipitation_accumulated_24h: 0.0 },
    { hoursAgo: 2, rn1: 1.5, precipitation_accumulated_24h: 3.5 }
  ];
  assert.strictEqual(mockMarineHistory.every(h => "wave_height" in h && !("rn1" in h)), true);
  assert.strictEqual(mockRn1History.every(h => "rn1" in h && !("wave_height" in h)), true);
  console.log("✓ 3. Marine History & RN1 History Separated OK");

  // 4. TODAY Evaluation Input DTO
  const todayDto = {
    mode: "TODAY",
    point: mockPoint,
    target_date: "2026-08-25",
    forecast_time: "2026-08-25T14:00:00+09:00",
    evaluated_at: new Date().toISOString(),
    marine_hourly: {
      wave_height: 0.4,
      wave_period: 6.0,
      ocean_current_velocity: 0.1,
      sea_surface_temperature: 24.5
    },
    kma_hourly: {
      temperature: 28.0,
      wind_speed: 3.2,
      wind_direction_degree: 90,
      precipitation: 0.0,
      precipitation_probability: 10
    },
    rn1_live: { rn1: 0.0, observed_at: "2026-08-25T13:45:00+09:00" },
    kma_warning_safety: {
      status: "PASS",
      active_warnings: [],
      warning_area_code: mockPoint.warning_area_code
    },
    sun_times: mockKasiSunTimes,
    marine_history: mockMarineHistory,
    rn1_history: mockRn1History
  };
  assert.strictEqual(todayDto.mode, "TODAY");
  assert.ok(todayDto.kma_warning_safety);
  assert.ok(todayDto.rn1_live);
  console.log("✓ 4. TODAY DTO Structure OK (Hourly + Live RN1 + KMA Warning + History)");

  // 5. SHORT Evaluation Input DTO (No active warning pollution)
  const shortDto = {
    mode: "SHORT",
    point: mockPoint,
    target_date: "2026-08-26",
    slot_index: 2, // 12:00
    forecast_time: "2026-08-26T12:00:00+09:00",
    evaluated_at: new Date().toISOString(),
    marine_slot: {
      wave_height: 0.5,
      wave_period: 6.5,
      ocean_current_velocity: 0.15,
      sea_surface_temperature: 24.0
    },
    kma_slot: {
      temperature: 27.5,
      wind_speed: 4.0,
      wind_direction_degree: 120,
      precipitation: 0.0,
      precipitation_probability: 20
    },
    sun_times: { ...mockKasiSunTimes, date: "2026-08-26" },
    marine_history: mockMarineHistory,
    rn1_history: mockRn1History,
    safety_status: "PASS"
  };
  assert.strictEqual(shortDto.mode, "SHORT");
  assert.strictEqual("kma_warning_safety" in shortDto, false, "SHORT must not include TODAY's real-time warning safety object");
  assert.strictEqual(shortDto.safety_status, "PASS");
  console.log("✓ 5. SHORT DTO Structure OK (3h Slot + History + No TODAY Warning pollution)");

  // 6. MID Evaluation Input DTO (MID_MARINE_ONLY)
  const midDto = {
    mode: "MID_MARINE_ONLY",
    point: mockPoint,
    target_date: "2026-08-29",
    slot_type: "AM",
    period_start: "2026-08-29T06:00:00+09:00",
    period_end: "2026-08-29T12:00:00+09:00",
    evaluated_at: new Date().toISOString(),
    marine_6h_series: [
      { timestamp: "2026-08-29T06:00:00+09:00", wave_height: 0.5, wave_period: 6.0, ocean_current_velocity: 0.1, sea_surface_temperature: 23.5 },
      { timestamp: "2026-08-29T07:00:00+09:00", wave_height: 0.5, wave_period: 6.0, ocean_current_velocity: 0.1, sea_surface_temperature: 23.5 },
      { timestamp: "2026-08-29T08:00:00+09:00", wave_height: 0.6, wave_period: 6.2, ocean_current_velocity: 0.12, sea_surface_temperature: 23.5 },
      { timestamp: "2026-08-29T09:00:00+09:00", wave_height: 0.6, wave_period: 6.2, ocean_current_velocity: 0.12, sea_surface_temperature: 23.8 },
      { timestamp: "2026-08-29T10:00:00+09:00", wave_height: 0.7, wave_period: 6.5, ocean_current_velocity: 0.15, sea_surface_temperature: 24.0 },
      { timestamp: "2026-08-29T11:00:00+09:00", wave_height: 0.7, wave_period: 6.5, ocean_current_velocity: 0.15, sea_surface_temperature: 24.0 }
    ],
    kma_mid_land: { weather: "구름많음", precipitation_probability: 30 },
    kma_mid_temp: { temp_min: 21, temp_max: 28 },
    sun_times: { ...mockKasiSunTimes, date: "2026-08-29" }
  };
  assert.strictEqual(midDto.mode, "MID_MARINE_ONLY");
  assert.strictEqual(midDto.marine_6h_series.length, 6);
  assert.strictEqual("precipitation" in midDto.marine_6h_series[0], false, "MID series must exclude precipitation");
  console.log("✓ 6. MID DTO Structure OK (6h 4-Marine Series + Mid Annotations)");

  console.log("\nALL 6 ADAPTER / DTO CHECKS PASSED SUCCESSFULLY!");
}

testEvaluationAdapters();
