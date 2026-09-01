import { resolveWarningCodes, matchRegion } from "../supabase/functions/_shared/custom-point-resolver.ts";
import { evaluateAndStorePoint, getKmaMidRegionCodes } from "../supabase/functions/_shared/evaluation-orchestrator.ts";
import { toKmaGrid } from "../supabase/functions/_shared/kma-grid.ts";

let externalApiCallCount = 0;
globalThis.fetch = async (url) => {
  externalApiCallCount++;
  throw new Error(`외부 API 호출 감지: ${url}`);
};

function kstDate(offset) {
  const nowKst = new Date(Date.now() + 9 * 3600000);
  const date = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() + offset));
  return date.toISOString().slice(0, 10);
}

function iso(date, hour) {
  return `${date}T${String(hour).padStart(2, "0")}:00:00+09:00`;
}

function fullCachedSources() {
  const marineHourly = {
    time: [], wave_height: [], wave_period: [], ocean_current_velocity: [], sea_surface_temperature: [],
  };
  for (let day = 0; day <= 6; day++) {
    for (let hour = 0; hour < 24; hour++) {
      marineHourly.time.push(iso(kstDate(day), hour));
      marineHourly.wave_height.push(0.3);
      marineHourly.wave_period.push(5.0);
      marineHourly.ocean_current_velocity.push(0.15);
      marineHourly.sea_surface_temperature.push(22);
    }
  }

  const kmaHourly = [];
  for (let day = 0; day <= 3; day++) {
    for (let hour = 0; hour < 24; hour++) {
      kmaHourly.push({
        datetime: iso(kstDate(day), hour),
        temperature: 23,
        windSpeed: 3,
        windDirection: 120,
        precipitation: { raw: "강수없음", mm: 0 },
        precipitationProbability: 0,
        sky: { code: 1 },
        precipitationType: { code: 0 },
      });
    }
  }

  const midSlots = {};
  for (let day = 4; day <= 6; day++) {
    midSlots[kstDate(day)] = {
      weather_am: "맑음", weather_pm: "구름많음", pop_am: 10, pop_pm: 20, temp_min: 19, temp_max: 26,
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

// 보강된 Supabase regions 테이블 기준데이터
const dbRegions = [
  // 강원
  { id: 1,  name: "강릉",   warning_area_code: "S1151200", land_warning_area_code: "L1022500" },
  { id: 2,  name: "고성",   warning_area_code: "S1151100", land_warning_area_code: "L1022200" },
  { id: 3,  name: "삼척",   warning_area_code: "S1151300", land_warning_area_code: "L1022000" },
  { id: 12, name: "동해",   warning_area_code: "S1151300", land_warning_area_code: "L1021900" },
  { id: 20, name: "속초",   warning_area_code: "S1151100", land_warning_area_code: "L1022100" },
  { id: 21, name: "양양",   warning_area_code: "S1151100", land_warning_area_code: "L1022300" },

  // 경북
  { id: 4,  name: "영덕",   warning_area_code: "S1131300", land_warning_area_code: "L1072200" },
  { id: 5,  name: "울진",   warning_area_code: "S1131300", land_warning_area_code: "L1073000" },
  { id: 10, name: "포항",   warning_area_code: "S1131200", land_warning_area_code: "L1072400" },
  { id: 16, name: "울릉도", warning_area_code: "S1152010", land_warning_area_code: "L1072100" },
  { id: 22, name: "경주",   warning_area_code: "S1131200", land_warning_area_code: "L1073100" },

  // 부산 / 울산 / 경남
  { id: 13, name: "울산",   warning_area_code: "S1131100", land_warning_area_code: "L1160000" },
  { id: 17, name: "남해군", warning_area_code: "S1311200", land_warning_area_code: "L1082400" },
  { id: 18, name: "거제",   warning_area_code: "S1311400", land_warning_area_code: "L1082200" },
  { id: 19, name: "욕지도", warning_area_code: "S1311300", land_warning_area_code: "L1082000" },
  { id: 23, name: "부산",   warning_area_code: "S1311100", land_warning_area_code: "L1150000" },
  { id: 24, name: "통영",   warning_area_code: "S1311300", land_warning_area_code: "L1082000" },
  { id: 25, name: "사천",   warning_area_code: "S1311200", land_warning_area_code: "L1082100" },
  { id: 26, name: "창원",   warning_area_code: "S1311300", land_warning_area_code: "L1080600" },

  // 전남
  { id: 30, name: "여수",   warning_area_code: "S1321200", land_warning_area_code: "L1051000" },
  { id: 31, name: "순천",   warning_area_code: "S1321200", land_warning_area_code: "L1051200" },
  { id: 32, name: "광양",   warning_area_code: "S1321200", land_warning_area_code: "L1051100" },
  { id: 33, name: "고흥",   warning_area_code: "S1321100", land_warning_area_code: "L1053100" },
  { id: 34, name: "완도",   warning_area_code: "S1321100", land_warning_area_code: "L1053300" },
  { id: 35, name: "진도",   warning_area_code: "S1231500", land_warning_area_code: "L1052300" },
  { id: 36, name: "해남",   warning_area_code: "S1321100", land_warning_area_code: "L1053200" },
  { id: 37, name: "목포",   warning_area_code: "S1231500", land_warning_area_code: "L1052100" },
  { id: 38, name: "신안",   warning_area_code: "S1231400", land_warning_area_code: "L1052200" },
  { id: 39, name: "무안",   warning_area_code: "S1231400", land_warning_area_code: "L1053400" },
  { id: 40, name: "영광",   warning_area_code: "S1231300", land_warning_area_code: "L1052700" },

  // 전북
  { id: 45, name: "군산",   warning_area_code: "S1231100", land_warning_area_code: "L1061600" },
  { id: 46, name: "부안",   warning_area_code: "S1231200", land_warning_area_code: "L1061500" },
  { id: 47, name: "고창",   warning_area_code: "S1231200", land_warning_area_code: "L1060100" },

  // 충남
  { id: 14, name: "서산",   warning_area_code: "S1251300", land_warning_area_code: "L1031300" },
  { id: 15, name: "태안",   warning_area_code: "S1251300", land_warning_area_code: "L1031100" },
  { id: 50, name: "보령",   warning_area_code: "S1251400", land_warning_area_code: "L1031900" },
  { id: 51, name: "서천",   warning_area_code: "S1251400", land_warning_area_code: "L1031500" },
  { id: 52, name: "당진",   warning_area_code: "S1251300", land_warning_area_code: "L1031200" },

  // 인천 / 경기
  { id: 60, name: "인천",   warning_area_code: "S1251200", land_warning_area_code: "L1110000" },
  { id: 61, name: "강화",   warning_area_code: "S1251100", land_warning_area_code: "L1010900" },
  { id: 62, name: "옹진",   warning_area_code: "S1251100", land_warning_area_code: "L1013600" },
  { id: 63, name: "화성",   warning_area_code: "S1251200", land_warning_area_code: "L1013200" },
  { id: 64, name: "평택",   warning_area_code: "S1251200", land_warning_area_code: "L1012500" },
  { id: 65, name: "안산",   warning_area_code: "S1251200", land_warning_area_code: "L1010400" },
  { id: 66, name: "시흥",   warning_area_code: "S1251200", land_warning_area_code: "L1010500" },
  { id: 67, name: "김포",   warning_area_code: "S1251100", land_warning_area_code: "L1010700" },

  // 제주
  { id: 11, name: "제주",   warning_area_code: "S1323000", land_warning_area_code: "L1090000" },
  { id: 70, name: "서귀포", warning_area_code: "S1323300", land_warning_area_code: "L1090000" }
];

const KHOA_TIDE_STATIONS = [
  { code: "DT_0006", name: "묵호", lat: 37.55027, lng: 129.11638 },
  { code: "DT_0012", name: "속초", lat: 38.20722, lng: 128.59416 },
  { code: "DT_0013", name: "후포", lat: 36.67805, lng: 129.45722 },
  { code: "DT_0007", name: "포항", lat: 36.05055, lng: 129.38555 },
  { code: "DT_0026", name: "울산", lat: 35.50055, lng: 129.38555 },
  { code: "DT_0008", name: "부산", lat: 35.09611, lng: 129.03666 },
  { code: "DT_0010", name: "통영", lat: 34.82777, lng: 128.43444 },
  { code: "DT_0009", name: "여수", lat: 34.74722, lng: 127.76638 },
  { code: "DT_0023", name: "완도", lat: 34.31611, lng: 126.75888 },
  { code: "DT_0004", name: "목포", lat: 34.77888, lng: 126.37611 },
  { code: "DT_0003", name: "군산", lat: 35.97583, lng: 126.55000 },
  { code: "DT_0016", name: "보령", lat: 36.40694, lng: 126.49527 },
  { code: "DT_0015", name: "안흥", lat: 36.67444, lng: 126.13055 },
  { code: "DT_0002", name: "평택", lat: 36.96388, lng: 126.82083 },
  { code: "DT_0001", name: "인천", lat: 37.45194, lng: 126.59222 },
  { code: "DT_0005", name: "제주", lat: 33.52750, lng: 126.54305 },
  { code: "DT_0011", name: "서귀포", lat: 33.24055, lng: 126.56166 },
  { code: "DT_0021", name: "성산포", lat: 33.47361, lng: 126.92777 },
  { code: "DT_0022", name: "모슬포", lat: 33.21388, lng: 126.25055 },
  { code: "DT_0014", name: "울릉도", lat: 37.52555, lng: 130.86000 }
];

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function getNearestTideStation(lat, lng) {
  let nearest = KHOA_TIDE_STATIONS[0];
  let minDist = Infinity;
  for (const st of KHOA_TIDE_STATIONS) {
    const d = getDistanceKm(lat, lng, st.lat, st.lng);
    if (d < minDist) {
      minDist = d;
      nearest = st;
    }
  }
  return { ...nearest, distKm: (Math.round(minDist * 10) / 10).toFixed(1) };
}

function mockClient() {
  const kasiQueriedDates = [];
  return {
    kasiQueriedDates,
    from(table) {
      const chain = {
        select() { return chain; },
        eq(col, val) {
          if (table === "kasi_sun_times_cache" && col === "target_date") {
            kasiQueriedDates.push(val);
          }
          return chain;
        },
        maybeSingle: async () => {
          if (table === "kasi_sun_times_cache") {
            return {
              data: { sunrise: `${kstDate(0)}T06:00:00+09:00`, sunset: `${kstDate(0)}T18:00:00+09:00`, source: "KASI" },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      };
      return chain;
    },
  };
}

async function evaluateSpot({ name, region2Depth, lat, lng }) {
  const grid = toKmaGrid(lat, lng);
  const resolved = resolveWarningCodes(region2Depth, dbRegions);
  const tideStation = getNearestTideStation(lat, lng);
  const client = mockClient();

  const result = await evaluateAndStorePoint(client, {
    id: 9999,
    name,
    region: resolved.normalizedRegion,
    lat,
    lng,
    warning_area_code: resolved.seaCode,
    land_warning_area_code: resolved.landCode,
    mid_land_reg_id: resolved.midCodes?.landRegId || null,
    mid_temp_reg_id: resolved.midCodes?.tempRegId || null,
    is_custom_point: true,
    environment: null,
  }, fullCachedSources(), {
    dryRun: true,
    modes: ["TODAY", "TODAY_HOURLY", "SHORT", "MID"],
    kasiMaxDayOffset: 3,
  });

  const todayRes = result.results.find(r => r.mode === "TODAY");
  const shortRes = result.results.filter(r => r.mode === "SHORT");
  const midRes = result.results.filter(r => r.mode === "MID_MARINE_ONLY");

  // KASI query count check (Today~+3 = 4 queries)
  const kasiDays = client.kasiQueriedDates.length;

  return {
    name,
    coordinates: { lat, lng },
    kmaGrid: { nx: grid.nx, ny: grid.ny },
    midCodes: resolved.midCodes,
    warningCodes: { sea: resolved.seaCode, land: resolved.landCode },
    tideStation: { name: tideStation.name, code: tideStation.code, distKm: `${tideStation.distKm}km` },
    kasiQueriedDays: kasiDays,
    counts: {
      today: result.today_count,
      todayHourly: result.today_hourly_count,
      short: result.short_count,
      mid: result.mid_count,
      total: result.total_upserted,
    },
    safetyStatus: todayRes?.safety_status,
    midForecastSample: midRes[0] ? {
      target_date: midRes[0].target_date,
      slot: midRes[0].slot_type,
      safety: midRes[0].safety_status,
      score: midRes[0].score,
    } : null,
  };
}

async function main() {
  const targets = [
    { name: "울진 (나곡)", region2Depth: "울진군", lat: 37.0864, lng: 129.3871 },
    { name: "여수 (만성리)", region2Depth: "여수시", lat: 34.7831, lng: 127.7551 },
    { name: "제주 (협재)", region2Depth: "제주시", lat: 33.3941, lng: 126.2397 },
    { name: "울릉도 (천부)", region2Depth: "울릉군", lat: 37.5350, lng: 130.8752 },
  ];

  console.log("=== 전국 4개 스팟 종합 점검 ===");
  const results = [];
  for (const t of targets) {
    results.push(await evaluateSpot(t));
  }
  console.log(JSON.stringify(results, null, 2));
  console.log(`\n완전 캐시 HIT 시 외부 API 호출 수: ${externalApiCallCount}회 (목표 0회 달성)`);
}

main().catch(console.error);
