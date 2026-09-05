import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const INQUIRY_TYPES = new Set(["point_correction", "point_report", "other"]);
const POINT_INQUIRY_TYPES = new Set(["point_correction", "point_report"]);
const CERTIFICATION_INQUIRY_TYPE = "certification_request";
const USER_REPORT_INQUIRY_TYPE = "user_report";
const CERTIFICATION_AGENCIES = new Set(["AIDA", "PADI", "Molchanovs", "SSI", "기타"]);
const TEST_MODE_ALLOW_DUPLICATE_USERS = true;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_POINT_NAME_LENGTH = 100;
const MAX_CONTENT_LENGTH = 5000;
const MAX_EMAIL_LENGTH = 254;
const MAX_CERTIFICATION_FIELD_LENGTH = 100;
const MAX_CERTIFICATION_PHOTO_BYTES = 5 * 1024 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InquiryInput = {
  inquiry_type?: unknown;
  point_name?: unknown;
  content?: unknown;
  reply_email?: unknown;
  honeypot?: unknown;
  captcha_token?: unknown;
  user_id?: unknown;
  nickname?: unknown;
  agency?: unknown;
  custom_agency?: unknown;
  level?: unknown;
  certification_number?: unknown;
  target_user_id?: unknown;
  target_nickname?: unknown;
  reporter_user_id?: unknown;
  reporter_nickname?: unknown;
  reason?: unknown;
  details?: unknown;
  buddy_post_id?: unknown;
  photo?: {
    name?: unknown;
    mime_type?: unknown;
    content_base64?: unknown;
  };
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

function certificationValidationError(input: InquiryInput) {
  const userId = text(input.user_id), agency = text(input.agency), customAgency = text(input.custom_agency);
  const level = text(input.level), certificationNumber = text(input.certification_number);
  const mimeType = text(input.photo?.mime_type), base64 = text(input.photo?.content_base64);
  if (!userId || userId.length > 128) return "로그인 정보를 확인해 주세요.";
  if (!CERTIFICATION_AGENCIES.has(agency)) return "인증기관을 선택해 주세요.";
  if (agency === "기타" && !customAgency) return "협회명을 입력해 주세요.";
  if (customAgency.length > MAX_CERTIFICATION_FIELD_LENGTH) return "협회명은 100자 이하로 입력해 주세요.";
  if (!level) return agency === "기타" ? "자격명/레벨을 입력해 주세요." : "자격레벨을 입력해 주세요.";
  if (level.length > MAX_CERTIFICATION_FIELD_LENGTH) return "자격레벨은 100자 이하로 입력해 주세요.";
  if (!certificationNumber) return "자격번호를 입력해 주세요.";
  if (certificationNumber.length > MAX_CERTIFICATION_FIELD_LENGTH) return "자격번호는 100자 이하로 입력해 주세요.";
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(mimeType)) return "JPG, PNG, WebP 형식의 사진만 첨부할 수 있습니다.";
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return "자격증 사진을 확인해 주세요.";
  const padding = base64.endsWith("==") ? 2 : (base64.endsWith("=") ? 1 : 0);
  const photoBytes = Math.floor(base64.length * 3 / 4) - padding;
  if (photoBytes <= 0 || photoBytes > MAX_CERTIFICATION_PHOTO_BYTES) return "자격증 사진은 최대 5MB까지 첨부할 수 있습니다.";
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

async function sendCertificationEmail(input: {
  userId: string;
  nickname: string;
  agency: string;
  level: string;
  certificationNumber: string;
  photoMimeType: string;
  photoBase64: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const adminEmail = Deno.env.get("INQUIRY_ADMIN_EMAIL");
  const from = Deno.env.get("INQUIRY_FROM_EMAIL");
  if (!apiKey || !adminEmail || !from) return { status: "not_configured" as const, error: "MAIL_NOT_CONFIGURED" };
  const extension = input.photoMimeType === "image/png" ? "png" : (input.photoMimeType === "image/webp" ? "webp" : "jpg");
  const safeAgency = input.agency.replace(/[\r\n]+/g, " ");
  const safeLevel = input.level.replace(/[\r\n]+/g, " ");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [adminEmail],
      subject: `[SNORKY 자격 인증] ${safeAgency} ${safeLevel}`,
      text: [
        `사용자 ID: ${input.userId}`,
        `닉네임: ${input.nickname || "-"}`,
        `인증기관: ${input.agency}`,
        `자격레벨: ${input.level}`,
        `자격번호: ${input.certificationNumber}`,
        "",
        "첨부된 자격증 사진을 확인해 주세요. 사진은 DB 또는 Storage에 저장되지 않습니다.",
      ].join("\n"),
      attachments: [{
        filename: `certification-${input.userId}.${extension}`,
        content: input.photoBase64,
      }],
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
  console.error("[submit-inquiry] certification email failed", {
    status: response.status,
    name: redactResendErrorValue(responseError.name),
    message: redactResendErrorValue(responseError.message),
  });
  return { status: "failed" as const, error: `RESEND_HTTP_${response.status}` };
}

async function submitCertificationRequest(client: ReturnType<typeof createClient>, input: InquiryInput) {
  const validationMessage = certificationValidationError(input);
  if (validationMessage) return json({ ok: false, message: validationMessage }, 400);

  const userId = text(input.user_id), nickname = text(input.nickname).slice(0, 100);
  const selectedAgency = text(input.agency), customAgency = text(input.custom_agency);
  const agency = selectedAgency === "기타" ? customAgency : selectedAgency;
  const level = text(input.level), certificationNumber = text(input.certification_number);
  const photoMimeType = text(input.photo?.mime_type), photoBase64 = text(input.photo?.content_base64);

  if (!TEST_MODE_ALLOW_DUPLICATE_USERS) {
    const pending = await client
      .from("certification_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "PENDING");
    if (pending.error) {
      console.error("[submit-inquiry] certification pending query failed", pending.error.message);
      return json({ ok: false, message: "인증 요청 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 500);
    }
    if ((pending.count || 0) > 0) return json({ ok: false, message: "이미 검토 중인 인증 요청이 있습니다." }, 409);
  }

  const notification = await sendCertificationEmail({
    userId, nickname, agency, level, certificationNumber, photoMimeType, photoBase64,
  });
  if (notification.status !== "sent") {
    return json({ ok: false, message: "인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요." }, 502);
  }

  const requestedAt = new Date().toISOString();
  const { error: insertError } = await client.from("certification_requests").insert({
    user_id: userId,
    nickname: nickname || null,
    agency,
    level,
    certification_number: certificationNumber,
    status: "PENDING",
    requested_at: requestedAt,
  });
  if (insertError) {
    console.error("[submit-inquiry] certification insert failed", insertError.message);
    return json({ ok: false, message: "인증 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 500);
  }
  return json({ ok: true, message: "인증 요청이 접수되었습니다." });
}

async function sendUserReportEmail(input: {
  targetUserId: string;
  targetNickname: string | null;
  reporterUserId: string | null;
  reporterNickname: string | null;
  reason: string;
  details: string | null;
  buddyPostId: number | null;
  reportedAt: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const adminEmail = Deno.env.get("INQUIRY_ADMIN_EMAIL");
  const from = Deno.env.get("INQUIRY_FROM_EMAIL");
  if (!apiKey || !adminEmail || !from) {
    console.error("[submit-inquiry] user report email configuration missing", {
      hasApiKey: Boolean(apiKey),
      hasAdminEmail: Boolean(adminEmail),
      hasFrom: Boolean(from),
    });
    return { status: "not_configured" as const, error: "MAIL_NOT_CONFIGURED" };
  }

  const safeTargetNickname = (input.targetNickname || "미확인").replace(/[\r\n]+/g, " ");
  const subject = `[SNORKY 사용자 신고] 대상: ${safeTargetNickname} (사유: ${input.reason})`;
  const textContent = [
    "[사용자 신고 접수]",
    `- 신고 접수 시각: ${input.reportedAt}`,
    `- 신고 사유: ${input.reason}`,
    `- 신고자 ID: ${input.reporterUserId || "미확인"}`,
    `- 신고자 닉네임: ${input.reporterNickname || "미확인"}`,
    `- 신고 대상 ID: ${input.targetUserId}`,
    `- 신고 대상 닉네임: ${input.targetNickname || "미확인"}`,
    `- 관련 버디 공고 ID: ${input.buddyPostId ?? "없음"}`,
    "",
    "[상세 내용]",
    input.details || "(상세 내용 없음)",
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [adminEmail],
      subject,
      text: textContent,
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
  console.error("[submit-inquiry] user report email failed", {
    status: response.status,
    name: redactResendErrorValue(responseError.name),
    message: redactResendErrorValue(responseError.message),
  });
  return { status: "failed" as const, error: `RESEND_HTTP_${response.status}` };
}

async function submitUserReport(client: ReturnType<typeof createClient>, input: InquiryInput) {
  const targetUserId = text(input.target_user_id);
  const targetNickname = text(input.target_nickname);
  const reporterUserId = text(input.reporter_user_id);
  const reporterNickname = text(input.reporter_nickname);
  const reason = text(input.reason);
  const details = text(input.details);
  const rawPostId = input.buddy_post_id;
  const buddyPostId = rawPostId === null || rawPostId === undefined || rawPostId === ""
    ? null
    : Number(rawPostId);
  if (!targetUserId || targetUserId.length > 128) return json({ ok: false, message: "신고 대상 정보가 올바르지 않습니다." }, 400);
  if (!TEST_MODE_ALLOW_DUPLICATE_USERS && reporterUserId && reporterUserId === targetUserId) {
    return json({ ok: false, message: "자기 자신은 신고할 수 없습니다." }, 400);
  }
  if (!reason || reason.length > 100) return json({ ok: false, message: "신고 사유를 확인해 주세요." }, 400);
  if (targetNickname.length > 100 || reporterUserId.length > 128 || reporterNickname.length > 100 || details.length > MAX_CONTENT_LENGTH) {
    return json({ ok: false, message: "신고 내용을 확인해 주세요." }, 400);
  }
  if (buddyPostId !== null && (!Number.isSafeInteger(buddyPostId) || buddyPostId <= 0)) {
    return json({ ok: false, message: "관련 공고 정보를 확인해 주세요." }, 400);
  }

  const reportedAt = new Date().toISOString();
  const notification = await sendUserReportEmail({
    targetUserId,
    targetNickname: targetNickname || null,
    reporterUserId: reporterUserId || null,
    reporterNickname: reporterNickname || null,
    reason,
    details: details || null,
    buddyPostId,
    reportedAt,
  });

  if (notification.status !== "sent") {
    console.error("[submit-inquiry] user report rejected: email sending failed", notification.error);
    return json({ ok: false, message: "신고 접수 메일을 발송하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 502);
  }

  const { error: insertError } = await client.from("user_reports").insert({
    target_user_id: targetUserId,
    target_nickname: targetNickname || null,
    reporter_user_id: reporterUserId || null,
    reporter_nickname: reporterNickname || null,
    reason,
    details: details || null,
    buddy_post_id: buddyPostId,
    status: "PENDING",
    reported_at: reportedAt,
  });
  if (insertError) {
    console.error("[submit-inquiry] user report insert failed", insertError.message);
    return json({ ok: false, message: "신고 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }, 500);
  }
  return json({ ok: true, message: "신고가 접수되었습니다." });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  let input: InquiryInput;
  try { input = await request.json(); } catch { return json({ ok: false, message: "요청 형식을 확인해 주세요." }, 400); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return json({ ok: false, message: "요청 형식을 확인해 주세요." }, 400);
  // Honeypot bot submissions receive a generic success response and are not persisted.
  if (text(input.honeypot)) return json({ ok: true });

  if (text(input.inquiry_type) === CERTIFICATION_INQUIRY_TYPE) {
    const url = Deno.env.get("SUPABASE_URL"), serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceRoleKey) {
      console.error("[submit-inquiry] missing certification request configuration");
      return json({ ok: false, message: "인증 요청 설정을 확인 중입니다. 잠시 후 다시 시도해 주세요." }, 503);
    }
    const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    return await submitCertificationRequest(client, input);
  }

  if (text(input.inquiry_type) === USER_REPORT_INQUIRY_TYPE) {
    const url = Deno.env.get("SUPABASE_URL"), serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceRoleKey) {
      console.error("[submit-inquiry] missing user report configuration");
      return json({ ok: false, message: "신고 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }, 503);
    }
    const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    return await submitUserReport(client, input);
  }

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
