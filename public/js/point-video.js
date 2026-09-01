(function () {
  "use strict";

  let screen = null;
  let historyActive = false;

  function parseYouTubeUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;

    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;

      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      let videoId = null;

      if (host === "youtu.be") {
        videoId = url.pathname.split("/").filter(Boolean)[0] || null;
      } else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
        if (url.pathname === "/watch") videoId = url.searchParams.get("v");
        else {
          const parts = url.pathname.split("/").filter(Boolean);
          if (["embed", "shorts", "live"].includes(parts[0])) videoId = parts[1] || null;
        }
      }

      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || "")) return null;

      return {
        videoId,
        embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0`,
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    } catch (_) {
      return null;
    }
  }

  function ensureScreen() {
    if (screen) return screen;

    screen = document.createElement("section");
    screen.id = "pointVideoScreen";
    screen.className = "point-video-screen";
    screen.setAttribute("role", "dialog");
    screen.setAttribute("aria-modal", "true");
    screen.setAttribute("aria-labelledby", "pointVideoScreenTitle");
    screen.hidden = true;
    screen.innerHTML = `
      <header class="point-video-header">
        <button class="point-video-back" type="button" aria-label="포인트 상세로 돌아가기">‹</button>
        <h1 id="pointVideoScreenTitle">포인트 영상</h1>
        <span aria-hidden="true"></span>
      </header>
      <main class="point-video-content">
        <div class="point-video-player" id="pointVideoPlayer"></div>
        <h2 class="point-video-title" id="pointVideoTitle"></h2>
        <p class="point-video-help">재생할 수 없는 영상이거나 연령 확인이 필요한 경우 YouTube에서 확인해 주세요.</p>
        <a class="point-video-youtube-link" id="pointVideoYoutubeLink" target="_blank" rel="noopener noreferrer">YouTube에서 보기</a>
      </main>`;
    document.body.appendChild(screen);
    screen.querySelector(".point-video-back")?.addEventListener("click", () => close(true));
    return screen;
  }

  function open(point) {
    const parsed = parseYouTubeUrl(point?.youtubeUrl);
    if (!parsed) return false;

    const view = ensureScreen();
    const player = view.querySelector("#pointVideoPlayer");
    const title = view.querySelector("#pointVideoTitle");
    const youtubeLink = view.querySelector("#pointVideoYoutubeLink");
    const pointName = String(point?.name || "포인트").trim();

    player.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.src = parsed.embedUrl;
    iframe.title = `${pointName} 포인트 영상`;
    iframe.loading = "eager";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allow = "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    player.appendChild(iframe);

    title.textContent = String(point?.youtubeTitle || "").trim() || `${pointName} 포인트 영상`;
    youtubeLink.href = parsed.watchUrl;

    const pointModal = document.getElementById("pointModal");
    if (pointModal?.classList.contains("open")) pointModal.style.visibility = "hidden";
    view.hidden = false;
    document.body.style.overflow = "hidden";
    view.querySelector(".point-video-back")?.focus();

    if (!historyActive) {
      try {
        history.pushState({ ...(history.state || {}), snorkyPointVideo: true }, "");
        historyActive = true;
      } catch (_) {}
    }
    return true;
  }

  function close(triggerBack = true) {
    if (!screen || screen.hidden) return;
    screen.hidden = true;
    const player = screen.querySelector("#pointVideoPlayer");
    if (player) player.innerHTML = "";

    const pointModal = document.getElementById("pointModal");
    if (pointModal?.classList.contains("open")) {
      pointModal.style.visibility = "visible";
      document.body.style.overflow = "hidden";
      document.getElementById("btnPointVideo")?.focus();
    } else {
      document.body.style.overflow = "";
    }

    if (triggerBack && historyActive) {
      historyActive = false;
      try { history.back(); } catch (_) {}
    } else {
      historyActive = false;
    }
  }

  function isOpen() {
    return Boolean(screen && !screen.hidden);
  }

  window.addEventListener("popstate", () => {
    if (isOpen()) close(false);
  });

  window.SNORKYPointVideo = Object.freeze({ open, close, isOpen, parseYouTubeUrl });
})();
