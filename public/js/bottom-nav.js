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
    if (fileName === "index.html") return "home";
    if (["mypage.html", "my-spots.html", "diving-schedule.html", "my-buddy.html"].includes(fileName)) {
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

  function navigate(target) {
    if (target === "home") {
      global.location.href = "./index.html";
    } else if (target === "map" || target === "favorites") {
      global.location.href = `./index.html?view=${target}&nointro=1`;
    } else if (target === "mypage") {
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

    if (options.navigation !== false) {
      nav.addEventListener("click", (event) => {
        const button = event.target.closest("[data-bottom]");
        if (button) navigate(button.dataset.bottom);
      });
    }

    document.body.classList.add("snorky-has-bottom-nav");
    if (spacer) document.body.append(spacer);
    document.body.append(nav);
    setActive(activeItem);
    return nav;
  }

  global.SNORKYBottomNav = Object.freeze({ mount, setActive });

  function autoMount() {
    if (!document.querySelector(".home-bottom-nav")) mount();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoMount, { once: true });
  else autoMount();
})(window);
