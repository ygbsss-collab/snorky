import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const env = (name: string) => Deno.env.get(name) || "";
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

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
  const valid = await crypto.subtle.verify("HMAC", key, decodeBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error("INVALID_SESSION_TOKEN");
  return payload.user_id;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const userId = await verifySessionToken(request);
    const endpoint = String((await request.json())?.endpoint || "").trim();
    if (!endpoint || endpoint.length > 2048) return json({ ok: false, error: "INVALID_SUBSCRIPTION" }, 400);
    const client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const result = await client.from("user_push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", userId);
    if (result.error) throw result.error;
    return json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PUSH_SUBSCRIPTION_DELETE_FAILED";
    console.error("[delete-push-subscription] failed", error);
    return json({ ok: false, error: code }, code === "INVALID_SESSION_TOKEN" ? 401 : 500);
  }
});
