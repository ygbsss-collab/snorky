/**
 * Single Unified Integration Test for All 3 Corrected Sources:
 * 1. RN1 Cache + 48h History Lookup (48h 조회 구조 완료 / 실제 누적은 Scheduler 연결 후)
 * 2. KASI Strict Resolution (계산 fallback 제거, 결측 시 sunrise/sunset null)
 * 3. KMA Mid Weather (KMA_MID_LAND / KMA_MID_TA 통일 + 06h/18h +4 Preservation)
 * 4. End-to-End Evaluation Orchestration Integration
 */
import assert from "node:assert";
import { loadRn1History } from "../supabase/functions/kma-rn1-cache/index.ts";
import { loadKasiSunTimes } from "../supabase/functions/kasi-sun-times-cache/index.ts";
import { loadMidWeatherForPoint } from "../supabase/functions/kma-mid-weather-cache/index.ts";
import { evaluateAndStorePoint } from "../supabase/functions/_shared/evaluation-orchestrator.ts";
import type { SnorkyPoint } from "../supabase/functions/_shared/kma-grid.ts";

async function runAllSourcesCorrectedTest() {
  console.log("=== Running Corrected Unified Integration Test for 3 Sources ===");

  const point: SnorkyPoint = {
    id: 101,
    name: "사근진해변",
    region_id: "11D20501",
    region: "강릉",
    lat: 37.8055,
    lng: 128.8978,
    warning_area_code: "11D20000",
    updated_at: "2026-08-20T10:00:00+09:00",
    environment: { terrain: "sand", exposure: "high", breakwaterShelter: "low", swellSensitivity: "high", exposureDirection: "E" }
  };

  const todayDateStr = "2026-08-25";
  const refTime = "2026-08-25T14:00:00+09:00";

  // -------------------------------------------------------------
  // 1. RN1 Mock Cache Data (48 hours)
  // -------------------------------------------------------------
  const mockRn1CacheRows = [
    { nx: 92, ny: 132, observed_at: "2026-08-25T13:00:00+09:00", rn1: 3.5, fetched_at: "2026-08-25T13:20:00+09:00", status: "fresh" },
    { nx: 92, ny: 132, observed_at: "2026-08-25T10:00:00+09:00", rn1: 12.0, fetched_at: "2026-08-25T10:20:00+09:00", status: "fresh" },
    { nx: 92, ny: 132, observed_at: "2026-08-24T18:00:00+09:00", rn1: 8.0, fetched_at: "2026-08-24T18:20:00+09:00", status: "fresh" }
  ];

  // -------------------------------------------------------------
  // 2. KASI SunTimes Mock Cache Data
  // -------------------------------------------------------------
  const mockKasiCacheRows = [
    { locdate: "2026-08-25", latitude: 37.81, longitude: 128.9, sunrise: "2026-08-25T05:52:00+09:00", sunset: "2026-08-25T19:12:00+09:00", source: "KASI", fetched_at: "2026-08-25T00:00:00+09:00" }
  ];

  // -------------------------------------------------------------
  // 3. KMA Mid Weather Mock Cache Data (KMA_MID_LAND / KMA_MID_TA)
  // -------------------------------------------------------------
  const mockMidWeatherCacheRows = [
    {
      source: "KMA_MID_LAND",
      reg_id: "11D20000",
      tm_fc: "202608250600",
      forecast_data: {
        wf4Am: "구름많음", wf4Pm: "맑음", rnSt4Am: 30, rnSt4Pm: 10,
        wf5Am: "흐림", wf5Pm: "구름많음", rnSt5Am: 40, rnSt5Pm: 20,
        wf6Am: "맑음", wf6Pm: "맑음", rnSt6Am: 10, rnSt6Pm: 10
      },
      fetched_at: "2026-08-25T06:15:00+09:00"
    },
    {
      source: "KMA_MID_LAND",
      reg_id: "11D20000",
      tm_fc: "202608251800",
      forecast_data: {
        // wf4Am/wf4Pm omitted in 18h KMA API
        wf5Am: "맑음", wf5Pm: "맑음", rnSt5Am: 0, rnSt5Pm: 0,
        wf6Am: "맑음", wf6Pm: "구름많음", rnSt6Am: 10, rnSt6Pm: 20
      },
      fetched_at: "2026-08-25T18:15:00+09:00"
    },
    {
      source: "KMA_MID_TA",
      reg_id: "11D20501",
      tm_fc: "202608250600",
      forecast_data: { taMin4: 21, taMax4: 28, taMin5: 22, taMax5: 29, taMin6: 20, taMax6: 27 },
      fetched_at: "2026-08-25T06:15:00+09:00"
    },
    {
      source: "KMA_MID_TA",
      reg_id: "11D20501",
      tm_fc: "202608251800",
      forecast_data: { taMin5: 22, taMax5: 30, taMin6: 21, taMax6: 28 },
      fetched_at: "2026-08-25T18:15:00+09:00"
    }
  ];

  // -------------------------------------------------------------
  // Mock Supabase Client Supporting All Tables
  // -------------------------------------------------------------
  const mockDbStorage: any[] = [];
  const mockClient: any = {
    from: (tableName: string) => {
      const builder: any = {
        _table: tableName,
        _filters: {},
        select: (_fields: string) => builder,
        eq: (col: string, val: any) => {
          builder._filters[col] = val;
          return builder;
        },
        gte: (col: string, val: any) => {
          builder._filters[`${col}_gte`] = val;
          return builder;
        },
        lte: (col: string, val: any) => {
          builder._filters[`${col}_lte`] = val;
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          if (tableName === "kasi_sun_times_cache") {
            const hit = mockKasiCacheRows.find(r => r.locdate === builder._filters.locdate);
            return { data: hit || null, error: null };
          }
          if (tableName === "kma_mid_weather_cache") {
            const hit = mockMidWeatherCacheRows.find(
              r => r.source === builder._filters.source && r.reg_id === builder._filters.reg_id && r.tm_fc === builder._filters.tm_fc
            );
            return { data: hit || null, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: any) => {
          if (tableName === "kma_rn1_cache") {
            resolve({ data: mockRn1CacheRows, error: null });
          } else {
            resolve({ data: null, error: null });
          }
        },
        upsert: (rows: any[], _options: any) => {
          mockDbStorage.push(...rows);
          return {
            select: async (_cols?: string) => ({
              data: rows.map((r, i) => ({ id: i + 1, ...r })),
              error: null
            })
          };
        }
      };
      return builder;
    }
  };

  // -------------------------------------------------------------
  // Test Component 1: RN1 48h History Loading (Structure verification)
  // -------------------------------------------------------------
  const rn1History = await loadRn1History(mockClient, 92, 132, refTime, 48);
  assert.strictEqual(rn1History.length, 3);
  assert.strictEqual(rn1History[0].rn1, 3.5);
  console.log("✓ 1. RN1 48h History Query OK (48h 조회 구조 완료 / 실제 누적은 Scheduler 연결 후 확인)");

  // -------------------------------------------------------------
  // Test Component 2: KASI SunTimes Strict Resolution (No calculation fallback)
  // -------------------------------------------------------------
  // 2-a. Hit in Cache
  const hitSun = await loadKasiSunTimes(mockClient, point.lat!, point.lng!, todayDateStr);
  assert.strictEqual(hitSun.source, "KASI");
  assert.strictEqual(hitSun.sunrise, "2026-08-25T05:52:00+09:00");
  assert.strictEqual(hitSun.sunset, "2026-08-25T19:12:00+09:00");

  // 2-b. Miss in Cache -> Strict Nulls (No arbitrary calculation fallback)
  const missSun = await loadKasiSunTimes(mockClient, point.lat!, point.lng!, "2026-12-31");
  assert.strictEqual(missSun.source, "KASI");
  assert.strictEqual(missSun.sunrise, null, "Missing KASI must yield null sunrise");
  assert.strictEqual(missSun.sunset, null, "Missing KASI must yield null sunset");
  console.log("✓ 2. KASI Strict Resolution OK (Cache hit returns KASI times, Cache miss returns nulls with NO calculation fallback)");

  // -------------------------------------------------------------
  // Test Component 3: KMA Mid Weather (KMA_MID_LAND / KMA_MID_TA & +4 Preservation)
  // -------------------------------------------------------------
  const midWeather = await loadMidWeatherForPoint(mockClient, "11D20000", "11D20501", todayDateStr);
  const targetDateD4 = "2026-08-29"; // D+4
  const targetDateD5 = "2026-08-30"; // D+5

  const slotD4 = midWeather.slots[targetDateD4];
  const slotD5 = midWeather.slots[targetDateD5];

  assert.ok(slotD4);
  assert.strictEqual(slotD4.weather_am, "구름많음", "+4 weather_am preserved from 06h KMA_MID_LAND");
  assert.strictEqual(slotD4.temp_min, 21, "+4 temp_min preserved from 06h KMA_MID_TA");
  assert.strictEqual(slotD4.source_tm_fc, "202608250600");

  assert.ok(slotD5);
  assert.strictEqual(slotD5.weather_am, "맑음", "+5 weather_am loaded from 18h KMA_MID_LAND");
  assert.strictEqual(slotD5.temp_max, 30, "+5 temp_max loaded from 18h KMA_MID_TA");
  assert.strictEqual(slotD5.source_tm_fc, "202608251800");
  console.log("✓ 3. KMA Mid Weather (KMA_MID_LAND / KMA_MID_TA) OK (D+4 preserved from 06h, D+5 updated from 18h)");

  // -------------------------------------------------------------
  // Test Component 4: End-to-End Orchestration
  // -------------------------------------------------------------
  const baseTimeMs = new Date("2026-08-25T00:00:00+09:00").getTime();
  const marineTimes: string[] = [];
  const marineWaveH: number[] = [];
  const marineCurV: number[] = [];
  for (let h = 0; h < 168; h++) {
    const d = new Date(baseTimeMs + h * 3600000 + 9 * 3600000);
    marineTimes.push(`${d.toISOString().slice(0, 10)}T${String(d.getUTCHours()).padStart(2, "0")}:00`);
    marineWaveH.push(0.35);
    marineCurV.push(0.12);
  }

  const mockMarineCache = {
    fetched_at: "2026-08-25T13:40:00+09:00",
    hourly: {
      time: marineTimes,
      wave_height: marineWaveH,
      wave_period: marineWaveH.map(() => 6.0),
      ocean_current_velocity: marineCurV,
      sea_surface_temperature: marineWaveH.map(() => 24.0)
    }
  };

  const mockKmaWeatherCache = {
    base_time: "20260825_1100",
    fetched_at: "2026-08-25T13:42:00+09:00",
    forecast_data: {
      hourly: [
        { datetime: "2026-08-25 12:00", temperature: 28.0, windSpeed: 3.5, windDirectionDegree: 90, precipitation: 0.0, precipitationProbability: 10 }
      ]
    }
  };

  const orchRes = await evaluateAndStorePoint(
    mockClient,
    point,
    {
      marineCache: mockMarineCache,
      kmaWeatherCache: mockKmaWeatherCache,
      kmaSafetyCache: { warnings: [], fetched_at: "2026-08-25T13:48:00+09:00" },
    },
    { evaluatedAt: "2026-08-25T13:50:00+09:00", dryRun: false }
  );

  assert.strictEqual(orchRes.results.length, 22);
  assert.strictEqual(mockDbStorage.length, 22);
  console.log("✓ 4. End-to-End Orchestrator Pipeline Executed & 22 Rows UPSERTed OK");

  console.log("\nALL 4 REVISED SOURCE INTEGRATION TESTS PASSED SUCCESSFULLY (1/1 SINGLE PASS)!");
}

runAllSourcesCorrectedTest();
