import { resolveWarningCodes } from "../supabase/functions/_shared/custom-point-resolver.ts";
import { evaluateAndStorePoint, getKmaMidRegionCodes } from "../supabase/functions/_shared/evaluation-orchestrator.ts";

globalThis.fetch = async () => {
  throw new Error("캐시 HIT 검증 중 외부 API 호출 발생");
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function kstDate(offset) {
  const nowKst = new Date(Date.now() + 9 * 3600000);
  const date = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() + offset));
  return date.toISOString().slice(0, 10);
}

function iso(date, hour) {
  return `${date}T${String(hour).padStart(2, "0")}:00:00+09:00`;
}

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
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle: async () => table === "kasi_sun_times_cache"
          ? ({ data: { sunrise: `${kstDate(0)}T06:00:00+09:00`, sunset: `${kstDate(0)}T18:00:00+09:00`, source: "KASI" }, error: null })
          : ({ data: null, error: null }),
      };
      return chain;
    },
  };
}

async function runCase({ id, name, region2DepthName }) {
  const resolved = resolveWarningCodes(region2DepthName);
  const client = mockClient();
  const result = await evaluateAndStorePoint(client, {
    id,
    name,
    region: resolved.normalizedRegion,
    lat: 37.75,
    lng: 128.88,
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

  assert(result.today_count === 1, `${name}: TODAY ${result.today_count}/1`);
  assert(result.today_hourly_count === 7, `${name}: TODAY_HOURLY ${result.today_hourly_count}/7`);
  assert(result.short_count === 21, `${name}: SHORT ${result.short_count}/21`);
  assert(result.mid_count === 6, `${name}: MID ${result.mid_count}/6`);
  assert(result.total_upserted === 35, `${name}: dryRun result count ${result.total_upserted}/35`);
  assert(client.tables.filter(table => table === "kasi_sun_times_cache").length === 4, `${name}: KASI Today~+3 범위 위반`);
  assert(!client.tables.includes("points"), `${name}: 공식 points 접근 발생`);
  assert(!client.tables.includes("point_evaluation_results"), `${name}: 공식 Result 저장 접근 발생`);
  return { resolved, result };
}

const supported = await runCase({ id: 1_900_000_001, name: "지원 지역 테스트", region2DepthName: "강릉시" });
assert(supported.resolved.seaCode === "S1151200", "지원 지역 S코드 불일치");
assert(supported.resolved.landCode === "L1022500", "지원 지역 L코드 불일치");
assert(supported.resolved.midCodes?.landRegId === "11D20000", "지원 지역 landRegId 불일치");
assert(supported.resolved.midCodes?.tempRegId === "11D20501", "지원 지역 tempRegId 불일치");
assert(supported.result.results.find(row => row.mode === "TODAY")?.safety_status === "PASS", "지원 지역 Safety PASS 실패");

const unknown = await runCase({ id: 1_900_000_002, name: "UNKNOWN 지역 테스트", region2DepthName: "가평군" });
assert(unknown.resolved.seaCode === null && unknown.resolved.midCodes === null, "UNKNOWN 지역에 임의 매핑이 적용됨");
assert(unknown.result.results.every(row => row.safety_status !== "PASS"), "UNKNOWN을 PASS로 표시할 수 있는 결과 존재");
assert(unknown.result.results.some(row => row.safety_status === "UNKNOWN"), "UNKNOWN Safety 결과 없음");

// DB regions 매칭 테스트 (전국 대응)
const dbRegionsMock = [
  { id: 1, name: "강릉", warning_area_code: "S1151200", land_warning_area_code: "L1022500" },
  { id: 5, name: "울진", warning_area_code: "S1131300", land_warning_area_code: "L1073000" },
  { id: 11, name: "제주", warning_area_code: "S1323000", land_warning_area_code: "L1090000" },
  { id: 16, name: "울릉도", warning_area_code: null, land_warning_area_code: "L1072100" },
];

const jejuResolved = resolveWarningCodes("제주시", dbRegionsMock);
assert(jejuResolved.seaCode === "S1323000", "제주 S코드 불일치");
assert(jejuResolved.landCode === "L1090000", "제주 L코드 불일치");

const ulleungResolved = resolveWarningCodes("울릉군", dbRegionsMock);
assert(ulleungResolved.seaCode === null, "울릉도 S코드는 null이어야 함");
assert(ulleungResolved.landCode === "L1072100", "울릉도 L코드 불일치");

const yeosuResolved = resolveWarningCodes("여수시", dbRegionsMock);
assert(yeosuResolved.seaCode === null && yeosuResolved.landCode === null, "여수 미등록 지역 코드 null이어야 함");

const officialMidCodes = getKmaMidRegionCodes({ id: 1, name: "영진해변", region_id: 1, region: "강릉" });
assert(officialMidCodes.landRegId === "11D20000" && officialMidCodes.tempRegId === "11D20501", "기존 공식 포인트 중기 매핑 영향 발생");

console.log("모든 custom-spots 및 전국 대응 테스트 통과!");
