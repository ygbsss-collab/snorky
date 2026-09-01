import { resolveWarningCodes } from "../supabase/functions/_shared/custom-point-resolver.ts";
import { evaluateAndStorePoint } from "../supabase/functions/_shared/evaluation-orchestrator.ts";

let externalCalls = 0;
globalThis.fetch = async () => {
  externalCalls++;
  throw new Error("CACHE_HIT_EXTERNAL_CALL");
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const kstDate = (offset) => {
  const nowKst = new Date(Date.now() + 9 * 3600000);
  const date = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() + offset));
  return date.toISOString().slice(0, 10);
};

const iso = (date, hour) => `${date}T${String(hour).padStart(2, "0")}:00:00+09:00`;

function cachedSources() {
  const marineHourly = {
    time: [], wave_height: [], wave_period: [], ocean_current_velocity: [], sea_surface_temperature: [],
  };
  for (let day = 0; day <= 6; day++) {
    for (let hour = 0; hour < 24; hour++) {
      marineHourly.time.push(iso(kstDate(day), hour));
      marineHourly.wave_height.push(0.25);
      marineHourly.wave_period.push(5.5);
      marineHourly.ocean_current_velocity.push(0.12);
      marineHourly.sea_surface_temperature.push(23);
    }
  }

  const kmaHourly = [];
  for (let day = 0; day <= 3; day++) {
    for (let hour = 0; hour < 24; hour++) {
      kmaHourly.push({
        datetime: iso(kstDate(day), hour),
        temperature: 24,
        windSpeed: 2,
        windDirection: 90,
        precipitation: { raw: "강수없음", mm: 0 },
        precipitationProbability: 10,
        sky: { code: 1 },
        precipitationType: { code: 0 },
      });
    }
  }

  const midSlots = {};
  for (let day = 4; day <= 6; day++) {
    midSlots[kstDate(day)] = {
      weather_am: "맑음", weather_pm: "맑음", pop_am: 10, pop_pm: 10, temp_min: 20, temp_max: 27,
    };
  }

  return {
    marineCache: { fetched_at: new Date().toISOString(), hourly: marineHourly },
    kmaWeatherCache: { base_time: "0500", forecast_data: { hourly: kmaHourly, daily: [] } },
    kmaSafetyCache: { fetched_at: new Date().toISOString(), normalized_warnings: [] },
    rn1History: [],
    midWeather: { landTmFc: "test", tempTmFc: "test", slots: midSlots },
  };
}

function mockClient() {
  const tables = [];
  return {
    tables,
    from(table) {
      tables.push(table);
      const filters = {};
      const chain = {
        select() { return chain; },
        eq(key, value) { filters[key] = value; return chain; },
        async maybeSingle() {
          await new Promise(resolve => setTimeout(resolve, 80));
          return table === "kasi_sun_times_cache"
            ? {
              data: {
                sunrise: `${filters.locdate}T06:00:00+09:00`,
                sunset: `${filters.locdate}T18:00:00+09:00`,
                source: "KASI",
              },
              error: null,
            }
            : { data: null, error: null };
        },
      };
      return chain;
    },
  };
}

const startedAt = performance.now();
const resolved = resolveWarningCodes("울진군");
const client = mockClient();
const result = await evaluateAndStorePoint(client, {
  id: 1_900_000_003,
  name: "울진 나만의 스팟",
  region: resolved.normalizedRegion,
  lat: 36.993,
  lng: 129.401,
  warning_area_code: resolved.seaCode,
  land_warning_area_code: resolved.landCode,
  mid_land_reg_id: resolved.midCodes?.landRegId || null,
  mid_temp_reg_id: resolved.midCodes?.tempRegId || null,
  is_custom_point: true,
  environment: null,
}, cachedSources(), {
  dryRun: true,
  modes: ["TODAY", "TODAY_HOURLY", "SHORT", "MID"],
  kasiMaxDayOffset: 3,
});
const responseMs = Math.round((performance.now() - startedAt) * 100) / 100;
const todaySafety = result.results.find(row => row.mode === "TODAY")?.safety_status;

assert(resolved.seaCode === "S1131300", `Uljin S code: ${resolved.seaCode}`);
assert(resolved.landCode === "L1073000", `Uljin L code: ${resolved.landCode}`);
assert(resolved.midCodes?.landRegId === "11H10000", `Uljin landRegId: ${resolved.midCodes?.landRegId}`);
assert(resolved.midCodes?.tempRegId === "11H10101", `Uljin tempRegId: ${resolved.midCodes?.tempRegId}`);
assert(result.today_count === 1 && result.today_hourly_count === 7, "TODAY count mismatch");
assert(result.short_count === 21 && result.mid_count === 6, "forecast count mismatch");
assert(todaySafety === "PASS" || todaySafety === "BLOCK", `Safety must be PASS/BLOCK: ${todaySafety}`);
assert(externalCalls === 0, `cache HIT external calls: ${externalCalls}`);
assert(result.timings?.kasi_ms < 200, `KASI cache loads are not parallel: ${result.timings?.kasi_ms}ms`);
assert(!client.tables.includes("points") && !client.tables.includes("point_evaluation_results"), "dryRun used official storage");

console.log(JSON.stringify({
  response_ms: responseMs,
  timings: result.timings,
  codes: {
    region: resolved.normalizedRegion,
    sea: resolved.seaCode,
    land: resolved.landCode,
    landRegId: resolved.midCodes?.landRegId,
    tempRegId: resolved.midCodes?.tempRegId,
  },
  counts: {
    today: result.today_count,
    todayHourly: result.today_hourly_count,
    short: result.short_count,
    mid: result.mid_count,
  },
  safety: todaySafety,
  external_calls: externalCalls,
  persisted: false,
}, null, 2));
