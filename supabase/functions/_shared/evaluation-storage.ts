import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ServerEvaluationResult } from "./evaluation-engine.ts";

import type { SourceIssueTimeDTO } from "./evaluation-dto.ts";

export interface EvaluationResultDbRow {
  point_id: number;
  target_date: string;
  mode: "TODAY" | "TODAY_HOURLY" | "SHORT" | "MID";
  slot_index?: number | null;
  period_start: string;
  period_end: string;
  algorithm_version: string;
  quality_status: "READY" | "PARTIAL" | "UNKNOWN";
  safety_status: "PASS" | "BLOCK" | "UNKNOWN";
  safety_reasons: string[];
  condition_score: number | null;
  condition_status: string;
  visibility_score: number | null;
  visibility_grade: string;
  visibility_explanation: string;
  recommendation: string;
  point_updated_at: string | null;
  forecast_time: string | null;
  source_issue_time: SourceIssueTimeDTO | null;
  evaluated_at: string;
  metrics: Record<string, unknown>;
  min_max_metrics: Record<string, unknown> | null;
  updated_at: string;
}

function addHoursIso(isoStr: string, hours: number): string {
  const d = new Date(isoStr);
  const endMs = d.getTime() + hours * 3600000;
  if (isoStr.endsWith("+09:00")) {
    const endKst = new Date(endMs + 9 * 3600000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = endKst.getUTCFullYear();
    const m = pad(endKst.getUTCMonth() + 1);
    const day = pad(endKst.getUTCDate());
    const h = pad(endKst.getUTCHours());
    const min = pad(endKst.getUTCMinutes());
    const s = pad(endKst.getUTCSeconds());
    return `${y}-${m}-${day}T${h}:${min}:${s}+09:00`;
  }
  return new Date(endMs).toISOString();
}

/**
 * Maps ServerEvaluationResult to DB schema payload.
 * [CRITICAL] 48h History 원본 배열과 Kakao 거리는 저장 대상에서 엄격히 제외된다.
 */
export function mapEvaluationResultToDbRow(
  res: ServerEvaluationResult,
  sourceIssueTime?: Record<string, unknown> | null
): EvaluationResultDbRow {
  const period_start = res.period_start || res.forecast_time || `${res.target_date}T00:00:00+09:00`;
  const period_end = res.period_end || (
    res.forecast_time
      ? addHoursIso(res.forecast_time, res.mode === "SHORT" ? 3 : 1)
      : `${res.target_date}T23:59:59+09:00`
  );

  return {
    point_id: Number(res.point_id),
    target_date: res.target_date,
    mode: res.mode,
    slot_index: res.slot_index ?? null,
    period_start,
    period_end,
    algorithm_version: res.algorithm_version || "V1.5",
    quality_status: res.quality_status,
    safety_status: res.safety_status,
    safety_reasons: Array.isArray(res.safety_reasons) ? res.safety_reasons : [],
    condition_score: res.condition_score !== null && res.condition_score !== undefined ? Math.round(res.condition_score) : null,
    condition_status: res.condition_status,
    visibility_score: res.visibility_score !== null && res.visibility_score !== undefined ? Math.round(res.visibility_score) : null,
    visibility_grade: res.visibility_grade,
    visibility_explanation: res.visibility_explanation,
    recommendation: res.recommendation,
    point_updated_at: res.point_updated_at || null,
    forecast_time: res.forecast_time,
    source_issue_time: (res.source_issue_time || sourceIssueTime) ? {
      marine_issued_at: (res.source_issue_time?.marine_issued_at || sourceIssueTime?.marine_issued_at || null),
      kma_base_time: res.source_issue_time?.kma_base_time || sourceIssueTime?.kma_base_time || null,
      kma_safety_fetched_at: res.source_issue_time?.kma_safety_fetched_at || sourceIssueTime?.kma_safety_fetched_at || null,
      rn1_observed_at: res.source_issue_time?.rn1_observed_at || sourceIssueTime?.rn1_observed_at || null,
      mid_land_base_time: res.source_issue_time?.mid_land_base_time || sourceIssueTime?.mid_land_base_time || null,
      mid_temp_base_time: res.source_issue_time?.mid_temp_base_time || sourceIssueTime?.mid_temp_base_time || null,
      kasi_sun_times_date: res.source_issue_time?.kasi_sun_times_date || sourceIssueTime?.kasi_sun_times_date || res.target_date || null,
      kasi_sun_times_fetched_at: res.source_issue_time?.kasi_sun_times_fetched_at || sourceIssueTime?.kasi_sun_times_fetched_at || null,
    } : null,
    evaluated_at: res.evaluated_at || new Date().toISOString(),
    metrics: res.metrics as Record<string, unknown>,
    min_max_metrics: (res.min_max_metrics as Record<string, unknown>) ?? null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * UPSERT Evaluation Results into point_evaluation_results.
 * On Conflict with (point_id, target_date, mode, period_start, period_end), updates the existing row.
 * Cleans up previous TODAY representative slot if slot shifted to prevent duplicates.
 */
export async function upsertEvaluationResults(
  client: SupabaseClient,
  results: ServerEvaluationResult[],
  sourceIssueTime?: Record<string, unknown> | null
): Promise<{ count: number; error: Error | null }> {
  if (!results.length) return { count: 0, error: null };

  const rows = results.map(r => mapEvaluationResultToDbRow(r, sourceIssueTime));

  const todayRows = rows.filter(r => r.mode === "TODAY");
  if (todayRows.length > 0) {
    for (const tr of todayRows) {
      await client
        .from("point_evaluation_results")
        .delete()
        .eq("point_id", tr.point_id)
        .eq("target_date", tr.target_date)
        .eq("mode", "TODAY")
        .neq("period_start", tr.period_start);
    }
  }

  const { data, error } = await client
    .from("point_evaluation_results")
    .upsert(rows, {
      onConflict: "point_id,target_date,mode,period_start,period_end",
      ignoreDuplicates: false,
    })
    .select("id");

  if (error) {
    return { count: 0, error: new Error(`UPSERT point_evaluation_results failed: ${error.message}`) };
  }

  return { count: data?.length || rows.length, error: null };
}
