import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { loadActiveSnorkyPoints } from "../_shared/snorky-points.ts";
import { evaluateAndStorePoint, type OrchestrationResult } from "../_shared/evaluation-orchestrator.ts";
import type { SnorkyPoint } from "../_shared/kma-grid.ts";
import { resolveWarningCodes, getOrFetchRegions, type RegionRecord } from "../_shared/custom-point-resolver.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-snorky-refresh-secret, x-snorky-user-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });

const elapsedMs = (startedAt: number) => Math.round((performance.now() - startedAt) * 100) / 100;

function getClient(): SupabaseClient {
  const envGetter = (globalThis as any).Deno?.env?.get ? (globalThis as any).Deno.env.get.bind((globalThis as any).Deno.env) : (k: string) => process.env[k];
  const url = envGetter("SUPABASE_URL");
  const key = envGetter("SUPABASE_SERVICE_ROLE_KEY") || envGetter("SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isAuthorized(request: Request): boolean {
  const envGetter = (globalThis as any).Deno?.env?.get ? (globalThis as any).Deno.env.get.bind((globalThis as any).Deno.env) : (k: string) => process.env[k];
  const secret = envGetter("SNORKY_REFRESH_SECRET") || envGetter("KMA_AUTOMATION_SCHEDULER_TOKEN");
  if (!secret) return true; // Local development mode
  const header =
    request.headers.get("x-scheduler-token") ||
    request.headers.get("x-snorky-refresh-secret") ||
    request.headers.get("authorization");
  return header === secret || header === `Bearer ${secret}`;
}

function isCustomUserRequest(request: Request, body: any): boolean {
  const headerUserId = String(request.headers.get("x-snorky-user-id") || "").trim();
  const bodyUserId = String(body?.user_id || "").trim();
  return body?.dry_run === true
    && Boolean(body?.custom_point)
    && headerUserId.length > 0
    && headerUserId.length <= 128
    && headerUserId === bodyUserId;
}

function customPointFromInput(input: any, dbRegions?: RegionRecord[] | null): SnorkyPoint {
  const id = Number(input?.id);
  const name = String(input?.name || "").trim();
  const lat = Number(input?.lat);
  const lng = Number(input?.lng);
  const region2DepthName = String(input?.region_2depth_name || "").trim();

  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) {
    throw new Error("INVALID_CUSTOM_POINT_ID");
  }
  if (!name || name.length > 50) throw new Error("INVALID_CUSTOM_POINT_NAME");
  if (!Number.isFinite(lat) || lat < 32 || lat > 39.8 || !Number.isFinite(lng) || lng < 124 || lng > 132) {
    throw new Error("INVALID_CUSTOM_POINT_COORDINATES");
  }
  if (!region2DepthName || region2DepthName.length > 40) throw new Error("INVALID_CUSTOM_POINT_REGION");

  const resolved = resolveWarningCodes(region2DepthName, dbRegions);
  return {
    id,
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
    updated_at: null,
  };
}

const customEvaluationInFlight = new Map<string, Promise<Record<string, unknown>>>();

async function evaluateCustomPoint(client: SupabaseClient, body: any): Promise<Record<string, unknown>> {
  const requestStartedAt = performance.now();
  const inputStartedAt = performance.now();
  const dbRegions = await getOrFetchRegions(client);
  const point = customPointFromInput(body?.custom_point, dbRegions);
  const pointInputMs = elapsedMs(inputStartedAt);
  const key = [point.id, Number(point.lat).toFixed(5), Number(point.lng).toFixed(5), point.region].join(":");
  const running = customEvaluationInFlight.get(key);
  if (running) return running;

  const task = (async () => {
    const result = await evaluateAndStorePoint(client, point, undefined, {
      dryRun: true,
      modes: ["TODAY", "TODAY_HOURLY", "SHORT", "MID"],
      kasiMaxDayOffset: 3,
    });
    if (result.today_count !== 1 || result.today_hourly_count !== 7 || result.short_count !== 21 || result.mid_count !== 6) {
      throw new Error(
        `INCOMPLETE_CUSTOM_EVALUATION:TODAY=${result.today_count},TODAY_HOURLY=${result.today_hourly_count},SHORT=${result.short_count},MID=${result.mid_count}`
      );
    }
    const response = {
      ok: !result.error,
      dry_run: true,
      persisted: false,
      point: {
        id: point.id,
        name: point.name,
        lat: point.lat,
        lng: point.lng,
        region: point.region,
        warning_area_code: point.warning_area_code,
        land_warning_area_code: point.land_warning_area_code,
        land_reg_id: point.mid_land_reg_id,
        temp_reg_id: point.mid_temp_reg_id,
      },
      counts: {
        today: result.today_count,
        today_hourly: result.today_hourly_count || 0,
        short: result.short_count,
        mid: result.mid_count,
      },
      results: result.results,
      error: result.error || null,
      timings: {
        ...result.timings,
        point_input_ms: pointInputMs,
        total_ms: elapsedMs(requestStartedAt),
      },
    };
    console.info(JSON.stringify({
      event: "custom_point_evaluation_timing",
      point_id: point.id,
      timings: response.timings,
    }));
    return response;
  })().finally(() => customEvaluationInFlight.delete(key));

  customEvaluationInFlight.set(key, task);
  return task;
}

