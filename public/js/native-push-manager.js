(function (global) {
  "use strict";

  const NATIVE_TOKEN_KEY = "snorky_native_push_token_v1";
  const SESSION_TOKEN_KEY = "snorky_push_token_v1";
  const ANDROID_APP_ID = "com.yklabs.snorky";
  let plugin = null;
  let initialized = false;

  async function ensureListeners() {
    if (initialized) return;
    initialized = true;
    await plugin.addListener("registration", ({ value }) => {
      registerToken(value).catch((error) => console.warn("[SNORKY Native Push] 토큰 등록 실패:", error?.message || error));
    });
    await plugin.addListener("registrationError", (error) => {
      console.warn("[SNORKY Native Push] FCM 등록 실패:", error?.error || error);
    });
  }

  function getPlugin() {
    const capacitor = global.Capacitor;
    const platform = typeof capacitor?.getPlatform === "function"
      ? capacitor.getPlatform()
      : capacitor?.Platform?.getPlatform?.();
    if (platform !== "android") return null;
    return capacitor?.Plugins?.PushNotifications || null;
  }

  function getSessionToken() {
    try { return localStorage.getItem(SESSION_TOKEN_KEY) || null; } catch (_) { return null; }
  }

  function getNativeToken() {
    try { return localStorage.getItem(NATIVE_TOKEN_KEY) || null; } catch (_) { return null; }
  }

  function saveNativeToken(token) {
    try { localStorage.setItem(NATIVE_TOKEN_KEY, token); } catch (_) {}
  }

  function getSupabaseConfig() {
    const config = global.SNORKY_SUPABASE_CONFIG;
    if (!/^https:\/\/.+\.supabase\.co\/?$/i.test(config?.url || "") || !/^sb_publishable_/.test(config?.publishableKey || "")) {
      throw new Error("Supabase Edge Function 설정이 필요합니다.");
    }
    return config;
  }

  async function callTokenFunction(name, token, sessionToken) {
    const config = getSupabaseConfig();
    const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(name === "register-native-push-token"
        ? { token, platform: "android", app_id: ANDROID_APP_ID }
        : { token }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(result?.error || `${name.toUpperCase()}_FAILED`);
    return result;
  }

  async function registerToken(token) {
    const sessionToken = getSessionToken();
    if (!sessionToken || !token) return;
    await callTokenFunction("register-native-push-token", token, sessionToken);
    saveNativeToken(token);
  }

  async function removeRegisteredToken() {
    const token = getNativeToken();
    const sessionToken = getSessionToken();
    if (!token || !sessionToken) return;
    try {
      await callTokenFunction("delete-native-push-token", token, sessionToken);
    } finally {
      try { localStorage.removeItem(NATIVE_TOKEN_KEY); } catch (_) {}
    }
  }

  async function initialize() {
    plugin = getPlugin();
    if (!plugin) return { supported: false, permission: "unsupported" };
    const permission = await plugin.checkPermissions();
    if (permission.receive !== "granted" || !getSessionToken()) {
      return { supported: true, permission: permission.receive };
    }
    await ensureListeners();
    await plugin.register();
    return { supported: true, permission: "granted" };
  }

  async function getPermissionState() {
    plugin = plugin || getPlugin();
    if (!plugin) return { supported: false, permission: "unsupported" };
    const permission = await plugin.checkPermissions();
    return { supported: true, permission: permission.receive };
  }

  async function requestPermissionAndRegister() {
    plugin = plugin || getPlugin();
    if (!plugin) return { supported: false, permission: "unsupported" };
    await ensureListeners();
    let permission = await plugin.checkPermissions();
    if (permission.receive !== "granted") permission = await plugin.requestPermissions();
    if (permission.receive !== "granted") return { supported: true, permission: permission.receive };
    await plugin.register();
    return { supported: true, permission: "granted" };
  }

  global.SNORKYNativePush = Object.freeze({ initialize, getPermissionState, requestPermissionAndRegister, removeRegisteredToken });
})(window);
