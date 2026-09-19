import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const env = (name: string) => Deno.env.get(name) || "";
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const ALLOWED_FIELDS = new Set([
  "custom_nickname",
  "custom_avatar_url",
  "avatar_type",
  "aida_level",
  "gender",
  "age_group",
  "activity_region",
  "activity_depth",
  "bio",
]);
const AVATAR_TYPES = new Set(["default", "custom", "none"]);
const AIDA_LEVELS = new Set([
  "없음",
  "AIDA 1", "AIDA 2", "AIDA 3", "AIDA 4", "AIDA Instructor",
  "PADI 1", "PADI 2", "PADI 3", "PADI 4", "PADI Instructor",
  "Molchanovs 1", "Molchanovs 2", "Molchanovs 3", "Molchanovs 4", "Molchanovs Instructor",
  "SSI 1", "SSI 2", "SSI 3", "SSI Instructor",
]);
const GENDERS = new Set(["남성", "여성", "비공개"]);
const AGE_GROUPS = new Set(["20대", "30대", "40대", "50대", "60대", "70대"]);
const ACTIVITY_REGIONS = new Set(["서울", "경기", "인천", "강원", "충청", "전라", "경상", "제주", "전국"]);
const ACTIVITY_DEPTHS = new Set(["5m", "10m", "15m", "20m", "25m", "30m+"]);
const AVATAR_STORAGE_ORIGIN = "https://vqpkckonpsnzhuwuybav.supabase.co";
const AVATAR_STORAGE_PATH = "/storage/v1/object/public/avatars/";

class ProfileError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
  }
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array(Array.from(binary, (char) => char.charCodeAt(0)));
}

async function verifySessionToken(request: Request) {
  const bearer = request.headers.get("Authorization") || "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("INVALID_SESSION_TOKEN");
  let header: Record<string, unknown>, payload: Record<string, unknown>;
  try {
    header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
  } catch { throw new Error("INVALID_SESSION_TOKEN"); }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== "HS256" || typeof payload.user_id !== "string" || !payload.user_id || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.exp <= now || payload.iat > now + 60) throw new Error("INVALID_SESSION_TOKEN");
  const secret = env("SNORKY_SESSION_SECRET");
  if (!secret) throw new Error("SESSION_SECRET_NOT_CONFIGURED");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  let signature: Uint8Array;
  try { signature = decodeBase64Url(parts[2]); } catch { throw new Error("INVALID_SESSION_TOKEN"); }
  const valid = await crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error("INVALID_SESSION_TOKEN");
  return payload.user_id;
}

function nullableText(value: unknown, code: string) {
  if (value === null) return null;
  if (typeof value !== "string") throw new ProfileError(code);
  return value.trim() || null;
}

