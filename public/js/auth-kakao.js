(function (global) {
  "use strict";

  const KAKAO_JAVASCRIPT_KEY = "c29f1a71a53af406429520da0df21772";
  const STATE_STORAGE_KEY = "snorky_kakao_oauth_state";
  const button = document.getElementById("kakaoLoginButton");
  const errorMessage = document.getElementById("loginError");

  function showError(message) {
    if (!errorMessage) return;
    errorMessage.textContent = message;
    errorMessage.hidden = false;
  }

  function clearError() {
    if (!errorMessage) return;
    errorMessage.textContent = "";
    errorMessage.hidden = true;
  }

  function setBusy(isBusy) {
    if (!button) return;
    button.disabled = isBusy;
    button.textContent = isBusy ? "로그인 확인 중..." : "카카오로 시작하기";
  }

  function getRedirectUri() {
    const redirectUri = new URL(global.location.href);
    redirectUri.search = "";
    redirectUri.hash = "";
    return redirectUri.toString();
  }

  function createState() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    const bytes = new Uint8Array(24);
    global.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  function initializeKakao() {
    if (!global.Kakao) throw new Error("Kakao SDK를 불러오지 못했습니다.");
    if (!global.Kakao.isInitialized()) global.Kakao.init(KAKAO_JAVASCRIPT_KEY);
  }

  function cleanCallbackUrl() {
    if (!global.history || typeof global.history.replaceState !== "function") return;
    global.history.replaceState({}, document.title, getRedirectUri());
  }

  function getSupabaseConfig() {
    const config = global.SNORKY_SUPABASE_CONFIG;
    const validUrl = /^https:\/\/.+\.supabase\.co\/?$/i.test(config?.url || "");
    const validKey = /^sb_publishable_/.test(config?.publishableKey || "");
    if (!validUrl || !validKey) throw new Error("Supabase Edge Function 설정이 필요합니다.");
    return config;
  }

  async function exchangeCode(code, redirectUri) {
    const config = getSupabaseConfig();
    const endpoint = `${config.url.replace(/\/$/, "")}/functions/v1/kakao-auth`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${config.publishableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code, redirectUri }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.user) {
      throw new Error(payload.message || "카카오 로그인을 완료하지 못했습니다.");
    }
    return {
      user: payload.user,
      kakaoAccessToken: payload.kakaoAccessToken || null,
    };
  }

  async function handleCallback() {
    const params = new URLSearchParams(global.location.search);
    const oauthError = params.get("error");
    if (oauthError) {
      sessionStorage.removeItem(STATE_STORAGE_KEY);
      cleanCallbackUrl();
      showError("카카오 로그인이 취소되었거나 실패했습니다.");
      return true;
    }

    const code = params.get("code");
    if (!code) return false;

    const returnedState = params.get("state");
    const expectedState = sessionStorage.getItem(STATE_STORAGE_KEY);
    sessionStorage.removeItem(STATE_STORAGE_KEY);
    if (!expectedState || !returnedState || returnedState !== expectedState) {
      cleanCallbackUrl();
      showError("로그인 요청을 확인하지 못했습니다. 다시 시도해 주세요.");
      return true;
    }

    setBusy(true);
    clearError();
    try {
      const authResult = await exchangeCode(code, getRedirectUri());
      const session = global.SNORKYAuthSession.create("kakao", authResult.user);
      global.SNORKYAuthSession.save(session);
      cleanCallbackUrl();
      global.location.replace(new URL("./index.html?fromLogin=1", global.location.href));
    } catch (_) {
      cleanCallbackUrl();
      showError("카카오 로그인을 완료하지 못했습니다. 다시 시도해 주세요.");
      setBusy(false);
    }
    return true;
  }

  function startLogin() {
    clearError();
    try {
      initializeKakao();
      const state = createState();
      sessionStorage.setItem(STATE_STORAGE_KEY, state);
      global.Kakao.Auth.authorize({ redirectUri: getRedirectUri(), state });
    } catch (_) {
      showError("카카오 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  global.SNORKYAuthKakao = {
    init: initializeKakao,
    isInitialized: function () {
      return Boolean(global.Kakao && global.Kakao.isInitialized && global.Kakao.isInitialized());
    },
    requestReauth: function (customRedirectUri) {
      initializeKakao();
      if (!global.Kakao || !global.Kakao.Auth || typeof global.Kakao.Auth.authorize !== "function") {
        throw new Error("카카오 인증 모듈을 불러오지 못했습니다.");
      }
      const state = "delete_" + createState();
      sessionStorage.setItem(STATE_STORAGE_KEY + "_reauth", state);
      const targetUri = customRedirectUri || getRedirectUri();
      global.Kakao.Auth.authorize({ redirectUri: targetUri, state });
    },
  };

  try {
    initializeKakao();
  } catch (_) {}

  if (!button || !global.SNORKYAuthSession) return;
  button.addEventListener("click", startLogin);
  handleCallback().then((handled) => {
    if (handled) return;
    try {
      initializeKakao();
    } catch (_) {
      showError("카카오 로그인 서비스를 불러오지 못했습니다.");
    }
  });
})(window);
