/**
 * Shared entry transition for Today and 6-day condition details.
 * Data loading runs independently; completion is shown only after a successful result.
 */
(function () {
  "use strict";

  const STEPS = [
    "해양 흐름을 분석하고 있어요",
    "기상 변화를 정밀하게 확인하고 있어요",
    "스노키가 입수 컨디션을 종합하고 있어요",
    "분석이 완료되었어요",
  ];
  const CAPTIONS = [
    "파고·파주기·조류 데이터를 교차 분석합니다",
    "풍속·강수·시정 변화를 함께 확인합니다",
    "안전 기준과 포인트 특성을 종합합니다",
    "최신 분석 결과를 준비했습니다",
  ];
  const STEP_MS = 750;
  const COMPLETE_AT_MS = STEP_MS * 3;
  const COMPLETE_HOLD_MS = STEP_MS;
  const activeByHost = new WeakMap();

  function createOverlay() {
    const overlay = document.createElement("section");
    overlay.className = "snorky-analysis-overlay is-visible";
    overlay.setAttribute("aria-label", "SNORKY 컨디션 분석");
    overlay.innerHTML = `
      <div class="snorky-analysis-depth" aria-hidden="true">
        <span class="snorky-analysis-ray snorky-analysis-ray-a"></span>
        <span class="snorky-analysis-ray snorky-analysis-ray-b"></span>
        <span class="snorky-analysis-ray snorky-analysis-ray-c"></span>
        <div class="snorky-analysis-particles">
          ${Array.from({ length: 12 }, () => "<i></i>").join("")}
        </div>
      </div>
      <div class="snorky-analysis-stage">
        <div class="snorky-analysis-visual" aria-hidden="true">
          <span class="snorky-analysis-data-line snorky-analysis-data-line-a"></span>
          <span class="snorky-analysis-data-line snorky-analysis-data-line-b"></span>
          <span class="snorky-analysis-data-point snorky-analysis-data-point-a"></span>
          <span class="snorky-analysis-data-point snorky-analysis-data-point-b"></span>
          <span class="snorky-analysis-data-point snorky-analysis-data-point-c"></span>
          <div class="snorky-analysis-sonar">
            <span class="snorky-analysis-ring snorky-analysis-ring-a"></span>
            <span class="snorky-analysis-ring snorky-analysis-ring-b"></span>
            <span class="snorky-analysis-ring snorky-analysis-ring-c"></span>
            <span class="snorky-analysis-sweep"></span>
          </div>
          <div class="snorky-analysis-logo-shell">
            <img src="./public/images/snorky-symbol.png" alt="" class="snorky-analysis-logo">
            <span class="snorky-analysis-complete-signal">✓</span>
          </div>
          <span class="snorky-analysis-brand-word" aria-hidden="true">SNORKY</span>
          <div class="snorky-analysis-waveform">
            ${Array.from({ length: 15 }, () => "<i></i>").join("")}
          </div>
        </div>
        <p class="snorky-analysis-kicker">SNORKY MARINE INTELLIGENCE</p>
        <p class="snorky-analysis-status" role="status" aria-live="polite">${STEPS[0]}</p>
        <div class="snorky-analysis-progress" aria-hidden="true">
          ${STEPS.map((_, index) => `<span class="${index === 0 ? "is-current" : ""}"></span>`).join("")}
        </div>
        <p class="snorky-analysis-caption">${CAPTIONS[0]}</p>
      </div>
      <aside class="snorky-analysis-ad-slot" data-snorky-analysis-ad-slot hidden aria-hidden="true"></aside>
    `;
    return overlay;
  }

  function start(host) {
    if (!host) return null;
    activeByHost.get(host)?.cancel();

    const overlay = createOverlay();
    const status = overlay.querySelector(".snorky-analysis-status");
    const caption = overlay.querySelector(".snorky-analysis-caption");
    const progress = [...overlay.querySelectorAll(".snorky-analysis-progress span")];
    const timers = new Set();
    const startedAt = performance.now();
    let stopped = false;
    let completionStarted = false;

    function schedule(callback, delay) {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delay);
      timers.add(timer);
      return timer;
    }

    function setStep(index) {
      if (stopped || !status) return;
      status.textContent = STEPS[index];
      if (caption) caption.textContent = CAPTIONS[index];
      overlay.dataset.step = String(index + 1);
      progress.forEach((dot, dotIndex) => {
        dot.classList.toggle("is-complete", dotIndex < index);
        dot.classList.toggle("is-current", dotIndex === index);
      });
      if (index === STEPS.length - 1) overlay.classList.add("is-complete");
    }

    function remove() {
      overlay.remove();
      if (activeByHost.get(host) === controller) activeByHost.delete(host);
    }

    function cancel() {
      stopped = true;
      timers.forEach(window.clearTimeout);
      timers.clear();
      remove();
    }

    function fail() {
      if (stopped) return;
      stopped = true;
      timers.forEach(window.clearTimeout);
      timers.clear();
      overlay.classList.add("is-aborted");
      schedule(remove, 140);
    }

    function showCompletion() {
      if (stopped || completionStarted) return;
      completionStarted = true;
      setStep(3);
      schedule(() => overlay.classList.add("is-leaving"), COMPLETE_HOLD_MS - 140);
      schedule(() => {
        stopped = true;
        remove();
      }, COMPLETE_HOLD_MS);
    }

    function complete() {
      if (stopped || completionStarted) return;
      const remaining = Math.max(0, COMPLETE_AT_MS - (performance.now() - startedAt));
      schedule(showCompletion, remaining);
    }

    const controller = Object.freeze({ complete, fail, cancel });
    activeByHost.set(host, controller);
    host.appendChild(overlay);
    schedule(() => setStep(1), STEP_MS);
    schedule(() => setStep(2), STEP_MS * 2);
    return controller;
  }

  window.SNORKYConditionAnalysis = Object.freeze({ start });
})();
