import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { loadActiveSnorkyPoints } from "../_shared/snorky-points.ts";
import { evaluateAndStorePoint, type OrchestrationResult } from "../_shared/evaluation-orchestrator.ts";
import type { SnorkyPoint } from "../_shared/kma-grid.ts";
import { resolveWarningCodes, getOrFetchRegions, type RegionRecord } from "../_shared/custom-point-resolver.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-scheduler-token, x-snorky-refresh-secret, x-snorky-user-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DEFAULT_BATCH_SIZE = 8;
const MAX_BATCH_SIZE = 12;
const DEFAULT_RESULT_FRESH_MINUTES = 30;
const REQUIRED_MODE_COUNTS = {
  TODAY: 1,
  TODAY_HOURLY: 7,
  SHORT: 21,
  MID: 6,
} as const;

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
  const secret = envGetter("KMA_REFRESH_SECRET");
  if (!secret) return false;
  const header =
    request.headers.get("x-scheduler-token") ||
    request.headers.get("x-snorky-refresh-secret") ||
    request.headers.get("authorization");
  return header === secret || header === `Bearer ${secret}`;
}

function isAnonAuthorized(request: Request): boolean {
  const envGetter = (globalThis as any).Deno?.env?.get ? (globalThis as any).Deno.env.get.bind((globalThis as any).Deno.env) : (k: string) => process.env[k];
  const anonKey = String(envGetter("SUPABASE_ANON_KEY") || "");
  const apiKey = String(request.headers.get("apikey") || "");
  const authorization = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (anonKey && (apiKey === anonKey || authorization === anonKey)) return true;
  return apiKey.startsWith("sb_publishable_") && authorization === apiKey;
}

