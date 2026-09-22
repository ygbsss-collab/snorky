(function (global) {
  "use strict";

  const NATIVE_TOKEN_KEY = "snorky_native_push_token_v1";
  const SESSION_TOKEN_KEY = "snorky_push_token_v1";
  const ANDROID_APP_ID = "com.yklabs.snorky";
  const CHANNEL_ID = "snorky_default";
  const CHANNEL_NAME = "SNORKY 알림";
  let plugin = null;
  let localPlugin = null;
  let initialized = false;
  let channelReady = false;

  function getLocalPlugin() {
    const capacitor = global.Capacitor;
    return capacitor?.Plugins?.LocalNotifications || null;
  }

  async function ensureNotificationChannel() {
    localPlugin = localPlugin || getLocalPlugin();
    if (!localPlugin || channelReady) return Boolean(localPlugin);
    await localPlugin.createChannel({
      id: CHANNEL_ID,
      name: CHANNEL_NAME,
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
    });
    channelReady = true;
    return true;
  }

  function getNotificationData(notification) {
    const data = notification?.data;
    return data && typeof data === "object" ? { ...data } : {};
  }

  function navigateToNotificationUrl(url) {
    if (!url) return;
    try {
      const target = new URL(String(url), global.location.href);
      if (target.origin === global.location.origin) global.location.assign(target.href);
    } catch (_) {}
  }

  async function ensureLocalPlugin(retryDelayMs = 300) {
    localPlugin = localPlugin || getLocalPlugin();
    if (localPlugin) return localPlugin;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    localPlugin = getLocalPlugin();
    if (!localPlugin) {
      console.warn("[SNORKY Native Push] LocalNotifications 플러그인을 찾을 수 없어 Foreground 알림을 표시하지 못했습니다.");
    }
    return localPlugin;
  }

  async function showForegroundNotification(notification) {
    const localNotifPlugin = await ensureLocalPlugin();
    if (!localNotifPlugin) return;
    const title = String(notification?.title || "SNORKY");
    const body = String(notification?.body || "");
    const data = getNotificationData(notification);
    try {
      await localNotifPlugin.schedule({
        notifications: [{
          id: Date.now() % 2147483647,
          title,
          body,
          extra: data,
          channelId: CHANNEL_ID,
        }],
      });
      console.info("[SNORKY Native Push] Foreground 알림 표시 성공.");
    } catch (error) {
      console.warn("[SNORKY Native Push] LocalNotifications.schedule 실패:", error?.message || error);
      throw error;
    }
  }

  async function ensureListeners() {
    if (initialized) return;
    initialized = true;
    localPlugin = localPlugin || getLocalPlugin();
    await plugin.addListener("registration", ({ value }) => {
      console.info("[SNORKY Native Push] FCM registration token received.");
      registerToken(value).catch(() => {});
    });
    await plugin.addListener("registrationError", (error) => {
      console.warn("[SNORKY Native Push] FCM 등록 실패:", error?.error || error);
    });
    await plugin.addListener("pushNotificationReceived", (notification) => {
      showForegroundNotification(notification).catch((error) => console.warn("[SNORKY Native Push] Foreground 알림 표시 실패:", error?.message || error));
    });
    await plugin.addListener("pushNotificationActionPerformed", (event) => {
      navigateToNotificationUrl(getNotificationData(event?.notification).url);
    });
    await localPlugin?.addListener("localNotificationActionPerformed", (event) => {
      navigateToNotificationUrl(event?.notification?.extra?.url);
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

  function isSupabaseConfigReady(config) {
    return /^https:\/\/.+\.supabase\.co\/?$/i.test(config?.url || "")
      && /^sb_publishable_/.test(config?.publishableKey || "");
  }

  async function waitForSupabaseConfig(timeoutMs = 3000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (isSupabaseConfigReady(global.SNORKY_SUPABASE_CONFIG)) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return isSupabaseConfigReady(global.SNORKY_SUPABASE_CONFIG);
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
    if (!token) {
      console.error("[SNORKY Native Push] register-native-push-token failed: empty FCM token.");
      return { registered: false, reason: "EMPTY_FCM_TOKEN" };
    }
    if (!sessionToken) {
      console.info("[SNORKY Native Push] register-native-push-token skipped: no logged-in session.");
      return { registered: false, reason: "NO_SESSION" };
    }
    const configReadyAtFirstAttempt = isSupabaseConfigReady(global.SNORKY_SUPABASE_CONFIG);
    let retriedAfterConfigWait = false;
    try {
      try {
        await callTokenFunction("register-native-push-token", token, sessionToken);
      } catch (error) {
        if (configReadyAtFirstAttempt) throw error;
        console.warn("[SNORKY Native Push] Supabase config is not ready; waiting before one retry.");
        if (!await waitForSupabaseConfig()) throw error;
        retriedAfterConfigWait = true;
        await callTokenFunction("register-native-push-token", token, sessionToken);
      }
      saveNativeToken(token);
      console.info("[SNORKY Native Push] register-native-push-token succeeded.", { retriedAfterConfigWait });
      return { registered: true, retriedAfterConfigWait };
    } catch (error) {
      console.error("[SNORKY Native Push] register-native-push-token failed:", error?.message || error);
      throw error;
    }
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
    await ensureNotificationChannel();
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
    await ensureNotificationChannel();
    await ensureListeners();
    let permission = await plugin.checkPermissions();
    if (permission.receive !== "granted") permission = await plugin.requestPermissions();
    if (permission.receive !== "granted") return { supported: true, permission: permission.receive };
    await plugin.register();
    return { supported: true, permission: "granted" };
  }

  global.SNORKYNativePush = Object.freeze({ initialize, getPermissionState, requestPermissionAndRegister, removeRegisteredToken });
})(window);
