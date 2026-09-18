import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-push-internal-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...cors, "content-type": "application/json" },
});

const env = (name: string) => (globalThis as any).Deno?.env?.get?.(name) || "";

function authorized(request: Request): boolean {
  const expected = env("PUSH_INTERNAL_TOKEN");
  return Boolean(expected && request.headers.get("x-push-internal-token") === expected);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!authorized(request)) return json({ ok: false, error: "UNAUTHORIZED" }, 401);

  try {
    const body = await request.json();
    const notificationId = Number(body?.notification_id);
    const userId = String(body?.user_id || "").trim();
    if (!Number.isSafeInteger(notificationId) || !userId) return json({ ok: false, error: "INVALID_INPUT" }, 400);

    const client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const [{ data: notification, error: notificationError }, { data: subscriptions, error: subscriptionError }] = await Promise.all([
      client.from("user_notifications").select("id, user_id, title, content, link_url").eq("id", notificationId).eq("user_id", userId).maybeSingle(),
      client.from("user_push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId),
    ]);
    if (notificationError) throw notificationError;
    if (subscriptionError) throw subscriptionError;
    if (!notification || !subscriptions?.length) return json({ ok: true, sent: 0, removed: 0 });

    const vapidPublicKey = env("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = env("VAPID_PRIVATE_KEY");
    const vapidSubject = env("VAPID_SUBJECT");
    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) throw new Error("VAPID secrets are not configured");
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    let sent = 0;
    let removed = 0;
    await Promise.all((subscriptions || []).map(async (subscription) => {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({
          title: notification.title,
          body: notification.content,
          url: notification.link_url || "./mypage.html",
        }));
        sent += 1;
      } catch (error: any) {
        const statusCode = Number(error?.statusCode || error?.status || 0);
        if (statusCode === 404 || statusCode === 410) {
          const result = await client.from("user_push_subscriptions").delete().eq("id", subscription.id).eq("user_id", userId);
          if (!result.error) removed += 1;
        } else {
          console.error("[send-push-notification] delivery failed:", { subscriptionId: subscription.id, statusCode, error });
        }
      }
    }));
    return json({ ok: true, sent, removed });
  } catch (error) {
    console.error("[send-push-notification] failed:", error);
    return json({ ok: false, error: "PUSH_SEND_FAILED" }, 500);
  }
});