function normalizeAvatarUrl(value: string) {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value);
    const isKakaoCdn = url.hostname === "kakaocdn.net" || url.hostname.endsWith(".kakaocdn.net");
    if (isKakaoCdn) {
      if (url.protocol === "http:") url.protocol = "https:";
      return url.protocol === "https:" ? url.toString() : null;
    }
    if (
      url.origin !== AVATAR_STORAGE_ORIGIN
      || !url.pathname.startsWith(AVATAR_STORAGE_PATH)
      || value.includes("..")
      || /%2e/i.test(value)
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function validateProfilePayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ProfileError("INVALID_PROFILE_PAYLOAD");
  const input = body as Record<string, unknown>;
  const keys = Object.keys(input);
  if (!keys.length) throw new ProfileError("INVALID_PROFILE_PAYLOAD");
  for (const key of keys) {
    if (!ALLOWED_FIELDS.has(key)) throw new ProfileError("UNSUPPORTED_PROFILE_FIELD");
  }

  const profile: Record<string, string | null> = {};
  if ("custom_nickname" in input) {
    const nickname = nullableText(input.custom_nickname, "INVALID_NICKNAME");
    if (nickname && (nickname.length < 2 || nickname.length > 8 || !/^[가-힣A-Za-z0-9_]+$/.test(nickname))) throw new ProfileError("INVALID_NICKNAME");
    profile.custom_nickname = nickname;
  }
  if ("custom_avatar_url" in input) {
    const avatarUrl = nullableText(input.custom_avatar_url, "INVALID_CUSTOM_AVATAR_URL");
    const normalizedAvatarUrl = avatarUrl ? normalizeAvatarUrl(avatarUrl) : null;
    if (avatarUrl && !normalizedAvatarUrl) throw new ProfileError("INVALID_CUSTOM_AVATAR_URL");
    profile.custom_avatar_url = normalizedAvatarUrl;
  }
  if ("avatar_type" in input) {
    if (typeof input.avatar_type !== "string" || !AVATAR_TYPES.has(input.avatar_type)) throw new ProfileError("INVALID_AVATAR_TYPE");
    profile.avatar_type = input.avatar_type;
  }
  if ("aida_level" in input) {
    if (typeof input.aida_level !== "string" || !AIDA_LEVELS.has(input.aida_level)) throw new ProfileError("INVALID_AIDA_LEVEL");
    profile.aida_level = input.aida_level;
  }
  if ("gender" in input) {
    if (typeof input.gender !== "string" || !GENDERS.has(input.gender)) throw new ProfileError("INVALID_GENDER");
    profile.gender = input.gender;
  }
  if ("age_group" in input) {
    const ageGroup = nullableText(input.age_group, "INVALID_AGE_GROUP");
    if (ageGroup && !AGE_GROUPS.has(ageGroup)) throw new ProfileError("INVALID_AGE_GROUP");
    profile.age_group = ageGroup;
  }
  if ("activity_region" in input) {
    const region = nullableText(input.activity_region, "INVALID_ACTIVITY_REGION");
    if (region && !ACTIVITY_REGIONS.has(region)) throw new ProfileError("INVALID_ACTIVITY_REGION");
    profile.activity_region = region;
  }
  if ("activity_depth" in input) {
    const depth = nullableText(input.activity_depth, "INVALID_ACTIVITY_DEPTH");
    if (depth && !ACTIVITY_DEPTHS.has(depth)) throw new ProfileError("INVALID_ACTIVITY_DEPTH");
    profile.activity_depth = depth;
  }
  if ("bio" in input) {
    const bio = nullableText(input.bio, "INVALID_BIO");
    if (bio && bio.length > 100) throw new ProfileError("INVALID_BIO");
    profile.bio = bio;
  }
  return profile;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const userId = await verifySessionToken(request);
    let body: unknown;
    try { body = await request.json(); } catch { throw new ProfileError("INVALID_PROFILE_PAYLOAD"); }
    const profile = validateProfilePayload(body);
    const client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const result = await client.from("user_profiles").upsert({
      provider: "kakao",
      provider_user_id: userId,
      ...profile,
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider,provider_user_id" }).select("provider, provider_user_id, custom_nickname, custom_avatar_url, avatar_type, aida_level, gender, age_group, activity_region, activity_depth, bio").single();
    if (result.error) {
      if (result.error.code === "23505") throw new ProfileError("NICKNAME_ALREADY_IN_USE", 409);
      throw new Error("PROFILE_UPSERT_FAILED");
    }
    return json({ ok: true, profile: result.data });
  } catch (error) {
    const code = error instanceof ProfileError
      ? error.code
      : error instanceof Error && ["INVALID_SESSION_TOKEN", "SESSION_SECRET_NOT_CONFIGURED"].includes(error.message)
        ? error.message
        : "PROFILE_UPDATE_FAILED";
    const status = error instanceof ProfileError
      ? error.status
      : code === "INVALID_SESSION_TOKEN" ? 401 : 500;
    console.error("[update-user-profile] failed", { code });
    return json({ ok: false, error: code }, status);
  }
});
