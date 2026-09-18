(function (window) {
  "use strict";

  window.SNORKY_VAPID_PUBLIC_KEY = "BFMHoN18pyhY8yFyHSTWEYkvmI5wdh5YJfQy83gTgx89GNkfQcbd7no7D7brsjcgErnHIT68kUzZBbmRxlqZkgY";
  const VAPID_PUBLIC_KEY = window.SNORKY_VAPID_PUBLIC_KEY || "";

  function getSessionToken() { try { return localStorage.getItem("snorky_push_token_v1") || null; } catch (_) { return null; } }

  function urlBase64ToUint8Array(value) {
    const padding = "=".repeat((4 - (value.length % 4)) % 4);
    const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (char) => char.charCodeAt(0));
  }

  function getSupabaseConfig() {
    const config = window.SNORKY_SUPABASE_CONFIG;
    if (!/^https:\/\/.+\.supabase\.co\/?$/i.test(config?.url || "") || !/^sb_publishable_/.test(config?.publishableKey || "")) throw new Error("Supabase Edge Function 설정이 필요합니다.");
    return config;
  }

  async function callSubscriptionFunction(name, body) {
    const token = getSessionToken();
    if (!token) throw new Error("SNORKY session token is required.");
    const config = getSupabaseConfig();
    const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/${name}`, {
      method: "POST",
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(result?.error || "PUSH_SUBSCRIPTION_FAILED");
    return result;
  }

  async function getRegistration() {
    if (!("serviceWorker" in navigator)) throw new Error("서비스워커를 지원하지 않는 브라우저입니다.");
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    return navigator.serviceWorker.ready;
  }

  async function saveSubscription(subscription) {
    const json = subscription.toJSON();
    const keys = json.keys || {};
    await callSubscriptionFunction("register-push-subscription", { endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: navigator.userAgent });
    return subscription;
  }

  async function removeSubscription(subscription) {
    const endpoint = subscription?.endpoint;
    if (endpoint) await callSubscriptionFunction("delete-push-subscription", { endpoint });
  }

  async function subscribe() {
    if (!getSessionToken()) throw new Error("푸시 알림은 로그인 후 사용할 수 있습니다.");
    if (!("PushManager" in window) || !("Notification" in window)) throw new Error("이 브라우저는 웹 푸시를 지원하지 않습니다.");
    if (!VAPID_PUBLIC_KEY) throw new Error("VAPID public key가 설정되지 않았습니다.");
    const registration = await getRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    await saveSubscription(subscription);
    return subscription;
  }

  async function requestPermissionAndSubscribe() {
    if (!getSessionToken()) throw new Error("푸시 알림은 로그인 후 사용할 수 있습니다.");
    if (!("Notification" in window)) throw new Error("이 브라우저는 알림을 지원하지 않습니다.");
    let permission = Notification.permission;
    if (permission === "default") permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("알림 권한이 허용되지 않았습니다.");
    return subscribe();
  }

  async function syncGrantedSubscription() {
    if (!getSessionToken() || !window.Notification || Notification.permission !== "granted") return null;
    try {
      const registration = await getRegistration();
      const subscription = await registration.pushManager.getSubscription();
      return subscription ? saveSubscription(subscription) : null;
    } catch (error) {
      console.warn("[SNORKY Web Push] 기존 구독 동기화 실패:", error);
      return null;
    }
  }

  window.SNORKYWebPush = Object.freeze({ isSupported: () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window, requestPermissionAndSubscribe, subscribe, removeSubscription, syncGrantedSubscription });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncGrantedSubscription, { once: true });
  else syncGrantedSubscription();
})(window);
