import {
  evaluateToday,
  applyActivityTimeGate
} from '../supabase/functions/_shared/evaluation-engine.ts';

console.log("=== Testing Activity Time Gate & evaluateToday ===");

const sunTimes = {
  sunrise: "2026-08-27T05:50:00+09:00",
  sunset: "2026-08-27T19:06:00+09:00"
};

// 1. Activity Time Gate Unit Tests
console.log("\n[1] Activity Time Gate 단위 테스트:");
console.log("• 03:00 (일출 전) ->", applyActivityTimeGate("추천", sunTimes, "2026-08-27T03:00:00+09:00", "NIGHT"));
console.log("• 06:00 (일출 직후) ->", applyActivityTimeGate("추천", sunTimes, "2026-08-27T06:00:00+09:00", "SUNRISE_EFFECT"));
console.log("• 12:00 (주간) ->", applyActivityTimeGate("추천", sunTimes, "2026-08-27T12:00:00+09:00", "DAY"));
console.log("• 18:00 (일몰 66분 전) ->", applyActivityTimeGate("추천", sunTimes, "2026-08-27T18:00:00+09:00", "SUNSET_EFFECT"));
console.log("• 18:30 (일몰 36분 전) ->", applyActivityTimeGate("추천", sunTimes, "2026-08-27T18:30:00+09:00", "SUNSET_EFFECT"));
console.log("• 18:50 (일몰 16분 전) ->", applyActivityTimeGate("추천", sunTimes, "2026-08-27T18:50:00+09:00", "SUNSET_EFFECT"));
console.log("• 19:10 (일몰 4분 후) ->", applyActivityTimeGate("추천", sunTimes, "2026-08-27T19:10:00+09:00", "NIGHT"));
console.log("• 21:00 (완전 야간) ->", applyActivityTimeGate("추천", sunTimes, "2026-08-27T21:00:00+09:00", "NIGHT"));

// 2. evaluateToday for 21:00 Slot Test
console.log("\n[2] evaluateToday 21:00 슬롯 테스트:");
const point = {
  id: 22,
  name: "문암해변",
  environment: {
    exposure: "medium",
    breakwaterShelter: "medium",
    terrain: "mixed",
    eastWindSensitivity: "medium",
    swellSensitivity: "medium"
  }
};

const dto21h = {
  mode: "TODAY",
  point,
  target_date: "2026-08-27",
  forecast_time: "2026-08-27T21:00:00+09:00",
  period_start: "2026-08-27T21:00:00+09:00",
  period_end: "2026-08-27T24:00:00+09:00",
  marine_hourly: {
    wave_height: 0.5,
    wave_period: 5.2,
    ocean_current_velocity: 0.60,
    sea_surface_temperature: 27.3
  },
  kma_hourly: {
    temperature: 25,
    wind_speed: 1.7,
    wind_direction_degree: 315,
    precipitation: 0,
    precipitation_probability: 30,
    cloud_cover: 80,
    sky_code: "4",
    precipitation_type: 0
  },
  rn1_live: null,
  kma_warning_safety: {
    status: "PASS",
    active_warnings: [],
    warning_area_code: "S1151100"
  },
  sun_times: {
    date: "2026-08-27",
    sunrise: "2026-08-27T05:50:00+09:00",
    sunset: "2026-08-27T19:06:00+09:00",
    source: "KASI"
  },
  marine_history: [],
  rn1_history: []
};

const result21 = evaluateToday(dto21h);
console.log("• 21시 Result Summary:");
console.log("  - condition_score:", result21.condition_score);
console.log("  - condition_status:", result21.condition_status);
console.log("  - recommendation:", result21.recommendation);
console.log("  - visibility_score:", result21.visibility_score);
console.log("  - visibility_grade:", result21.visibility_grade);
console.log("  - visibility_explanation:", result21.visibility_explanation);