function parsePointId(value: unknown): number | null {
  const pointId = Number(value);
  return Number.isSafeInteger(pointId) && pointId > 0 && pointId <= 2_147_483_647 ? pointId : null;
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
  if (region2DepthName && region2DepthName.length > 40) throw new Error("INVALID_CUSTOM_POINT_REGION");

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

type EvaluationMode = keyof typeof REQUIRED_MODE_COUNTS;

interface FreshEvaluationLookup {
  fresh: boolean;
  status: "HIT" | "MISS" | "STALE";
  rows: Array<Record<string, any>>;
  counts: Record<EvaluationMode, number>;
  evaluatedAt: string | null;
}

function getKstDateString(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addUtcDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getResultFreshMinutes(): number {
  const envGetter = (globalThis as any).Deno?.env?.get ? (globalThis as any).Deno.env.get.bind((globalThis as any).Deno.env) : (k: string) => process.env[k];
  const configured = Number(envGetter("POINT_EVALUATION_FRESH_MINUTES"));
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RESULT_FRESH_MINUTES;
}

const REQUIRED_MARINE_METRIC_KEYS = [
  "wave_height",
  "sea_temperature",
] as const;

const REQUIRED_WIND_METRIC_KEYS = [
  "wind_speed",
  "wind_direction_degree",
] as const;

function hasFiniteMetrics(
  metrics: Record<string, any>,
  keys: readonly string[]
): boolean {
  return keys.every((key) => Number.isFinite(metrics[key]));
}

function hasMetricKeys(
  metrics: Record<string, any>,
  keys: readonly string[]
): boolean {
  return keys.every((key) => Object.prototype.hasOwnProperty.call(metrics, key));
}

function hasCurrentMetrics(row: Record<string, any>, todayKst: string): boolean {
  if (row.mode === "MID") return true;
  const metrics = row.metrics;
  if (!metrics || typeof metrics !== "object") return false;

  const mode = String(row.mode);
  if (mode === "TODAY" || mode === "TODAY_HOURLY") {
    return hasMetricKeys(metrics, [
      ...REQUIRED_MARINE_METRIC_KEYS,
      ...REQUIRED_WIND_METRIC_KEYS,
    ]);
  }
  if (!hasFiniteMetrics(metrics, REQUIRED_MARINE_METRIC_KEYS)) return false;
  if (mode === "SHORT") {
    const targetDate = String(row.target_date || "").slice(0, 10);
    if (targetDate === addUtcDays(todayKst, 3)) return true;
    return targetDate >= addUtcDays(todayKst, 1)
      && targetDate <= addUtcDays(todayKst, 2)
      && hasFiniteMetrics(metrics, REQUIRED_WIND_METRIC_KEYS);
  }
  return false;
}

function isInCurrentModeHorizon(row: Record<string, any>, todayKst: string): boolean {
  const mode = String(row.mode);
  const targetDate = String(row.target_date || "").slice(0, 10);
  if (mode === "TODAY" || mode === "TODAY_HOURLY") return targetDate === todayKst;
  if (mode === "SHORT") {
    return targetDate >= addUtcDays(todayKst, 1) && targetDate <= addUtcDays(todayKst, 3);
  }
  if (mode === "MID") {
    return targetDate >= addUtcDays(todayKst, 4) && targetDate <= addUtcDays(todayKst, 6);
  }
  return false;
}

async function findFreshEvaluationResults(
  client: SupabaseClient,
  pointId: number | string,
  now = new Date()
): Promise<FreshEvaluationLookup> {
  const todayKst = getKstDateString(now);
  const horizonEnd = addUtcDays(todayKst, 6);
  const cutoffMs = now.getTime() - getResultFreshMinutes() * 60_000;
  const { data, error } = await client
    .from("point_evaluation_results")
    .select("*")
    .eq("point_id", Number(pointId))
    .in("mode", Object.keys(REQUIRED_MODE_COUNTS))
    .gte("target_date", todayKst)
    .lte("target_date", horizonEnd)
    .order("target_date", { ascending: true })
    .order("period_start", { ascending: true });

  if (error) throw error;
  const rows = (data || []) as Array<Record<string, any>>;
  const freshRows = rows.filter((row) => {
    const evaluatedMs = new Date(String(row.evaluated_at || "")).getTime();
    return Number.isFinite(evaluatedMs)
      && evaluatedMs >= cutoffMs
      && isInCurrentModeHorizon(row, todayKst)
      && hasCurrentMetrics(row, todayKst);
  });
  const counts = { TODAY: 0, TODAY_HOURLY: 0, SHORT: 0, MID: 0 } as Record<EvaluationMode, number>;
  freshRows.forEach((row) => {
    const mode = String(row.mode) as EvaluationMode;
    if (mode in counts) counts[mode] += 1;
  });
  const fresh = (Object.entries(REQUIRED_MODE_COUNTS) as Array<[EvaluationMode, number]>)
    .every(([mode, requiredCount]) => counts[mode] === requiredCount);
  const evaluatedAt = freshRows.reduce<string | null>((latest, row) => {
    const value = String(row.evaluated_at || "");
    return value && (!latest || value > latest) ? value : latest;
  }, null);

  return {
    fresh,
    status: fresh ? "HIT" : (rows.length ? "STALE" : "MISS"),
    rows: freshRows,
    counts,
    evaluatedAt,
  };
}

const pointEvaluationInFlight = new Map<string, Promise<Record<string, unknown>>>();

async function evaluatePointOnDemand(
  client: SupabaseClient,
  pointId: number
): Promise<Record<string, unknown>> {
  const key = String(pointId);
  const running = pointEvaluationInFlight.get(key);
  if (running) return running;

  const task = (async () => {
    const cached = await findFreshEvaluationResults(client, pointId);
    if (cached.fresh) {
      return {
        ok: true,
        point_id: pointId,
        cache: "HIT",
        evaluated: false,
        evaluated_at: cached.evaluatedAt,
        counts: cached.counts,
        results: cached.rows,
      };
    }

    const points = await loadActiveSnorkyPoints(client);
    const point = points.find((candidate) => String(candidate.id) === key);
    if (!point) throw new Error("POINT_NOT_FOUND");

    const result = await evaluateAndStorePoint(client, point, undefined, {
      modes: ["TODAY", "TODAY_HOURLY", "SHORT", "MID"],
    });
    if (result.error) throw new Error(result.error);
    if (
      result.today_count !== REQUIRED_MODE_COUNTS.TODAY
      || result.today_hourly_count !== REQUIRED_MODE_COUNTS.TODAY_HOURLY
      || result.short_count !== REQUIRED_MODE_COUNTS.SHORT
      || result.mid_count !== REQUIRED_MODE_COUNTS.MID
    ) {
      throw new Error(
        `INCOMPLETE_POINT_EVALUATION:TODAY=${result.today_count},TODAY_HOURLY=${result.today_hourly_count},SHORT=${result.short_count},MID=${result.mid_count}`
      );
    }

    return {
      ok: true,
      point_id: pointId,
      point_name: point.name,
      cache: cached.status,
      evaluated: true,
      persisted: true,
      evaluated_at: new Date().toISOString(),
      counts: {
        TODAY: result.today_count,
        TODAY_HOURLY: result.today_hourly_count,
        SHORT: result.short_count,
        MID: result.mid_count,
      },
      total_upserted: result.total_upserted,
      results: result.results,
    };
  })().finally(() => pointEvaluationInFlight.delete(key));

  pointEvaluationInFlight.set(key, task);
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
  batch_offset?: number;
  batch_size?: number;
  has_more?: boolean;
  details: Array<{
    point_id: string | number;
    point_name: string;
    today_count: number;
    today_hourly_count?: number;
    short_count: number;
    mid_count: number;
    total_upserted: number;
    status: "SUCCESS" | "ERROR";
    cache_status?: "HIT" | "MISS" | "STALE";
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
    batchOffset?: number;
    batchSize?: number;
  } = {}
): Promise<EvaluationRefreshReport> {
  const runId = crypto.randomUUID();
  const evaluatedAt = options.evaluatedAt || new Date().toISOString();

  // 1. Load active points with environments and warning area codes
  const allPoints = await loadActiveSnorkyPoints(client);
  const matchingPoints = options.pointIds?.length
    ? allPoints.filter(p => options.pointIds!.map(String).includes(String(p.id)))
    : allPoints;
  const batchOffset = Math.max(0, Math.floor(Number(options.batchOffset) || 0));
  const batchSize = options.batchSize && Number(options.batchSize) > 0
    ? Math.min(MAX_BATCH_SIZE, Math.floor(Number(options.batchSize)))
    : undefined;
  const targetPoints = batchSize
    ? matchingPoints.slice(batchOffset, batchOffset + batchSize)
    : matchingPoints;

  const details: EvaluationRefreshReport["details"] = [];
  let successfulPoints = 0;
  let failedPoints = 0;
  let totalRecordsUpserted = 0;

  // 2. Evaluate each point with fault isolation
  for (const point of targetPoints) {
    try {
      if (!options.dryRun) {
        const cached = await findFreshEvaluationResults(client, point.id);
        if (cached.fresh) {
          successfulPoints++;
          details.push({
            point_id: point.id,
            point_name: point.name,
            today_count: cached.counts.TODAY,
            today_hourly_count: cached.counts.TODAY_HOURLY,
            short_count: cached.counts.SHORT,
            mid_count: cached.counts.MID,
            total_upserted: 0,
            status: "SUCCESS",
            cache_status: "HIT",
            error: null,
          });
          continue;
        }
      }

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
          today_hourly_count: result.today_hourly_count,
          short_count: result.short_count,
          mid_count: result.mid_count,
          total_upserted: 0,
          status: "ERROR",
          cache_status: "MISS",
          error: result.error,
        });
      } else {
        successfulPoints++;
        totalRecordsUpserted += result.total_upserted;
        details.push({
          point_id: point.id,
          point_name: point.name,
          today_count: result.today_count,
          today_hourly_count: result.today_hourly_count,
          short_count: result.short_count,
          mid_count: result.mid_count,
          total_upserted: result.total_upserted,
          status: "SUCCESS",
          cache_status: "MISS",
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
        today_hourly_count: 0,
        short_count: 0,
        mid_count: 0,
        total_upserted: 0,
        status: "ERROR",
        cache_status: "MISS",
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
    batch_offset: batchOffset,
    batch_size: targetPoints.length,
    has_more: batchOffset + targetPoints.length < matchingPoints.length,
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
      const schedulerAuthorized = isAuthorized(request);
      const requestUrl = new URL(request.url);
      const rawPointId = body?.point_id ?? requestUrl.searchParams.get("point_id");
      const hasSinglePointRequest = rawPointId !== undefined && rawPointId !== null && String(rawPointId).trim() !== "";

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

      if (hasSinglePointRequest) {
        const pointId = parsePointId(rawPointId);
        if (!pointId) return json({ ok: false, error: "INVALID_POINT_ID" }, 400);
        if (!schedulerAuthorized && !isAnonAuthorized(request)) {
          return json({ ok: false, error: "UNAUTHORIZED" }, 401);
        }
        try {
          return json(await evaluatePointOnDemand(client, pointId), 200);
        } catch (pointError: any) {
          const message = String(pointError?.message || pointError);
          return json({
            ok: false,
            point_id: pointId,
            error: message === "POINT_NOT_FOUND" ? "POINT_NOT_FOUND" : "POINT_EVALUATION_FAILED",
            message,
          }, message === "POINT_NOT_FOUND" ? 404 : 500);
        }
      }

      if (!schedulerAuthorized) {
        return json({ ok: false, error: "UNAUTHORIZED" }, 401);
      }

      const requestedBatchSize = Number(body?.batch_size);
      const batchSize = Number.isFinite(requestedBatchSize) && requestedBatchSize > 0
        ? Math.min(MAX_BATCH_SIZE, Math.floor(requestedBatchSize))
        : DEFAULT_BATCH_SIZE;
      const requestedBatchIndex = Number(body?.batch_index);
      const batchIndex = Number.isFinite(requestedBatchIndex) && requestedBatchIndex >= 0
        ? Math.floor(requestedBatchIndex)
        : 0;
      const requestedBatchOffset = Number(body?.batch_offset);
      const batchOffset = Number.isFinite(requestedBatchOffset) && requestedBatchOffset >= 0
        ? Math.floor(requestedBatchOffset)
        : batchIndex * batchSize;

      const report = await runPointEvaluationBatch(client, {
        pointIds: body?.point_ids,
        dryRun: Boolean(body?.dry_run),
        evaluatedAt: body?.evaluated_at,
        modes: body?.modes,
        batchOffset,
        batchSize,
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
