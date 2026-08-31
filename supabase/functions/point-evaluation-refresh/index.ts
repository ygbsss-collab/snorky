import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { loadActiveSnorkyPoints } from "../_shared/snorky-points.ts";
import { evaluateAndStorePoint, type OrchestrationResult } from "../_shared/evaluation-orchestrator.ts";
import type { SnorkyPoint } from "../_shared/kma-grid.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-snorky-refresh-secret",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });

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

    if (!isAuthorized(request)) {
      return json({ ok: false, error: "UNAUTHORIZED" }, 401);
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
