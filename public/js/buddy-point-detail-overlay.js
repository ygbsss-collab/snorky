(function () {
  "use strict";

  let activeOverlay = null;
  let activeFrame = null;
  let returnFocus = null;
  let previousBodyOverflow = "";

  function close() {
    if (!activeOverlay) return;
    window.removeEventListener("message", handleMessage);
    activeOverlay.remove();
    activeOverlay = null;
    activeFrame = null;
    document.body.style.overflow = previousBodyOverflow;
    returnFocus?.focus?.();
    returnFocus = null;
  }

  function handleMessage(event) {
    if (!activeFrame || event.source !== activeFrame.contentWindow || event.origin !== window.location.origin) return;
    if (event.data?.type === "snorky:buddy-point-detail-ready") {
      activeOverlay?.classList.add("is-ready");
      activeOverlay?.setAttribute("aria-hidden", "false");
      return;
    }
    if (event.data?.type === "snorky:buddy-point-detail-close") close();
  }

  function open(options) {
    const pointId = String(options?.pointId || "").trim();
    if (!pointId || activeOverlay) return false;

    const source = String(options?.source || "buddy");
    const postId = String(options?.postId || "");
    const params = new URLSearchParams({ point: pointId, from: source, embed: "buddyPointDetail" });
    if (postId) params.set("postId", postId);

    returnFocus = options?.trigger || document.activeElement;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const overlay = document.createElement("div");
    overlay.className = "buddy-point-detail-overlay";
    overlay.setAttribute("aria-hidden", "true");

    const frame = document.createElement("iframe");
    frame.className = "buddy-point-detail-frame";
    frame.title = "포인트 상세";
    frame.src = `./index.html?${params.toString()}`;
    frame.setAttribute("allow", "geolocation");

    overlay.appendChild(frame);
    activeOverlay = overlay;
    activeFrame = frame;
    window.addEventListener("message", handleMessage);
    document.body.appendChild(overlay);
    return true;
  }

  const style = document.createElement("style");
  style.textContent = `
    .buddy-point-detail-overlay{position:fixed;inset:0;z-index:20000;background:#f5f9fa;opacity:0;visibility:hidden;pointer-events:none;transition:opacity 150ms ease;}
    .buddy-point-detail-overlay.is-ready{opacity:1;visibility:visible;pointer-events:auto;}
    .buddy-point-detail-frame{display:block;width:100%;height:100%;border:0;background:#f5f9fa;}
  `;
  document.head.appendChild(style);

  window.SNORKYBuddyPointDetail = Object.freeze({ open, close });
})();
