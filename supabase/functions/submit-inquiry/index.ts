import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const INQUIRY_TYPES = new Set(["point_correction", "point_report", "other"]);
const POINT_INQUIRY_TYPES = new Set(["point_correction", "point_report"]);
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_POINT_NAME_LENGTH = 100;
const MAX_CONTENT_LENGTH = 5000;
const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InquiryInput = {
  inquiry_type?: unknown;
  point_name?: unknown;
  content?: unknown;
  reply_email?: unknown;
  honeypot?: unknown;
  captcha_token?: unknown;
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
function validationError(input: InquiryInput) {
  const inquiryType = text(input.inquiry_type), pointName = text(input.point_name);
  const content = text(input.content), replyEmail = text(input.reply_email), captchaToken = text(input.captcha_token);
  if (!INQUIRY_TYPES.has(inquiryType)) return "문의 유형을 선택해 주세요.";
  if (pointName.length > MAX_POINT_NAME_LENGTH) return "포인트명은 100자 이하로 입력해 주세요.";
  if (!content) return "문의 내용을 입력해 주세요.";
  if (content.length > MAX_CONTENT_LENGTH) return "문의 내용은 5,000자 이하로 입력해 주세요.";
  if (replyEmail && (replyEmail.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(replyEmail))) return "회신 이메일 형식을 확인해 주세요.";
  if (Deno.env.get("INQUIRY_CAPTCHA_REQUIRED") === "true" && !captchaToken) return "CAPTCHA 확인이 필요합니다.";
  return null;
}

/** CAPTCHA 공급자를 추가할 때 이 함수에 서버 비밀키 검증을 연결한다. */
async function verifyCaptcha(_token: string) {
  // Future extension point: Turnstile/reCAPTCHA server-side siteverify request.
  return false;
}

function redactResendErrorValue(value: unknown) {
  if (typeof value !== "string") return "UNKNOWN_RESEND_ERROR";
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/re_[A-Za-z0-9]+/g, "[redacted]")
    .slice(0, 1000);
}

async function sendAdminEmail(input: { inquiryType: string; pointName: string | null; content: string; replyEmail: string | null }) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const adminEmail = Deno.env.get("INQUIRY_ADMIN_EMAIL");
  const from = Deno.env.get("INQUIRY_FROM_EMAIL");
  if (!apiKey || !adminEmail || !from) return { status: "not_configured" as const, error: null };
  const labels: Record<string, string> = { point_correction: "포인트 정보 수정", point_report: "포인트 제보", other: "기타" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [adminEmail], subject: `[SNORKY 문의] ${labels[input.inquiryType] || "기타"}`,
      text: [`문의 유형: ${labels[input.inquiryType] || input.inquiryType}`, `포인트명: ${input.pointName || "-"}`, `회신 이메일: ${input.replyEmail || "-"}`, "", input.content].join("\n"),
    }),
  });
  if (response.ok) return { status: "sent" as const, error: null };

  const responseBody = await response.text();
  let responseError: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(responseBody);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) responseError = parsed as Record<string, unknown>;
  } catch {
    responseError = { message: responseBody };
  }
  console.error("[submit-inquiry] Resend request failed", {
    status: response.status,
    name: redactResendErrorValue(responseError.name),
    message: redactResendErrorValue(responseError.message),
  });
  return { status: "failed" as const, error: `RESEND_HTTP_${response.status}` };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  let input: InquiryInput;
  try { input = await request.json(); } catch { return json({ ok: false, message: "요청 형식을 확인해 주세요." }, 400); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return json({ ok: false, message: "요청 형식을 확인해 주세요." }, 400);
  // Honeypot bot submissions receive a generic success response and are not persisted.
  if (text(input.honeypot)) return json({ ok: true });

  const validationMessage = validationError(input);
  if (validationMessage) return json({ ok: false, message: validationMessage }, 400);
  const captchaToken = text(input.captcha_token);
  if (Deno.env.get("INQUIRY_CAPTCHA_REQUIRED") === "true" && !(await verifyCaptcha(captchaToken))) {
    return json({ ok: false, message: "CAPTCHA 확인에 실패했습니다." }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL"), serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), ipHashSalt = Deno.env.get("INQUIRY_IP_HASH_SALT");
  if (!url || !serviceRoleKey || !ipHashSalt) {
    console.error("[submit-inquiry] missing required server configuration");
    return json({ ok: false, message: "문의 접수 설정을 확인 중입니다. 잠시 후 다시 시도해 주세요." }, 503);
  }
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const ipHash = await sha256(`${ipHashSalt}:${clientIp(request)}`);
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error: rateLimitError } = await client.from("contact_inquiries").select("id", { count: "exact", head: true }).eq("requester_ip_hash", ipHash).gte("created_at", cutoff);
  if (rateLimitError) {
    console.error("[submit-inquiry] rate limit query failed", rateLimitError.message);
    return json({ ok: false, message: "문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }, 500);
  }
  if ((count || 0) >= RATE_LIMIT_MAX) return json({ ok: false, message: "잠시 후 다시 문의해 주세요." }, 429);

  const inquiryType = text(input.inquiry_type), content = text(input.content);
  const pointName = POINT_INQUIRY_TYPES.has(inquiryType) ? text(input.point_name) || null : null;
  const replyEmail = text(input.reply_email) || null;
  const { data: inserted, error: insertError } = await client.from("contact_inquiries").insert({
    inquiry_type: inquiryType, point_name: pointName, content, reply_email: replyEmail,
    requester_ip_hash: ipHash, captcha_token: captchaToken || null,
  }).select("id").single();
  if (insertError || !inserted) {
    console.error("[submit-inquiry] insert failed", insertError?.message);
    return json({ ok: false, message: "문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }, 500);
  }
  try {
    const notification = await sendAdminEmail({ inquiryType, pointName, content, replyEmail });
    const { error: statusError } = await client.from("contact_inquiries").update({ admin_notification_status: notification.status, admin_notification_error: notification.error }).eq("id", inserted.id);
    if (statusError) console.error("[submit-inquiry] notification status update failed", statusError.message);
  } catch (mailError) {
    const mailMessage = mailError instanceof Error ? mailError.message.slice(0, 500) : "MAIL_SEND_FAILED";
    console.error("[submit-inquiry] email failed", mailMessage);
    await client.from("contact_inquiries").update({ admin_notification_status: "failed", admin_notification_error: mailMessage }).eq("id", inserted.id);
  }
  return json({ ok: true, message: "문의가 접수되었습니다." });
});
