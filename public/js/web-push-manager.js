(function (window) {
  "use strict";

  window.SNORKY_VAPID_PUBLIC_KEY = "BFMHoN18pyhY8yFyHSTWEYkvmI5wdh5YJfQy83gTgx89GNkfQcbd7no7D7brsjcgErnHIT68kUzZBbmRxlqZkgY";
  const VAPID_PUBLIC_KEY = window.SNORKY_VAPID_PUBLIC_KEY || "";
  const SYNC_MIN_INTERVAL_MS = 3000;
  // [PUSH-DIAG] 진단 로그: 권한, 토큰 존재 여부(boolean), 구독 존재 여부, 결과만 기록한다. 토큰/endpoint/키 값은 기록하지 않는다.
  function diag(message, detail) {
    try { console.info("[PUSH-DIAG]", message, detail === undefined ? "" : detail); } catch (_) {}
  }
  function diagError(error) {
    return String(error?.name || "Error") + ":" + String(error?.message || error || "").slice(0, 80);
  }
  function readPermission() {
    return window.Notification ? Notification.permission : "unsupported";
  }

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

  // register-push-subscription이 { ok: true }로 응답한 경우에만 성공으로 본다.
  async function saveSubscription(subscription) {
    const json = subscription.toJSON();
    const keys = json.keys || {};
    try {
      const result = await callSubscriptionFunction("register-push-subscription", { endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: navigator.userAgent });
      if (result?.ok !== true) throw new Error("PUSH_SUBSCRIPTION_FAILED");
      diag("register-push-subscription success");
    } catch (error) {
      diag("register-push-subscription failed", diagError(error));
      throw error;
    }
    return subscription;
  }

  async function removeSubscription(subscription) {
    const endpoint = subscription?.endpoint;
    if (endpoint) await callSubscriptionFunction("delete-push-subscription", { endpoint });
  }

  // 기존 구독이 있으면 재사용하고 없으면 새로 만든다. 권한이 granted일 때만 호출한다.
  async function ensureSubscription() {
    if (!("PushManager" in window) || !("Notification" in window)) throw new Error("이 브라우저는 웹 푸시를 지원하지 않습니다.");
    if (!VAPID_PUBLIC_KEY) throw new Error("VAPID public key가 설정되지 않았습니다.");
    const registration = await getRegistration();
    let subscription = await registration.pushManager.getSubscription();
    diag("existing PushSubscription", Boolean(subscription));
    if (!subscription) {
      try {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
        diag("subscribe success");
      } catch (error) {
        diag("subscribe failed", diagError(error));
        throw error;
      }
    }
    return subscription;
  }

  async function subscribe() {
    if (!getSessionToken()) throw new Error("푸시 알림은 로그인 후 사용할 수 있습니다.");
    const subscription = await ensureSubscription();
    await saveSubscription(subscription);
    return subscription;
  }

  // 동기화 결과 state: unsupported | login-required | default | denied | connected | sync-failed
  let syncInFlight = null;
  let lastSyncResult = null;
  let lastSyncFinishedAt = 0;

  async function requestPermissionAndSubscribe() {
    diag("request start", { permission: readPermission(), hasToken: Boolean(getSessionToken()) });
    if (!getSessionToken()) {
      const error = new Error("푸시 알림은 로그인 후 사용할 수 있습니다.");
      throw error;
    }
    if (!("Notification" in window)) {
      const error = new Error("이 브라우저는 알림을 지원하지 않습니다.");
      throw error;
    }
    let permission = Notification.permission;
    if (permission === "default") {
      try {
        permission = await Notification.requestPermission();
      } catch (error) {
        diag("requestPermission failed", diagError(error));
        throw error;
      }
      diag("requestPermission result", { permission: readPermission() });
    }
    if (permission !== "granted") {
      const error = new Error("알림 권한이 허용되지 않았습니다.");
      throw error;
    }
    return subscribe().then((subscription) => {
      lastSyncResult = { state: "connected", permission: "granted" };
      lastSyncFinishedAt = Date.now();
      return subscription;
    });
  }

  async function runSync(reason) {
    const permission = readPermission();
    const hasToken = Boolean(getSessionToken());
    diag("sync start", { reason, permission, hasToken });
    let result;
    if (permission === "unsupported" || !("PushManager" in window) || !("serviceWorker" in navigator)) {
      result = { state: "unsupported", permission };
    } else if (!hasToken) {
      result = { state: "login-required", permission };
    } else if (permission === "default" || permission === "denied") {
      result = { state: permission, permission };
    } else {
      try {
        const subscription = await ensureSubscription();
        await saveSubscription(subscription);
        result = { state: "connected", permission };
      } catch (error) {
        result = { state: "sync-failed", permission, error: diagError(error) };
      }
    }
    lastSyncResult = result;
    lastSyncFinishedAt = Date.now();
    diag("sync result", { reason, state: result.state, permission });
    return result;
  }

  // 진행 중인 동기화가 있으면 그 결과를 공유하고, force가 아니면 직전 동기화 직후의 중복 호출은 건너뛴다.
  function syncGrantedSubscription(reason, options) {
    const why = reason || "manual";
    if (syncInFlight) {
      diag("sync joined in-flight", { reason: why });
      return syncInFlight;
    }
    if (!(options && options.force) && lastSyncResult && Date.now() - lastSyncFinishedAt < SYNC_MIN_INTERVAL_MS) {
      diag("sync skipped (debounced)", { reason: why });
      return Promise.resolve(lastSyncResult);
    }
    syncInFlight = runSync(why).finally(() => { syncInFlight = null; });
    return syncInFlight;
  }

  // 앱 시작/복귀 시: 권한이 granted일 때만 동기화한다.
  function syncIfGranted(reason) {
    if (readPermission() !== "granted") {
      diag("resume sync skipped", { reason, permission: readPermission() });
      return null;
    }
    return syncGrantedSubscription(reason);
  }

  window.SNORKYWebPush = Object.freeze({ isSupported: () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window, requestPermissionAndSubscribe, subscribe, removeSubscription, syncGrantedSubscription });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncIfGranted("visibilitychange"); });
  window.addEventListener("focus", () => { syncIfGranted("focus"); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { syncIfGranted("load"); }, { once: true });
  else syncIfGranted("load");
})(window);
