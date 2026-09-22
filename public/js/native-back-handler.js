(function (global) {
  "use strict";

  // Android(Capacitor)에서만 동작한다. 일반 웹에서는 아무것도 등록하지 않아
  // 브라우저 기본 뒤로가기 동작이 그대로 유지된다.
  function isNativeAndroid() {
    const capacitor = global.Capacitor;
    const platform = typeof capacitor?.getPlatform === "function"
      ? capacitor.getPlatform()
      : capacitor?.Platform?.getPlatform?.();
    return platform === "android";
  }

  const handlers = [];
  let listenerRegistered = false;
  let appPlugin = null;

  // 페이지별로 "지금 열려있는 모달/오버레이가 있으면 닫고 true 반환" 형태의 함수를 등록한다.
  // 가장 나중에 등록된(=대개 가장 안쪽/위쪽) 핸들러부터 시도한다.
  function registerHandler(fn) {
    if (typeof fn === "function") handlers.push(fn);
  }

  function runHandlers() {
    for (let i = handlers.length - 1; i >= 0; i--) {
      try {
        if (handlers[i]() === true) return true;
      } catch (error) {
        console.warn("[SNORKY Back] 모달 닫기 핸들러 실행 실패:", error?.message || error);
      }
    }
    return false;
  }

  function isHomePage() {
    const path = global.location.pathname || "";
    return /(^|\/)index\.html$/i.test(path) || /\/$/.test(path);
  }

  // history.back()으로 실제 이전 화면이 있는지 확인한다. popstate가 도착하면 정상 이동된 것이고,
  // 짧은 시간 안에 오지 않으면(더 갈 곳이 없으면) 홈으로 이동한다.
  // 기존 popstate 리스너들은 그대로 두고, 여기서는 한 번 더 듣기만 한다.
  function goBackOrHome() {
    let handled = false;
    const onPopState = () => {
      handled = true;
      global.removeEventListener("popstate", onPopState);
    };
    global.addEventListener("popstate", onPopState);
    try {
      global.history.back();
    } catch (_) {}
    setTimeout(() => {
      if (handled) return;
      global.removeEventListener("popstate", onPopState);
      global.location.href = "./index.html";
    }, 400);
  }

  async function handleBackButton() {
    if (runHandlers()) return;
    if (isHomePage()) {
      try {
        await appPlugin?.minimizeApp?.();
      } catch (error) {
        console.warn("[SNORKY Back] minimizeApp 실패:", error?.message || error);
      }
      return;
    }
    goBackOrHome();
  }

  function init(attempt) {
    if (listenerRegistered || !isNativeAndroid()) return;
    appPlugin = global.Capacitor?.Plugins?.App || null;
    if (!appPlugin) {
      if (!attempt) setTimeout(() => init(1), 300);
      else console.warn("[SNORKY Back] App 플러그인을 찾을 수 없어 뒤로가기 처리를 등록하지 못했습니다.");
      return;
    }
    listenerRegistered = true;
    appPlugin.addListener("backButton", handleBackButton);
  }

  global.SNORKYBackHandler = Object.freeze({ registerHandler });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => init(), { once: true });
  else init();
})(window);