export interface EvaluationRefreshReport {
  ok: boolean;
  run_id: string;
  evaluated_at: string;
  total_points: number;
  successful_points: number;
  failed_points: number;
  total_records_upserted: number;
  details: Array<{
    point_id: string | number;
    point_name: string;
    today_count: number;
    short_count: number;
    mid_count: number;
    total_upserted: number;
    status: "SUCCESS" | "ERROR";
    error?: string | null;
  }>;
}

/**
 * Main evaluation batch runner with robust point-level and mode-level fault isolation.
 */
export async function runPointEvaluationBatch(
  client: SupabaseClient,
  options: {
    pointIds?: Array<number | string>;
    dryRun?: boolean;
    evaluatedAt?: string;
    modes?: Array<"TODAY" | "TODAY_HOURLY" | "SHORT" | "MID">;
  } = {}
): Promise<EvaluationRefreshReport> {
  const runId = crypto.randomUUID();
  const evaluatedAt = options.evaluatedAt || new Date().toISOString();

  // 1. Load active points with environments and warning area codes
  const allPoints = await loadActiveSnorkyPoints(client);
  const targetPoints = options.pointIds?.length
    ? allPoints.filter(p => options.pointIds!.map(String).includes(String(p.id)))
    : allPoints;

  const details: EvaluationRefreshReport["details"] = [];
  let successfulPoints = 0;
  let failedPoints = 0;
  let totalRecordsUpserted = 0;

  // 2. Evaluate each point with fault isolation
  for (const point of targetPoints) {
    try {
      const result: OrchestrationResult = await evaluateAndStorePoint(
        client,
        point,
        undefined, // automatically loads caches from Supabase
        {
          evaluatedAt,
          dryRun: Boolean(options.dryRun),
          modes: options.modes,
        }
      );

      if (result.error) {
        failedPoints++;
        details.push({
          point_id: point.id,
          point_name: point.name,
          today_count: result.today_count,
          short_count: result.short_count,
          mid_count: result.mid_count,
          total_upserted: 0,
          status: "ERROR",
          error: result.error,
        });
      } else {
        successfulPoints++;
        totalRecordsUpserted += result.total_upserted;
        details.push({
          point_id: point.id,
          point_name: point.name,
          today_count: result.today_count,
          short_count: result.short_count,
          mid_count: result.mid_count,
          total_upserted: result.total_upserted,
          status: "SUCCESS",
          error: null,
        });
      }
    } catch (pointError: any) {
      // Point-level fault isolation: does not kill the entire batch
      failedPoints++;
      details.push({
        point_id: point.id,
        point_name: point.name,
        today_count: 0,
        short_count: 0,
        mid_count: 0,
        total_upserted: 0,
        status: "ERROR",
        error: String(pointError?.message || pointError),
      });
    }
  }

  return {
    ok: failedPoints === 0,
    run_id: runId,
    evaluated_at: evaluatedAt,
    total_points: targetPoints.length,
    successful_points: successfulPoints,
    failed_points: failedPoints,
    total_records_upserted: totalRecordsUpserted,
    details,
  };
}

if (typeof (globalThis as any).Deno !== "undefined" && (globalThis as any).Deno?.serve) {
  (globalThis as any).Deno.serve(async (request: Request) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "POST" && request.method !== "GET") {
      return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    }

    try {
      const client = await getClient();
      let body: any = {};
      if (request.method === "POST") {
        try {
          body = await request.json();
        } catch (_) {
          body = {};
        }
      }

      const customRequest = Boolean(body?.custom_point);
      if (!isAuthorized(request) && !isCustomUserRequest(request, body)) {
        return json({ ok: false, error: "UNAUTHORIZED" }, 401);
      }

      if (customRequest) {
        if (!isCustomUserRequest(request, body)) {
          return json({ ok: false, error: "CUSTOM_POINT_LOGIN_REQUIRED" }, 401);
        }
        try {
          return json(await evaluateCustomPoint(client, body), 200);
        } catch (customError: any) {
          return json({
            ok: false,
            dry_run: true,
            persisted: false,
            error: String(customError?.message || customError),
          }, 400);
        }
      }

      const report = await runPointEvaluationBatch(client, {
        pointIds: body?.point_ids,
        dryRun: Boolean(body?.dry_run),
        evaluatedAt: body?.evaluated_at,
        modes: body?.modes,
      });

      return json(report, 200);
    } catch (error: any) {
      return json(
        {
          ok: false,
          error: "EVALUATION_BATCH_FAILED",
          message: String(error?.message || error),
        },
        500
      );
    }
  });
}
