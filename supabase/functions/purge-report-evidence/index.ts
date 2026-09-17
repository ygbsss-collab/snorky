import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ ok: false, message: "허용되지 않은 요청입니다." }, 405);

  const schedulerToken = Deno.env.get("PURGE_REPORT_EVIDENCE_SCHEDULER_TOKEN") || "";
  const providedToken = request.headers.get("x-scheduler-token") || "";
  if (!schedulerToken || providedToken !== schedulerToken) {
    return json({ ok: false, message: "인증되지 않은 요청입니다." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, message: "서버 설정이 누락되었습니다." }, 503);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: reports, error: loadError } = await supabase
    .from("user_reports")
    .select("id, image_paths, evidence_delete_at")
    .not("evidence_delete_at", "is", null)
    .lte("evidence_delete_at", new Date().toISOString())
    .limit(100);

  if (loadError) return json({ ok: false, message: "삭제 대상 신고 증거를 조회하지 못했습니다." }, 500);

  let deleted = 0;
  let failed = 0;
  for (const report of reports || []) {
    const paths = Array.isArray(report.image_paths)
      ? report.image_paths.filter((path: unknown): path is string => typeof path === "string" && path.length > 0)
      : [];
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage.from("report-evidence").remove(paths);
      if (storageError) {
        failed += 1;
        console.error("[purge-report-evidence] storage delete failed", { reportId: report.id, message: storageError.message });
        continue;
      }
    }

    const { error: markError } = await supabase
      .from("user_reports")
      .update({ image_paths: [], evidence_delete_at: null, evidence_deleted_at: new Date().toISOString() })
      .eq("id", report.id);
    if (markError) {
      failed += 1;
      console.error("[purge-report-evidence] report update failed", { reportId: report.id, message: markError.message });
      continue;
    }
    deleted += 1;
  }

  return json({ ok: failed === 0, deleted, failed });
});
