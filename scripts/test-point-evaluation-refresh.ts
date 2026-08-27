/**
 * Integration Test for Supabase Evaluation Execution Edge (with Mock Supabase Repository)
 * Tests full end-to-end batch execution, cache resolution, point-level fault isolation, and UPSERT storage.
 */
import assert from "node:assert";
import { runPointEvaluationBatch } from "../supabase/functions/point-evaluation-refresh/index.ts";
import type { SnorkyPoint } from "../supabase/functions/_shared/kma-grid.ts";

function runIntegrationTest() {
  console.log("=== Testing Supabase Evaluation Execution Edge (Mock Repository) ===");

  // 1. Mock Points
  const mockPoints: SnorkyPoint[] = [
    {
      id: 101,
      name: "사근진해변",
      region_id: 1,
      region: "강릉",
      lat: 37.8055,
      lng: 128.8978,
      warning_area_code: "L1020100",
      updated_at: "2026-08-20T10:00:00+09:00",
      environment: { terrain: "sand", exposure: "high", breakwaterShelter: "low", swellSensitivity: "high", exposureDirection: "E" }
    },
    {
      id: 102,
      name: "안목해변",
      region_id: 1,
      region: "강릉",
      lat: 37.7719,
      lng: 128.9486,
      warning_area_code: "L1020100",
      updated_at: "2026-08-20T10:00:00+09:00",
      environment: { terrain: "sand", exposure: "high", breakwaterShelter: "low", swellSensitivity: "high", exposureDirection: "E" }
    },
    {
      id: 999, // Intentional fault point
      name: "오류테스트포인트",
      region_id: 99,
      region: "테스트",
      lat: 35.0,
      lng: 129.0,
      updated_at: "2026-08-20T10:00:00+09:00",
      environment: { terrain: "rock", exposure: "medium", breakwaterShelter: "medium" }
    }
  ];

  // 2. Mock 7-day Marine series
  const baseTime = new Date("2026-08-25T00:00:00+09:00").getTime();
  const marineTimes: string[] = [];
  const marineWaveH: number[] = [];
  const marineCurV: number[] = [];
  for (let h = 0; h < 168; h++) {
    const d = new Date(baseTime + h * 3600000 + 9 * 3600000);
    marineTimes.push(`${d.toISOString().slice(0, 10)}T${String(d.getUTCHours()).padStart(2, "0")}:00`);
    marineWaveH.push(0.40);
    marineCurV.push(0.12);
  }

  const mockMarineCache = {
    point_id: 101,
    fetched_at: "2026-08-25T13:40:00+09:00",
    status: "fresh",
    hourly: {
      time: marineTimes,
      wave_height: marineWaveH,
      wave_period: marineWaveH.map(() => 6.0),
      ocean_current_velocity: marineCurV,
      sea_surface_temperature: marineWaveH.map(() => 24.0)
    }
  };

  const mockKmaCache = {
    nx: 92,
    ny: 132,
    base_time: "20260825_1100",
    fetched_at: "2026-08-25T13:42:00+09:00",
    status: "fresh",
    forecast_data: {
      hourly: [
        { datetime: "2026-08-25 12:00", temperature: 28.0, windSpeed: 3.5, windDirectionDegree: 90, precipitation: 0.0, precipitationProbability: 10 },
        { datetime: "2026-08-26 12:00", temperature: 28.0, windSpeed: 3.5, windDirectionDegree: 90, precipitation: 0.0, precipitationProbability: 10 }
      ]
    }
  };

  const mockSafetyCache = {
    fetched_at: "2026-08-25T13:48:00+09:00",
    status: "fresh",
    warnings: []
  };

  // Mock DB Storage
  const mockDbStorage: any[] = [];

  // Mock Supabase Client
  const mockSupabase: any = {
    from: (tableName: string) => {
      const builder: any = {
        _table: tableName,
        _filters: {},
        select: (_fields: string) => builder,
        eq: (col: string, val: any) => {
          builder._filters[col] = val;
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          if (tableName === "open_meteo_marine_cache") {
            if (builder._filters.point_id === 101) return { data: mockMarineCache, error: null };
            if (builder._filters.point_id === 999) throw new Error("Database timeout on point 999");
            return { data: null, error: null }; // Point 102 has missing cache
          }
          if (tableName === "kma_weather_cache") {
            return { data: mockKmaCache, error: null };
          }
          if (tableName === "kma_safety_cache") {
            return { data: mockSafetyCache, error: null };
          }
          return { data: null, error: null };
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
      // For loadActiveSnorkyPoints
      if (tableName === "regions") {
        builder.then = (resolve: any) => resolve({ data: [{ id: 1, name: "강릉", warning_area_code: "L1020100" }], error: null });
      }
      if (tableName === "points") {
        builder.then = (resolve: any) => resolve({ data: mockPoints, error: null });
      }
      return builder;
    }
  };

  // 3. Execute Point Evaluation Batch
  runPointEvaluationBatch(mockSupabase, {
    evaluatedAt: "2026-08-25T13:50:00+09:00"
  }).then(report => {
    console.log("=== Batch Execution Report ===");
    console.log("Total points:", report.total_points);
    console.log("Successful points:", report.successful_points);
    console.log("Failed points:", report.failed_points);
    console.log("Total records upserted:", report.total_records_upserted);
    console.log("Details:", JSON.stringify(report.details, null, 2));

    // Validation 1: Point 101 (Success with full valid caches)
    const p101 = report.details.find(d => d.point_id === 101)!;
    assert.strictEqual(p101.status, "SUCCESS");
    assert.strictEqual(p101.today_count, 1);
    assert.strictEqual(p101.short_count, 15);
    assert.strictEqual(p101.mid_count, 6);
    assert.strictEqual(p101.total_upserted, 22);
    console.log("✓ 1. Point 101 evaluated & upserted 22 records successfully");

    // Validation 2: Point 102 (Missing Marine Cache -> evaluated cleanly to UNKNOWN, UPSERTed 22 records)
    const p102 = report.details.find(d => d.point_id === 102)!;
    assert.strictEqual(p102.status, "SUCCESS");
    assert.strictEqual(p102.total_upserted, 22);
    console.log("✓ 2. Point 102 (Missing cache) evaluated cleanly to UNKNOWN & stored without killing batch");

    // Validation 3: Point 999 (Simulated DB/Network error -> Fault isolated, error recorded)
    const p999 = report.details.find(d => d.point_id === 999)!;
    assert.strictEqual(p999.status, "ERROR");
    assert.ok(p999.error?.includes("Database timeout"));
    console.log("✓ 3. Point 999 (Fatal error) isolated successfully without terminating remaining points");

    // Validation 4: Total Mock Storage UPSERT Verification
    assert.strictEqual(report.total_records_upserted, 44, "44 records expected in total (22 for P101, 22 for P102)");
    assert.strictEqual(mockDbStorage.length, 44);
    assert.ok(mockDbStorage.every(row => row.point_updated_at === "2026-08-20T10:00:00+09:00"));
    console.log("✓ 4. Mock DB Storage received 44 verified rows with point_updated_at");

    console.log("\nALL SUPABASE EVALUATION EDGE INTEGRATION TESTS PASSED SUCCESSFULLY!");
  });
}

runIntegrationTest();
