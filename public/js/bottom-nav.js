(function (global) {
  "use strict";

  const NAV_ITEMS = [
    {
      id: "home",
      label: "홈",
      icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'
    },
    {
      id: "map",
      label: "지도",
      icon: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'
    },
    {
      id: "favorites",
      label: "즐겨찾기",
      icon: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'
    },
    {
      id: "mypage",
      label: "마이페이지",
      icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'
    }
  ];

  function inferActiveItem() {
    const fileName = (global.location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (fileName === "index.html" || fileName === "") {
      const urlParams = new URLSearchParams(global.location.search);
      const view = urlParams.get("view");
      if (view === "map") return "map";
      if (view === "favorites") return "favorites";
      return "home";
    }
    if (fileName === "mypage.html") {
      return "mypage";
    }
    return "";
  }

  function hasLoginSession() {
    if (global.SNORKYAuthSession?.isLoggedIn) return global.SNORKYAuthSession.isLoggedIn();
    try {
      const session = JSON.parse(global.localStorage.getItem("snorky_auth_session_v1") || "null");
      return Boolean(session?.version === 1 && session?.user);
    } catch (_) {
      return false;
    }
  }

  function isAnySubViewOpen() {
    try {
      if (global.SNORKYPointDetailMap?.isOpen?.()) return true;
      if (global.SNORKYTodayConditionDetail?.isOpen?.()) return true;
      if (global.SNORKYDailyForecast?.isOpen?.()) return true;
      if (global.SNORKYPointVideo?.isOpen?.()) return true;

      const pm = document.getElementById("pointModal");
      if (pm && (pm.classList.contains("open") || pm.style.visibility === "visible" || getComputedStyle(pm).display !== "none")) {
        return true;
      }

      const pdm = document.getElementById("pointDetailMapModal");
      if (pdm && (pdm.classList.contains("open") || getComputedStyle(pdm).display !== "none")) return true;

      const tc = document.getElementById("todayConditionDetail");
      if (tc && (tc.classList.contains("open") || getComputedStyle(tc).display !== "none")) return true;

      const df = document.getElementById("dailyForecastDetailModal");
      if (df && (df.classList.contains("open") || getComputedStyle(df).display !== "none")) return true;

      const lb = document.getElementById("photoLightbox");
      if (lb && lb.classList.contains("open")) return true;

      const nb = document.querySelector(".nearby-best-overlay");
      if (nb && nb.classList.contains("open")) return true;

      const prof = document.getElementById("homeProfilePopup");
      if (prof && !prof.hidden) return true;

      const adminDlg = document.querySelector(".admin-dialog.open");
      if (adminDlg) return true;

      return false;
    } catch (_) {
      return false;
    }
  }

  function closeAllModalsBeforeNav() {
    try {
      if (global.SNORKYPointDetailMap?.close) global.SNORKYPointDetailMap.close(false);
      if (global.SNORKYTodayConditionDetail?.close) global.SNORKYTodayConditionDetail.close(false);
      if (global.SNORKYDailyForecast?.close) global.SNORKYDailyForecast.close(false);
      if (global.SNORKYPointVideo?.close) global.SNORKYPointVideo.close(false);

      if (typeof global.finishClosePointModal === "function") {
        global.finishClosePointModal(false);
      } else if (typeof global.closePointModal === "function") {
        global.closePointModal(false);
      }
      const pm = document.getElementById("pointModal");
      if (pm) {
        pm.classList.remove("open");
        pm.style.visibility = "";
      }

      const pdm = document.getElementById("pointDetailMapModal");
      if (pdm) {
        pdm.classList.remove("open");
        pdm.style.display = "none";
      }

      const tc = document.getElementById("todayConditionDetail");
      if (tc) {
        tc.classList.remove("open");
        tc.style.display = "none";
      }

      const df = document.getElementById("dailyForecastDetailModal");
      if (df) {
        df.classList.remove("open");
        df.style.display = "none";
      }

      if (typeof global.closePhotoLightbox === "function") global.closePhotoLightbox();
      const lb = document.getElementById("photoLightbox");
      if (lb) lb.classList.remove("open");

      const nb = document.querySelector(".nearby-best-overlay");
      if (nb) nb.classList.remove("open");

      const prof = document.getElementById("homeProfilePopup");
      if (prof) prof.hidden = true;

      document.querySelectorAll(".admin-dialog.open").forEach((dlg) => dlg.classList.remove("open"));
      document.body.style.overflow = "";
    } catch (_) {}
  }

  function navigate(target) {
    const fileName = (global.location.pathname.split("/").pop() || "index.html").toLowerCase();
    const isIndex = fileName === "index.html" || fileName === "";
    const subViewOpen = isAnySubViewOpen();

    if (subViewOpen) {
      closeAllModalsBeforeNav();
    }

    if (target === "home") {
      if (isIndex) {
        if (subViewOpen) {
          global.location.href = "./index.html";
          return;
        }
        if (typeof global.closeMapScreen === "function") global.closeMapScreen();
        document.body.classList.remove("home-show-legacy");
        if (global.location.search) {
          try { history.replaceState(null, "", "./index.html"); } catch (_) {}
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
        setActive("home");
        return;
      }
      global.location.href = "./index.html";
    } else if (target === "map") {
      if (subViewOpen) {
        global.location.href = "./index.html?view=map";
        return;
      }
      if (isIndex) {
        // 메인 화면에서는 기존 SPA 지도 열기 지원
        if (typeof global.openMapScreen === "function") {
          document.body.classList.remove("home-show-legacy");
          if (typeof global.resetSnorkyMapToGeneral === "function") global.resetSnorkyMapToGeneral();
          global.openMapScreen();
          if (typeof global.renderSnorkyMapChipsBar === "function") global.renderSnorkyMapChipsBar();
          if (typeof global.renderSnorkyMapMarkers === "function") global.renderSnorkyMapMarkers();
          if (typeof global.renderSnorkyMapBottomCards === "function") global.renderSnorkyMapBottomCards();
          if (typeof global.applySnorkyMapInitialViewport === "function") global.applySnorkyMapInitialViewport(false);
          setActive("map");
          try { history.replaceState(null, "", "./index.html?view=map"); } catch (_) {}
          return;
        }
      }
      global.location.href = "./index.html?view=map";
    } else if (target === "favorites") {
      if (subViewOpen) {
        global.location.href = "./index.html?view=favorites";
        return;
      }
      if (!hasLoginSession()) {
        if (global.SNORKYAuthSession?.showLoginPrompt) {
          global.SNORKYAuthSession.showLoginPrompt("즐겨찾기는 로그인 후 이용할 수 있어요.");
        } else {
          global.location.href = "./login.html?redirect=" + encodeURIComponent("index.html?view=favorites");
        }
        return;
      }
      if (isIndex && typeof global.openFavoritesOnMap === "function") {
        global.openFavoritesOnMap();
        setActive("favorites");
        try { history.replaceState(null, "", "./index.html?view=favorites"); } catch (_) {}
        return;
      }
      global.location.href = "./index.html?view=favorites";
    } else if (target === "mypage") {
      if (subViewOpen) {
        closeAllModalsBeforeNav();
      }
      global.location.href = hasLoginSession() ? "./mypage.html" : "./login.html?redirect=mypage.html";
    }
  }

  function setActive(activeItem) {
    const nav = document.querySelector(".home-bottom-nav");
    if (!nav) return;
    nav.querySelectorAll("[data-bottom]").forEach((button) => {
      const isActive = button.dataset.bottom === activeItem;
      button.classList.toggle("active", isActive);
      if (isActive) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function bindGlobalDelegation() {
    if (global.__snorkyBottomNavDelegated) return;
    global.__snorkyBottomNavDelegated = true;

    document.addEventListener("click", function (event) {
      const button = event.target.closest(".home-bottom-nav [data-bottom]");
      if (!button) return;

      const target = button.dataset.bottom;
      if (!target) return;

      const fileName = (global.location.pathname.split("/").pop() || "index.html").toLowerCase();
      const isIndex = fileName === "index.html" || fileName === "";
      const subViewOpen = isAnySubViewOpen();

      // 서브화면이 열려 있거나 메인 화면이 아닌 페이지에서는 전역 위임 핸들러가 완벽하게 전담 처리
      if (subViewOpen || !isIndex) {
        event.preventDefault();
        event.stopImmediatePropagation();
        navigate(target);
      }
      // 서브화면이 없는 순수 메인 화면에서는 home-v2.js의 기존 인터랙션(지도 SPA 토글 등)과 연동되도록 이벤트 전파 허용
    }, true);
  }

  function mount(options = {}) {
    const activeItem = options.active === undefined ? inferActiveItem() : options.active;
    const existing = document.querySelector(".home-bottom-nav");
    if (existing) {
      setActive(activeItem);
      return existing;
    }

    let spacer = null;
    if (options.spacer !== false) {
      spacer = document.createElement("div");
      spacer.className = "snorky-bottom-nav-spacer";
      spacer.setAttribute("aria-hidden", "true");
    }

    const nav = document.createElement("nav");
    nav.className = "home-bottom-nav";
    nav.setAttribute("aria-label", "하단 내비게이션");
    nav.innerHTML = NAV_ITEMS.map((item) => `
      <button type="button" data-bottom="${item.id}">
        <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${item.icon}</svg>
        <span>${item.label}</span>
      </button>
    `).join("");

    document.body.classList.add("snorky-has-bottom-nav");
    if (spacer) document.body.append(spacer);
    document.body.append(nav);
    setActive(activeItem);
    return nav;
  }

  global.SNORKYBottomNav = Object.freeze({ mount, setActive, navigate, isAnySubViewOpen, closeAllModalsBeforeNav });

  // 전역 위임 리스너 즉시 1회 바인딩
  bindGlobalDelegation();

  function autoMount() {
    if (!document.querySelector(".home-bottom-nav")) mount();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoMount, { once: true });
  else autoMount();
})(window);
