/**
 * SNORKY 3.0: Square Detailed Metrics Layout — Today Condition Detail Screen
 * Based on Stitch Screen: ba56b0b73c30424d854c98344df067ed
 * Project: projects/5550177983917219663
 */
(function () {
  "use strict";

  let modalEl = null;
  let activePoint = null;
  let todayRows = [];
  let selectedHour = null;
  let currentHour = null;
  let todayDayData = null;
  let marineData = null;
  let kmaData = null;
  let historyActive = false;

  // ─────────────────────────────────────────────────────────────
  // Helper Utilities
  // ─────────────────────────────────────────────────────────────
  function escapeHtml(val) {
    return String(val ?? "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmt(num, digits = 1) {
    if (!Number.isFinite(Number(num))) return "--";
    return Number(num).toFixed(digits);
  }

  function formatMetricsReferenceTime(row) {
    const match = String(row?.timestamp || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):/);
    return match ? `${match[1]} ${match[2]}시 기준` : "--";
  }

  function getKoreanDateText(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date();
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const month = d.getMonth() + 1;
    const date = d.getDate();
    const dayName = days[d.getDay()];
    return `${month}월 ${date}일 (${dayName})`;
  }

  function getWeatherIconInfo(row) {
    const precip = row?.precipitation ?? 0;
    const clouds = row?.cloud_cover;
    const skyCode = Number(row?.sky_code);
    const precipitationTypeCode = Number(row?.precipitation_type_code);

    if (precipitationTypeCode > 0 || precip > 0.5) return { icon: "rainy", label: "비", color: "#60a5fa" };
    if (skyCode === 4) return { icon: "cloud", label: "흐림", color: "#94a3b8" };
    if (skyCode === 3) return { icon: "partly_cloudy_day", label: "구름많음", color: "#38bdf8" };
    if (skyCode === 1) return { icon: "sunny", label: "맑음", color: "#f59e0b" };
    if (Number.isFinite(clouds) && clouds >= 80) return { icon: "cloud", label: "흐림", color: "#94a3b8" };
    if (Number.isFinite(clouds) && clouds >= 40) return { icon: "partly_cloudy_day", label: "구름많음", color: "#38bdf8" };
    return { icon: "sunny", label: "맑음", color: "#f59e0b" };
  }

  const STITCH_HOURLY_WEATHER_ICONS = Object.freeze({
    "day-clear": Object.freeze({ icon: "sunny", color: "#003e7a" }),
    "day-mostly-cloudy": Object.freeze({ icon: "partly_cloudy_day", color: "#003e7a" }),
    "day-overcast": Object.freeze({ icon: "cloud", color: "#003e7a" }),
    "day-rain": Object.freeze({ icon: "rainy", color: "#006684" }),
    "sunrise-clear": Object.freeze({ icon: "brightness_5", color: "#983408" }),
    "sunrise-mostly-cloudy": Object.freeze({ icon: "wb_twilight", color: "#983408" }),
    "sunrise-overcast": Object.freeze({ icon: "cloud", color: "#727783" }),
    "sunrise-rain": Object.freeze({ icon: "weather_mix", color: "#006684" }),
    "sunset-clear": Object.freeze({ icon: "brightness_4", color: "#732200" }),
    "sunset-mostly-cloudy": Object.freeze({ icon: "wb_twilight", color: "#732200" }),
    "sunset-overcast": Object.freeze({ icon: "cloud", color: "#727783" }),
    "sunset-rain": Object.freeze({ icon: "weather_mix", color: "#006684" }),
    "night-clear": Object.freeze({ icon: "clear_night", color: "#003e7a" }),
    "night-mostly-cloudy": Object.freeze({ icon: "partly_cloudy_night", color: "#003e7a" }),
    "night-overcast": Object.freeze({ icon: "cloud", color: "#727783" }),
    "night-rain": Object.freeze({ icon: "rainy", color: "#006684" }),
  });

  const VISUAL_LIGHT_ICON_KEYS = Object.freeze({
    DAY: "day",
    SUNRISE_EFFECT: "sunrise",
    SUNSET_EFFECT: "sunset",
    NIGHT: "night",
  });

  const VISUAL_WEATHER_ICON_KEYS = Object.freeze({
    CLEAR: "clear",
    MOSTLY_CLOUDY: "mostly-cloudy",
    OVERCAST: "overcast",
    RAIN: "rain",
  });

  function getHourlyCardWeatherIconInfo(row) {
    const visualCondition = row?.v12?.visualCondition;
    const lightKey = VISUAL_LIGHT_ICON_KEYS[visualCondition?.lightState];
    const weatherKey = VISUAL_WEATHER_ICON_KEYS[visualCondition?.weatherState];
    const stitchIcon = lightKey && weatherKey
      ? STITCH_HOURLY_WEATHER_ICONS[`${lightKey}-${weatherKey}`]
      : null;

    return stitchIcon
      ? { ...stitchIcon, isStitchMapping: true }
      : { ...getWeatherIconInfo(row), isStitchMapping: false };
  }

  function getVisualLightLabel(lightState) {
    return ({
      DAY: "낮",
      SUNRISE_EFFECT: "일출 영향",
      SUNSET_EFFECT: "일몰 영향",
      NIGHT: "밤",
    })[lightState] || "확인 불가";
  }

  function getVisualWeatherLabel(weatherState) {
    return ({
      CLEAR: "맑음",
      MOSTLY_CLOUDY: "구름많음",
      OVERCAST: "흐림",
      RAIN: "비",
    })[weatherState] || "확인 불가";
  }

  function getMetricGradeTheme(label) {
    const text = String(label || "").trim();
    if (text === "위험·제한적" || text === "입수 비추천") return { pillClass: "pill-bad", text };
    if (text === "최상") return { pillClass: "pill-good", text };
    if (text === "영향 없음" || text === "완화") return { pillClass: "pill-neutral", text };
    if (text === "영향 있음") return { pillClass: "pill-caution", text };
    if (text === "데이터없음" || text === "데이터 없음" || text === "--") return { pillClass: "pill-neutral", text: "데이터 없음" };
    if (text.includes("매우") && text.includes("좋음")) return { pillClass: "pill-good", text: "매우좋음" };
    if (text === "매우 나쁨") return { pillClass: "pill-bad", text };
    if (text.includes("좋음") || text.includes("최적") || text.includes("추천")) return { pillClass: "pill-good", text: "좋음" };
    if (text.includes("보통") || text.includes("적정")) return { pillClass: "pill-normal", text: "보통" };
    if (text.includes("주의") || text.includes("차가움") || text.includes("짧음") || text.includes("흐림")) return { pillClass: "pill-caution", text: text.length > 4 ? "주의" : text };
    if (text.includes("나쁨") || text.includes("금지") || text.includes("위험")) return { pillClass: "pill-bad", text: text.includes("금지") ? "입수금지" : "나쁨" };
    return { pillClass: "pill-neutral", text: text || "보통" };
  }

  // ─────────────────────────────────────────────────────────────
  // DOM Initialization
  // ─────────────────────────────────────────────────────────────
  function ensureModal() {
    if (modalEl) return modalEl;

    modalEl = document.createElement("div");
    modalEl.id = "todayConditionModal";
    modalEl.className = "today-condition-modal";
    modalEl.setAttribute("role", "dialog");
    modalEl.setAttribute("aria-modal", "true");
    modalEl.setAttribute("aria-label", "오늘 컨디션 상세 정보");

    modalEl.innerHTML = `
      <div class="today-condition-sheet">
        <!-- TopAppBar -->
        <header class="tc-top-app-bar">
          <button id="tcBackBtn" class="tc-icon-btn" type="button" aria-label="뒤로가기">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 id="tcPointTitle" class="tc-app-title">포인트 컨디션</h1>
          <button id="tcFavoriteBtn" class="tc-icon-btn tc-favorite-btn" type="button" aria-label="즐겨찾기">
            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        </header>

        <!-- Scrollable Body -->
        <div id="tcBody" class="tc-body">
          <!-- 1. Header & Weather Section -->
          <section class="tc-header-section">
            <div class="tc-header-title-row">
              <div class="tc-header-title-wrap">
                <h2>오늘의 컨디션</h2>
                <p>시간대별 바다 컨디션을 확인하세요</p>
              </div>
              <div id="tcDateBadge" class="tc-date-badge">
                <span class="material-symbols-outlined">calendar_today</span>
                <span id="tcDateText">8월 20일 (목)</span>
              </div>
            </div>

            <!-- Weather Card -->
            <div class="tc-weather-card">
              <div class="tc-weather-left">
                <div id="tcWeatherIconWrap" class="tc-weather-icon-circle">
                  <span id="tcWeatherIcon" class="material-symbols-outlined">sunny</span>
                </div>
                <div class="tc-weather-label-wrap">
                  <span id="tcWeatherLabel" class="tc-weather-label">맑음</span>
                  <span id="tcWeatherLiveBadge" class="tc-weather-live-badge" title="현재 시각 기준 KMA 1시간 예보">실시간</span>
                </div>
              </div>
              <div class="tc-weather-divider"></div>
              <div class="tc-weather-right">
                <div class="tc-temp-row">
                  <span id="tcTempCurrent" class="tc-temp-current">--°</span>
                  <span id="tcTempRange" class="tc-temp-range">--° / --°</span>
                </div>
                <div class="tc-rain-row">
                  <div class="tc-rain-item">
                    <span class="material-symbols-outlined" style="color:#3b82f6;">water_drop</span>
                    <span id="tcRainAmount">0mm</span>
                  </div>
                  <div class="tc-rain-item">
                    <span class="material-symbols-outlined" style="color:#6366f1;">umbrella</span>
                    <span id="tcRainProb">--%</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- 2. Square Hourly Scroller (85x85 Cards) -->
          <section class="tc-hourly-section">
            <div id="tcHourlyList" class="tc-hourly-list">
              <!-- Dynamically populated 85x85 cards -->
            </div>
          </section>

          <!-- 3. Hero Score Card -->
          <section class="tc-hero-card">
            <div class="tc-hero-bg" style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuC9-9ndcwb3HGLypeC_28jBKkjdc11Bn8Xd5_TrvLIZoBPuDPMsRSwjG_o19NJiWodfvsEBGoFkqNQ4Wk46UeqLVgHX6wTq65ySTnPMyPMDubaHfWTE8bCzubyPNz1UtCUaotdjRj0g5SQ_O2hyx6xvYKenyDMsvyS1h25nyoYbf61XgDsGzg7P25C_K-5J4J5iEnAcE20PGnPmKtc2ONey_-90f7quCqoeIhuJCpKhjsuwEart9aOm');"></div>
            <div class="tc-hero-overlay"></div>
            <div class="tc-hero-content">
              <div class="tc-hero-left">
                <div class="tc-hero-status-row">
                  <span id="tcHeroStatusText" class="tc-hero-status-text">보통</span>
                  <span id="tcHeroStatusChip" class="tc-hero-status-chip">
                    <span class="material-symbols-outlined">check_circle</span>
                    <span id="tcHeroStatusChipText">적정</span>
                  </span>
                </div>
                <p id="tcHeroCaption" class="tc-hero-caption">시간대별 바다 컨디션을 확인하세요.</p>
              </div>
              <div class="tc-hero-gauge-wrap">
                <svg class="tc-hero-gauge-svg" viewBox="0 0 100 100">
                  <circle class="tc-hero-gauge-track" cx="50" cy="50" r="42"></circle>
                  <circle id="tcHeroGaugeProgress" class="tc-hero-gauge-progress" cx="50" cy="50" r="42" stroke-dasharray="264" stroke-dashoffset="264"></circle>
                </svg>
                <div class="tc-hero-gauge-text">
                  <span id="tcHeroScoreVal" class="tc-hero-gauge-val">--</span>
                  <span id="tcHeroScoreUnit" class="tc-hero-gauge-unit">점</span>
                </div>
              </div>
            </div>
          </section>

          <!-- 4. Square Detailed Metrics Grid (3x3) -->
          <section class="tc-metrics-section">
            <div class="tc-metrics-header">
              <h3>바다 수치</h3>
              <div id="tcMetricsRefBadge" class="tc-metrics-ref-badge" role="button" tabindex="0">
                <span id="tcMetricsRefTime">--</span>
                <span class="material-symbols-outlined">info</span>
              </div>
            </div>
            <div id="tcMetricsGrid" class="tc-metrics-grid">
              <!-- 9 Square Metric Cards -->
            </div>
          </section>

          <!-- 5. Safety Section (Shown only when warnings/alerts exist) -->
          <section id="tcSafetySection" class="tc-safety-section" hidden>
            <div class="tc-safety-title-row">
              <span class="material-symbols-outlined">security</span>
              <span>특보 및 안전 정보</span>
            </div>
            <div id="tcSafetyBanner" class="tc-safety-banner banner-warning">
              <span class="material-symbols-outlined">warning</span>
              <span id="tcSafetyBannerText">해상 특보 정보 확인 중</span>
            </div>
          </section>

          <!-- 6. Footer Attribution -->
          <footer class="tc-footer">
            <p class="tc-footer-disclaimer">바다 컨디션은 수시로 변할 수 있으니, 입수 전 현장을 확인 바랍니다.</p>
          </footer>
        </div>
      </div>

      <!-- Bottom Sheet Modal for '더보기' -->
      <div id="tcBottomSheetOverlay" class="tc-bottom-sheet-overlay">
        <div class="tc-bottom-sheet">
          <div class="tc-sheet-handle"></div>
          <div class="tc-sheet-head">
            <h3 id="tcSheetTitle">
              <span id="tcSheetIcon" class="material-symbols-outlined">visibility</span>
              <span id="tcSheetTitleText">예상 수중시야 평가 상세</span>
            </h3>
            <button id="tcSheetCloseBtn" class="tc-sheet-close" type="button" aria-label="닫기">×</button>
          </div>
          <div id="tcSheetBody" class="tc-sheet-content">
            <!-- Dynamic sheet content -->
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalEl);

    // Event bindings
    document.getElementById("tcBackBtn")?.addEventListener("click", () => close(true));
    document.getElementById("tcFavoriteBtn")?.addEventListener("click", toggleFavorite);
    document.getElementById("tcMetricsRefBadge")?.addEventListener("click", () => openSourceSheet());
    document.getElementById("tcFooterCard")?.addEventListener("click", () => openSourceSheet());
    document.getElementById("tcSheetCloseBtn")?.addEventListener("click", closeBottomSheet);
    
    document.getElementById("tcBottomSheetOverlay")?.addEventListener("click", function (e) {
      if (e.target === this) closeBottomSheet();
    });

    modalEl.addEventListener("click", function (e) {
      if (e.target === modalEl) close(true);
    });

    return modalEl;
  }

  // ─────────────────────────────────────────────────────────────
  // Data Synchronization from loaded dataset
  // ─────────────────────────────────────────────────────────────
  function syncData(data, customRows = null, customDay = null) {
    if (!data && !customRows) return false;

    todayDayData = customDay || data?.days?.[0] || data?.todayView || null;
    todayRows = (customRows && customRows.length) ? customRows : (todayDayData?.rows || data?.todayView?.rows || []);
    marineData = data?.marine || null;
    kmaData = data?.kmaCache || null;

    if (!Array.isArray(todayRows) || !todayRows.length) return false;

    // Pick the closer of the latest past slot and the nearest future slot.
    const now = new Date();
    const nowHour = now.getHours() + now.getMinutes() / 60;
    const keyHours = [3, 6, 9, 12, 15, 18, 21];
    const slots = todayRows.filter(r => keyHours.includes(r.hour)).length >= 3
      ? todayRows.filter(r => keyHours.includes(r.hour))
      : todayRows;
    const latestPast = [...slots].filter(r => r.hour < nowHour).sort((a, b) => b.hour - a.hour)[0];
    if (!selectedHour || !todayRows.some(r => r.hour === selectedHour) || (latestPast && selectedHour < latestPast.hour)) {
      const nearestFuture = [...slots].filter(r => r.hour >= nowHour).sort((a, b) => a.hour - b.hour)[0];
      const initial = !latestPast ? nearestFuture : !nearestFuture ? latestPast
        : nowHour - latestPast.hour <= nearestFuture.hour - nowHour ? latestPast : nearestFuture;
      selectedHour = initial?.hour ?? slots[0]?.hour ?? todayRows[0].hour;
    }
    if (currentHour === null || !slots.some(r => r.hour === currentHour)) currentHour = selectedHour;

    renderHeader();
    renderCurrentKmaWeather();
    renderHourlyScroller();
    renderSelectedHourData();
    return true;
  }

  function renderLoadingState() {
    const scroller = document.getElementById("tcHourlyList");
    if (scroller) {
      scroller.innerHTML = `<div style="padding:14px;font-size:12.5px;color:#64748b;font-weight:600;text-align:center;width:100%;">시간별 예보 데이터를 불러오는 중입니다...</div>`;
    }
    const grid = document.getElementById("tcMetricsGrid");
    if (grid) {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:24px;text-align:center;font-size:13px;color:#64748b;">바다 수치 데이터를 로딩하고 있습니다...</div>`;
    }
  }

  function renderErrorState(message) {
    const scroller = document.getElementById("tcHourlyList");
    if (scroller) {
      scroller.innerHTML = `
        <div style="padding:14px 18px;font-size:12.5px;color:#ef4444;font-weight:600;text-align:center;width:100%;display:flex;align-items:center;justify-content:center;gap:10px;">
          <span>${escapeHtml(message || "현재 예보 데이터를 불러오지 못했습니다.")}</span>
          <button id="tcRetryBtn" type="button" style="padding:4px 10px;border-radius:6px;border:1px solid #cbd5e1;background:#ffffff;color:#0f172a;font-size:12px;font-weight:600;cursor:pointer;">다시 시도</button>
        </div>
      `;
      document.getElementById("tcRetryBtn")?.addEventListener("click", () => {
        if (activePoint && typeof load === "function") {
          renderLoadingState();
          load(activePoint).then(() => {
            syncData(window.SNORKY_LAST_LOADED_DATA);
          }).catch(e => {
            renderErrorState("예보 데이터를 불러오는 중 오류가 발생했습니다.");
          });
        }
      });
    }
    const grid = document.getElementById("tcMetricsGrid");
    if (grid) {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:24px;text-align:center;font-size:13px;color:#64748b;">${escapeHtml(message || "현재 예보 데이터를 불러오지 못했습니다.")}</div>`;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Open / Close Screen
  // ─────────────────────────────────────────────────────────────
  function open(point, options = {}) {
    ensureModal();

    activePoint = point || (typeof spot !== "undefined" ? spot : null);
    if (!activePoint) return;
    selectedHour = null;
    currentHour = null;

    const currentPointId = String(activePoint.supabaseId || activePoint.id || activePoint.name || (Array.isArray(activePoint) ? activePoint[0] : ""));
    const directData = options.todayData || window.SNORKY_LAST_LOADED_DATA;
    const directRows = (options.todayRows && options.todayRows.length) ? options.todayRows : (directData?.days?.[0]?.rows || directData?.todayView?.rows || []);

    console.info('[SNORKY TODAY DEBUG] C. today-condition-detail open() 진입:', {
      pointId: currentPointId,
      pointName: activePoint.name || (Array.isArray(activePoint) ? activePoint[0] : ""),
      hasData: Boolean(directData),
      rowsLength: directRows.length,
      optionsProvided: Boolean(options.todayData || options.todayRows)
    });

    // Hide point modal behind smoothly
    const pointModal = document.getElementById("pointModal");
    if (pointModal && pointModal.classList.contains("open")) {
      pointModal.style.visibility = "hidden";
    }

    modalEl.classList.add("open");
    document.body.style.overflow = "hidden";

    // History state for smooth back navigation
    if (!historyActive) {
      try {
        history.pushState({ ...history.state, snorkyTodayDetail: true }, "");
        historyActive = true;
      } catch (_) {}
    }

    renderHeader();

    // Verify point match if data is provided
    let isMatching = false;
    if (directData?.spot) {
      const dataSpotId = String(directData.spot.supabaseId || directData.spot.id || directData.spot.name || (Array.isArray(directData.spot) ? directData.spot[0] : ""));
      const activeName = activePoint.name || (Array.isArray(activePoint) ? activePoint[0] : "");
      const dataSpotName = directData.spot.name || (Array.isArray(directData.spot) ? directData.spot[0] : "");

      if (dataSpotId && currentPointId && dataSpotId === currentPointId) {
        isMatching = true;
      } else if (activeName && dataSpotName && activeName === dataSpotName) {
        isMatching = true;
      }
    } else if (directRows.length > 0) {
      isMatching = true;
    }

    if (isMatching && directRows.length > 0) {
      syncData(directData, directRows, options.todayDay);
    } else {
      // If not yet loaded or mismatched, trigger load and update
      renderLoadingState();
      if (typeof load === "function") {
        load(activePoint).then(() => {
          const freshData = window.SNORKY_LAST_LOADED_DATA;
          const freshRows = freshData?.days?.[0]?.rows || freshData?.todayView?.rows || [];
          if (freshRows.length > 0) {
            syncData(freshData, freshRows);
          } else {
            renderErrorState("현재 예보 데이터를 불러오지 못했습니다.");
          }
        }).catch(err => {
          console.warn("[SNORKY Today Detail] load error:", err);
          renderErrorState("예보 데이터를 불러오는 중 오류가 발생했습니다.");
        });
      } else {
        renderErrorState("데이터를 불러올 수 없습니다.");
      }
    }
  }

  function onDataReady(data) {
    if (isOpen()) {
      syncData(data);
    }
  }

  // Listen to custom event from load()
  window.addEventListener("snorky:today-data-ready", function (e) {
    if (isOpen()) {
      syncData(e.detail);
    }
  });

  function isOpen() {
    return Boolean(modalEl && modalEl.classList.contains("open"));
  }

  function close(triggerBack = true) {
    if (!modalEl || !modalEl.classList.contains("open")) return;

    closeBottomSheet();
    modalEl.classList.remove("open");

    // Restore Point Modal visibility
    const pointModal = document.getElementById("pointModal");
    if (pointModal && pointModal.classList.contains("open")) {
      pointModal.style.visibility = "visible";
      document.body.style.overflow = "hidden";
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

  window.addEventListener("popstate", function () {
    if (modalEl && modalEl.classList.contains("open")) {
      close(false);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Favorite Toggle
  // ─────────────────────────────────────────────────────────────
  function toggleFavorite() {
    if (!activePoint) return;
    const btn = document.getElementById("tcFavoriteBtn");
    const isFav = window.SNORKYEngagement?.toggleFavorite?.(activePoint);
    if (btn) {
      btn.classList.toggle("active", Boolean(isFav));
    }
    const modalFav = document.getElementById("pointFavoriteToggle");
    if (modalFav) {
      modalFav.classList.toggle("active", Boolean(isFav));
      modalFav.setAttribute("aria-pressed", String(Boolean(isFav)));
    }
  }

  function updateFavoriteState() {
    const btn = document.getElementById("tcFavoriteBtn");
    if (!btn || !activePoint) return;
    const isFav = window.SNORKYEngagement?.isFavorite?.(activePoint) || false;
    btn.classList.toggle("active", isFav);
  }

  // ─────────────────────────────────────────────────────────────
  // Header Rendering
  // ─────────────────────────────────────────────────────────────
  function renderHeader() {
    const pointName = activePoint?.name || (Array.isArray(activePoint) ? activePoint[0] : "스노클링 포인트");
    const titleEl = document.getElementById("tcPointTitle");
    if (titleEl) titleEl.textContent = pointName;

    updateFavoriteState();

    const dateText = getKoreanDateText(todayDayData?.date);
    const dateEl = document.getElementById("tcDateText");
    if (dateEl) dateEl.textContent = dateText;
  }

  // ─────────────────────────────────────────────────────────────
  // Hourly Scroller Rendering (85x85 Square Cards)
  // ─────────────────────────────────────────────────────────────
  function renderHourlyScroller() {
    const host = document.getElementById("tcHourlyList");
    if (!host) return;

    if (!todayRows.length) {
      host.innerHTML = `<div style="padding:14px;font-size:12.5px;color:#64748b;font-weight:600;text-align:center;width:100%;">시간별 예보 데이터를 불러오는 중입니다...</div>`;
      return;
    }

    const keyHours = [3, 6, 9, 12, 15, 18, 21];
    const filteredRows = todayRows.filter(r => keyHours.includes(r.hour)).length >= 3
      ? todayRows.filter(r => keyHours.includes(r.hour))
      : todayRows;
    const visibleRows = filteredRows.filter(row => currentHour === null || row.hour >= currentHour);

    host.innerHTML = visibleRows.map(row => {
      const isSelected = row.hour === selectedHour;
      const isCurrent = row.hour === currentHour;
      const w = getHourlyCardWeatherIconInfo(row);
      const weatherIconColor = isSelected ? "#FFFFFF" : w.color;
      const weatherIconStyle = w.isStitchMapping
        ? ` style="color:${weatherIconColor};font-variation-settings:'FILL' 0, 'wght' 300;"`
        : "";
      const temp = Number.isFinite(row.temperature) ? Math.round(row.temperature) : "--";
      
      let scoreText = "--";
      let statusText = "보통";
      let gradeClass = "grade-normal";

      const v12 = row.v12;
      const isSafetyBlock = v12?.safety === "BLOCK";
      const isSafetyUnknown = v12?.safety === "UNKNOWN";

      if (isSafetyBlock) {
        scoreText = "--";
        statusText = "입수금지";
        gradeClass = "grade-block";
      } else if (isSafetyUnknown) {
        scoreText = "--";
        statusText = "확인필요";
        gradeClass = "grade-unknown";
      } else {
        const rawScore = v12?.conditionScore != null ? v12.conditionScore : (Number.isFinite(row.score) ? row.score : null);
        scoreText = rawScore != null ? Math.round(rawScore) : "--";
        statusText = window.getSnorkyConditionStatus?.(row) || (scoreText >= 80 ? "좋음" : scoreText >= 65 ? "보통" : scoreText >= 50 ? "주의" : "나쁨");
        
        if (statusText === "좋음") gradeClass = "grade-good";
        else if (statusText === "보통") gradeClass = "grade-normal";
        else if (statusText === "주의") gradeClass = "grade-caution";
        else if (statusText === "나쁨") gradeClass = "grade-bad";
      }

      return `
        <div class="tc-hour-card ${isSelected ? 'active' : ''}" data-tc-hour="${row.hour}" role="button" tabindex="0">
          <span class="tc-hour-time">${String(row.hour).padStart(2, "0")}시</span>
          ${isCurrent ? '<span class="tc-hour-current-badge">현재</span>' : ''}
          <div class="tc-hour-mid">
            <span class="material-symbols-outlined"${weatherIconStyle}>${w.icon}</span>
            <span class="tc-hour-temp">${temp}°</span>
          </div>
          <div class="tc-hour-badge ${gradeClass}">
            <span>${scoreText}</span>
            <span class="tc-hour-badge-divider"></span>
            <span>${statusText}</span>
          </div>
        </div>
      `;
    }).join("");

    // Bind click events
    host.querySelectorAll("[data-tc-hour]").forEach(card => {
      card.addEventListener("click", function () {
        const hour = Number(this.dataset.tcHour);
        if (selectedHour === hour) return;
        selectedHour = hour;

        host.querySelectorAll(".tc-hour-card").forEach(c => c.classList.remove("active"));
        this.classList.add("active");

        renderSelectedHourData();
      });
    });

    // Scroll active card into center view
    setTimeout(() => {
      const activeCard = host.querySelector(".tc-hour-card.active");
      if (activeCard) {
        const scrollLeft = activeCard.offsetLeft - (host.clientWidth - activeCard.offsetWidth) / 2;
        host.parentElement.scrollTo({ left: Math.max(0, scrollLeft), behavior: "smooth" });
      }
    }, 50);
  }

  // ─────────────────────────────────────────────────────────────
  // Selected Hour Data Update (Hero, Weather, Metrics, Safety)
  // ─────────────────────────────────────────────────────────────
  function getActiveHourRow() {
    if (!todayRows.length) return null;
    return todayRows.find(r => r.hour === selectedHour) || todayRows[0];
  }

  function getCurrentKmaForecastRow() {
    const hourly = kmaData?.forecastData?.hourly;
    if (!Array.isArray(hourly) || !hourly.length) return null;

    const now = Date.now();
    const nearest = hourly.reduce((best, candidate) => {
      const candidateTime = new Date(candidate?.datetime).getTime();
      if (!Number.isFinite(candidateTime)) return best;
      const difference = Math.abs(candidateTime - now);
      return !best || difference < best.difference ? { row: candidate, difference } : best;
    }, null)?.row;
    if (!nearest) return null;

    const merged = window.SNORKYKmaWeatherCache?.mergeWeatherData(nearest, {}) || {};
    return {
      timestamp: nearest.datetime,
      temperature: merged.temperature ?? null,
      precipitation: merged.precipitation ?? null,
      precipitation_probability: merged.precipitationProbability ?? null,
      sky_code: merged.skyCode ?? null,
      precipitation_type_code: nearest?.precipitationType?.code ?? null,
    };
  }

  // 상단 날씨는 선택 카드와 분리된 "현재 시각 기준 KMA 1시간 예보"이다.
  function renderCurrentKmaWeather() {
    const row = getCurrentKmaForecastRow();
    const liveBadge = document.getElementById("tcWeatherLiveBadge");
    if (liveBadge) liveBadge.hidden = !row;
    if (!row) return;

    const weather = getWeatherIconInfo(row);
    const weatherIcon = document.getElementById("tcWeatherIcon");
    const weatherLabel = document.getElementById("tcWeatherLabel");
    if (weatherIcon) {
      weatherIcon.textContent = weather.icon;
      weatherIcon.style.color = weather.color;
    }
    if (weatherLabel) weatherLabel.textContent = weather.label;

    const tempCur = document.getElementById("tcTempCurrent");
    if (tempCur) tempCur.textContent = Number.isFinite(row.temperature) ? `${Math.round(row.temperature)}°` : "--°";

    const forecastDate = String(row.timestamp || "").slice(0, 10);
    const daily = kmaData?.forecastData?.daily?.find(item => String(item?.date || "").slice(0, 10) === forecastDate);
    const allTemps = todayRows.map(item => item.temperature).filter(Number.isFinite);
    const minVal = Number.isFinite(daily?.tempMin) ? Number(daily.tempMin)
      : Number.isFinite(todayDayData?.temperature_min) ? todayDayData.temperature_min
      : (allTemps.length ? Math.min(...allTemps) : null);
    const maxVal = Number.isFinite(daily?.tempMax) ? Number(daily.tempMax)
      : Number.isFinite(todayDayData?.temperature_max) ? todayDayData.temperature_max
      : (allTemps.length ? Math.max(...allTemps) : null);
    const tempRange = document.getElementById("tcTempRange");
    if (tempRange) {
      const minText = Number.isFinite(minVal) ? `${Math.round(minVal)}°` : "--°";
      const maxText = Number.isFinite(maxVal) ? `${Math.round(maxVal)}°` : "--°";
      tempRange.textContent = `${minText} / ${maxText}`;
    }

    const rainAmount = document.getElementById("tcRainAmount");
    if (rainAmount) rainAmount.textContent = Number.isFinite(row.precipitation) ? `${fmt(row.precipitation, 1)}mm` : "--mm";
    const rainProb = document.getElementById("tcRainProb");
    if (rainProb) rainProb.textContent = Number.isFinite(row.precipitation_probability) ? `${Math.round(row.precipitation_probability)}%` : "--%";
  }

  function renderSelectedHourData() {
    const row = getActiveHourRow();
    if (!row) return;

    const v12 = row.v12;
    const isSafetyBlock = v12?.safety === "BLOCK";
    const isSafetyUnknown = v12?.safety === "UNKNOWN";

    // 1. Hero Score Card Update
    let currentScore = null;
    let statusText = "보통";
    let chipText = "적정";
    let chipClass = "chip-normal";
    let captionText = "시간대별 바다 컨디션을 확인하세요.";

    if (isSafetyBlock) {
      const blockReason = v12?.safetyReasons?.[0] || "해상특보 발효 중";
      statusText = "입수 금지";
      chipText = "위험";
      chipClass = "chip-block";
      captionText = `⚠️ 안전을 위해 입수가 제한됩니다 (${blockReason})`;
    } else if (isSafetyUnknown) {
      statusText = "확인 필요";
      chipText = "주의";
      chipClass = "chip-caution";
      captionText = "기상/해양 특보 상태를 사전에 확인하세요.";
    } else {
      const raw = v12?.conditionScore != null ? v12.conditionScore : (Number.isFinite(row.score) ? row.score : null);
      currentScore = raw != null ? Math.round(raw) : null;
      statusText = window.getSnorkyConditionStatus?.(row) || (currentScore >= 80 ? "좋음" : currentScore >= 65 ? "보통" : currentScore >= 50 ? "주의" : "나쁨");

      if (statusText === "좋음") {
        chipText = currentScore >= 85 ? "최적" : "추천";
        chipClass = "chip-good";
        captionText = "지금 입수하기 완벽한 날씨와 파도 상태입니다.";
      } else if (statusText === "보통") {
        chipText = "적정";
        chipClass = "chip-normal";
        captionText = "무난하게 스노클링을 즐길 수 있는 바다 컨디션입니다.";
      } else if (statusText === "주의") {
        chipText = "주의";
        chipClass = "chip-caution";
        captionText = "바람이나 파도가 다소 있어 안전 장비를 꼭 착용하세요.";
      } else {
        chipText = "비추천";
        chipClass = "chip-bad";
        captionText = "파도 또는 기상 여건이 불안정하여 주의가 필요합니다.";
      }

      if (v12?.visualCondition?.lightState === "NIGHT" && v12?.recommendation === "야간 비추천") {
        chipText = v12.recommendation;
        chipClass = "chip-bad";
        captionText = "밤 시간대로 수중시야 확보가 어렵습니다. 야간 입수는 권장하지 않습니다.";
      }
    }

    const heroStatusText = document.getElementById("tcHeroStatusText");
    if (heroStatusText) heroStatusText.textContent = statusText;

    const heroChip = document.getElementById("tcHeroStatusChip");
    const heroChipText = document.getElementById("tcHeroStatusChipText");
    if (heroChip && heroChipText) {
      heroChip.className = `tc-hero-status-chip ${chipClass}`;
      heroChipText.textContent = chipText;
    }

    const heroCaption = document.getElementById("tcHeroCaption");
    if (heroCaption) heroCaption.textContent = captionText;

    // Gauge
    const scoreVal = document.getElementById("tcHeroScoreVal");
    const scoreUnit = document.getElementById("tcHeroScoreUnit");
    const gaugeProgress = document.getElementById("tcHeroGaugeProgress");
    
    if (scoreVal) {
      scoreVal.textContent = currentScore != null ? currentScore : "--";
    }
    if (scoreUnit) {
      scoreUnit.textContent = currentScore != null ? "점" : "";
    }
    if (gaugeProgress) {
      const maxDash = 264;
      const scoreNum = currentScore != null ? Math.max(0, Math.min(100, currentScore)) : 0;
      const offset = maxDash - (maxDash * scoreNum / 100);
      gaugeProgress.style.strokeDashoffset = String(offset);
      gaugeProgress.style.stroke = isSafetyBlock ? "#f87171" : scoreNum >= 80 ? "#a7f3d0" : scoreNum >= 65 ? "#93c5fd" : scoreNum >= 50 ? "#fde68a" : "#fca5a5";
    }

    // 3. Detailed Metrics Reference Time
    const refTime = document.getElementById("tcMetricsRefTime");
    if (refTime) {
      refTime.textContent = formatMetricsReferenceTime(row);
    }

    // 4. 3x3 Square Detailed Metrics Grid
    renderSquareMetrics(row);

    // 5. Safety Section Update
    renderSafetySection(row);

    // 6. Footer Update
    const footerTime = document.getElementById("tcFooterTime");
    if (footerTime) {
      const datePart = String(todayDayData?.date || "").slice(5).replace("-", ".");
      footerTime.textContent = `업데이트: ${datePart} ${String(row.hour).padStart(2, "0")}:00`;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3x3 Square Detailed Metrics Grid Rendering
  // ─────────────────────────────────────────────────────────────
  function renderSquareMetrics(row) {
    const grid = document.getElementById("tcMetricsGrid");
    if (!grid) return;

    const v12 = row.v12;

    // Evaluations
    const componentGrade = score => Number.isFinite(score)
      ? (window.getSnorkyConditionStatus?.(score) || "데이터 없음")
      : "데이터 없음";
    const waveGrade = componentGrade(v12?.metrics?.waveScore);
    const windGrade = componentGrade(v12?.metrics?.windScore);
    const currentGrade = componentGrade(v12?.metrics?.currentScore);
    const periodImpact = v12?.wavePeriodAdjustment?.periodImpact;
    const periodGrade = !Number.isFinite(row.wave_period)
      ? "데이터 없음"
      : periodImpact === "MAXIMUM"
      ? "주의"
      : periodImpact === "APPLIED"
      ? "영향 있음"
      : periodImpact === "NONE"
      ? "영향 없음"
      : "데이터 없음";
    const rainGrade = !Number.isFinite(row.precipitation)
      ? "데이터 없음"
      : row.precipitation === 0
      ? "좋음"
      : v12?.visualCondition?.weatherState === "RAIN"
      ? "주의"
      : "참고";
    const temperatureGrade = !Number.isFinite(row.sea_temperature)
      ? "수온 정보 확인 필요"
      : v12?.temperatureActivity?.label || "수온 정보 확인 필요";

    const directionGrade = componentGrade(v12?.windAdjustment?.finalWindScore);

    // Underwater visibility (SNORKY estimate)
    const hasFinalVisual = Number.isFinite(v12?.finalVisualVisibilityScore);
    const visScore = hasFinalVisual ? v12.finalVisualVisibilityScore : (v12?.visibilityScore ?? row.underwater_visibility_score);
    const visGrade = hasFinalVisual ? v12.finalVisualVisibilityGrade : (v12?.visibilityGrade ?? row.underwater_visibility_label ?? (visScore >= 80 ? "좋음" : visScore >= 65 ? "보통" : "주의"));
    const visValue = hasFinalVisual
      ? Math.round(v12.finalVisualVisibilityScore)
      : (v12?.visibilityGrade && v12.visibilityGrade !== "UNKNOWN")
      ? v12.visibilityGrade
      : (row.underwater_visibility_range || (Number.isFinite(visScore) ? (visScore >= 80 ? "5~8m" : visScore >= 60 ? "3~5m" : "1~3m") : "--"));

    // Wind direction text
    const windDirText = row.wind_direction || (Number.isFinite(row.wind_direction_degree) ? `${Math.round(row.wind_direction_degree)}°` : "--");

    // KMA SKY state first; retain existing cloud-cover fallback separately.
    const skyCode = Number(row.sky_code);
    const skyLabel = skyCode === 1 ? "맑음" : skyCode === 3 ? "구름많음" : skyCode === 4 ? "흐림" : null;
    const visualWeatherLabel = ({
      CLEAR: "맑음",
      MOSTLY_CLOUDY: "구름많음",
      OVERCAST: "흐림",
    })[v12?.visualCondition?.weatherState];
    const cloudGrade = visualWeatherLabel || skyLabel || (Number.isFinite(row.cloud_cover)
      ? (row.cloud_cover >= 80 ? "흐림" : row.cloud_cover >= 40 ? "구름많음" : "맑음")
      : "데이터 없음");

    // Metrics array (exact 9 key indicators from SNORKY real data)
    const metrics = [
      {
        id: "wave",
        title: "유의파고",
        icon: "water",
        circleClass: "circle-wave",
        value: Number.isFinite(row.wave_height) ? fmt(row.wave_height, 1) : "--",
        unit: "m",
        grade: waveGrade
      },
      {
        id: "wind",
        title: "풍속(해상)",
        icon: "air",
        circleClass: "circle-wind",
        value: Number.isFinite(row.wind_speed) ? fmt(row.wind_speed, 1) : "--",
        unit: "m/s",
        grade: windGrade
      },
      {
        id: "period",
        title: "파주기",
        icon: "tsunami",
        circleClass: "circle-period",
        value: Number.isFinite(row.wave_period) ? fmt(row.wave_period, 1) : "--",
        unit: "초",
        grade: periodGrade
      },
      {
        id: "temp",
        title: "수온",
        icon: "device_thermostat",
        circleClass: "circle-temp",
        value: Number.isFinite(row.sea_temperature) ? fmt(row.sea_temperature, 1) : "--",
        unit: "°C",
        grade: temperatureGrade
      },
      {
        id: "rain",
        title: "강수량",
        icon: "water_drop",
        circleClass: "circle-rain",
        value: Number.isFinite(row.precipitation) ? fmt(row.precipitation, 1) : "--",
        unit: Number.isFinite(row.precipitation) ? "mm" : "",
        grade: rainGrade
      },
      {
        id: "cloud",
        title: "구름량",
        icon: "cloud",
        circleClass: "circle-cloud",
        value: skyLabel || (Number.isFinite(row.cloud_cover) ? Math.round(row.cloud_cover) : "--"),
        unit: !skyLabel && Number.isFinite(row.cloud_cover) ? "%" : "",
        grade: cloudGrade
      },
      {
        id: "current",
        title: "조류/유속",
        icon: "swap_calls",
        circleClass: "circle-current",
        value: Number.isFinite(row.current_speed) ? fmt(row.current_speed, 2) : "--",
        unit: Number.isFinite(row.current_speed) ? "m/s" : "",
        grade: currentGrade
      },
      {
        id: "direction",
        title: "풍향(해상)",
        icon: "explore",
        circleClass: "circle-direction",
        value: windDirText,
        unit: "",
        grade: directionGrade
      },
      {
        id: "visibility",
        title: "예상 수중시야",
        icon: "visibility",
        circleClass: "circle-vis",
        value: visValue,
        unit: "",
        grade: visGrade,
        isVisibility: true
      }
    ];

    grid.innerHTML = metrics.map(m => {
      const theme = getMetricGradeTheme(m.grade);
      return `
        <div class="tc-metric-card" data-metric-id="${m.id}">
          ${m.isVisibility ? `<button class="tc-metric-info-btn" type="button" data-info-metric="${m.id}" aria-label="${m.title} 정보 확인">
            <span class="material-symbols-outlined">info</span>
          </button>` : ""}
          <div class="tc-metric-icon-circle ${m.circleClass}">
            <span class="material-symbols-outlined">${m.icon}</span>
          </div>
          <span class="tc-metric-title">${m.title}</span>
          <div class="tc-metric-value-wrap">
            <span>${escapeHtml(m.value)}</span>${m.unit ? `<i class="tc-metric-unit">${m.unit}</i>` : ""}
          </div>
          <div class="tc-metric-pill ${theme.pillClass}">
            <span>${escapeHtml(theme.text)}</span>
          </div>
        </div>
      `;
    }).join("");

    // Bind info button clicks on each metric card
    grid.querySelectorAll("[data-info-metric]").forEach(btn => {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        const metricId = this.dataset.infoMetric;
        if (metricId === "visibility") {
          openVisibilitySheet();
        } else {
          openSourceSheet(metricId);
        }
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Safety Section Rendering (Omit box if no active warning)
  // ─────────────────────────────────────────────────────────────
  function renderSafetySection(row) {
    const section = document.getElementById("tcSafetySection");
    const banner = document.getElementById("tcSafetyBanner");
    const bannerText = document.getElementById("tcSafetyBannerText");
    if (!section || !banner || !bannerText) return;

    const safety = window.SNORKYMarineSafety?.getPointMarineSafety?.(activePoint);
    const warning = safety?.warning;

    if (safety?.status === "BLOCK") {
      section.hidden = false;
      banner.className = "tc-safety-banner banner-warning";
      banner.innerHTML = `
        <span class="material-symbols-outlined">warning</span>
        <span>⚠️ ${safety.areaName || warning?.areaName || "해당 해역"} ${warning?.warningName || "해상"}${warning?.levelName || "특보"} 발효 중 (${warning?.tmEf || "실시간"})</span>
      `;
    } else if (safety?.status === "UNKNOWN") {
      section.hidden = false;
      banner.className = "tc-safety-banner banner-warning";
      banner.innerHTML = `
        <span class="material-symbols-outlined">info</span>
        <span>해상특보 정보를 확인할 수 없습니다. 현장 안내를 확인해 주세요.</span>
      `;
    } else {
      section.hidden = true;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Bottom Sheet: 예상 수중시야 더보기 (Underwater Visibility Details)
  // ─────────────────────────────────────────────────────────────
  function openVisibilitySheet() {
    const row = getActiveHourRow();
    if (!row) return;

    const v12 = row.v12;
    const hasFinalVisual = Number.isFinite(v12?.finalVisualVisibilityScore);
    const baseScore = v12?.baseVisibilityScore ?? v12?.visibilityScore ?? row.underwater_visibility_score ?? null;
    const baseGrade = v12?.baseVisibilityGrade ?? v12?.visibilityGrade ?? row.underwater_visibility_label ?? "UNKNOWN";
    const baseExplanation = v12?.baseVisibilityExplanation ?? v12?.visibilityExplanation ?? "Base Visibility 계산 결과를 확인할 수 없습니다.";
    const visual = v12?.visualCondition ?? null;
    const visScore = hasFinalVisual ? v12.finalVisualVisibilityScore : baseScore;
    const visGrade = hasFinalVisual ? v12.finalVisualVisibilityGrade : baseGrade;
    const visExplanation = hasFinalVisual
      ? v12.finalVisualVisibilityExplanation
      : "V1.3 시각조건 결과가 없어 기존 예상 수중시야 값을 표시합니다.";
    const lightLabel = getVisualLightLabel(visual?.lightState);
    const weatherLabel = getVisualWeatherLabel(visual?.weatherState);
    const penaltyLabel = visual?.lightState === "NIGHT"
      ? "자연광 부족 · Final 0점 적용"
      : Number.isFinite(visual?.penalty) ? `${visual.penalty}점` : "확인 불가";

    const titleIcon = document.getElementById("tcSheetIcon");
    const titleText = document.getElementById("tcSheetTitleText");
    const body = document.getElementById("tcSheetBody");

    if (titleIcon) titleIcon.textContent = "visibility";
    if (titleText) titleText.textContent = `예상 수중시야 상세 (${String(row.hour).padStart(2, "0")}시)`;

    if (body) {
      body.innerHTML = `
        <div class="tc-sheet-score-card">
          <div>
            <div class="tc-sheet-score-val">${escapeHtml(visGrade)}</div>
            <div class="tc-sheet-score-label">최종 예상 수중시야 · ${Number.isFinite(visScore) ? `${Math.round(visScore)}점` : "--"}</div>
          </div>
          <span class="material-symbols-outlined" style="font-size:36px;color:#059669;">scuba_diving</span>
        </div>

        <div class="tc-sheet-factors">
          <strong style="font-size:13px;color:#1e293b;margin-bottom:4px;">A. 물 상태 / Base Visibility</strong>
          <div class="tc-sheet-factor-item">
            <span class="tc-sheet-factor-title">Base 점수</span>
            <span class="tc-sheet-factor-val">${Number.isFinite(baseScore) ? `${Math.round(baseScore)}점` : "--"}</span>
          </div>
          <div class="tc-sheet-factor-item">
            <span class="tc-sheet-factor-title">Base 등급</span>
            <span class="tc-sheet-factor-val">${escapeHtml(baseGrade)}</span>
          </div>
          <div class="tc-sheet-factor-item">
            <span class="tc-sheet-factor-title">Base 설명</span>
            <span class="tc-sheet-factor-val">${escapeHtml(baseExplanation)}</span>
          </div>
        </div>

        <div class="tc-sheet-factors">
          <strong style="font-size:13px;color:#1e293b;margin-bottom:4px;">B. 시각 조건</strong>
          <div class="tc-sheet-factor-item">
            <span class="tc-sheet-factor-title">자연광 상태</span>
            <span class="tc-sheet-factor-val">${escapeHtml(lightLabel)}</span>
          </div>
          <div class="tc-sheet-factor-item">
            <span class="tc-sheet-factor-title">기상 상태</span>
            <span class="tc-sheet-factor-val">${escapeHtml(weatherLabel)}</span>
          </div>
          <div class="tc-sheet-factor-item">
            <span class="tc-sheet-factor-title">시각조건 적용</span>
            <span class="tc-sheet-factor-val">${escapeHtml(penaltyLabel)}</span>
          </div>
        </div>

        <div class="tc-sheet-desc-box">
          💡 <b>C. 최종 예상 수중시야</b>: ${Number.isFinite(visScore) ? `${Math.round(visScore)}점 · ` : ""}${escapeHtml(visGrade)}<br>
          ${escapeHtml(visExplanation)}
        </div>
      `;
    }

    document.getElementById("tcBottomSheetOverlay")?.classList.add("open");
  }

  // ─────────────────────────────────────────────────────────────
  // Bottom Sheet: 바다수치 / 데이터 출처 더보기 (Data Attribution Details)
  // ─────────────────────────────────────────────────────────────
  function openSourceSheet(metricId = null) {
    const row = getActiveHourRow();
    const titleIcon = document.getElementById("tcSheetIcon");
    const titleText = document.getElementById("tcSheetTitleText");
    const body = document.getElementById("tcSheetBody");

    if (titleIcon) titleIcon.textContent = "info";
    if (titleText) titleText.textContent = "데이터 출처 및 기준 정보";

    const lastUpdated = new Date().toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const pointName = activePoint?.name || (Array.isArray(activePoint) ? activePoint[0] : "선택된 포인트");
    const hourStr = row ? `${String(row.hour).padStart(2, "0")}:00` : "--:--";

    if (body) {
      body.innerHTML = `
        <div class="tc-sheet-factors" style="background:#ffffff;">
          <strong style="font-size:13.5px;color:#003e7a;margin-bottom:6px;">📍 ${escapeHtml(pointName)} 예보 데이터 정보</strong>
          <div class="tc-sheet-factor-item">
            <span class="tc-sheet-factor-title">🏛️ 기상청(KMA) 단기예보</span>
            <span class="tc-sheet-factor-val">풍속 · 풍향 · 강수량 · 강수확률</span>
          </div>
          <div class="tc-sheet-factor-item">
            <span class="tc-sheet-factor-title">🌊 Open-Meteo Marine</span>
            <span class="tc-sheet-factor-val">유의파고 · 파주기 · 수온 · 너울 · 조류/유속</span>
          </div>
          <div class="tc-sheet-factor-item">
            <span class="tc-sheet-factor-title">⏱️ 선택 예보 시각</span>
            <span class="tc-sheet-factor-val">${getKoreanDateText(todayDayData?.date)} ${hourStr}</span>
          </div>
          <div class="tc-sheet-factor-item">
            <span class="tc-sheet-factor-title">🔄 SNORKY 최종 동기화</span>
            <span class="tc-sheet-factor-val">${lastUpdated}</span>
          </div>
        </div>

        <div class="tc-sheet-desc-box">
          ℹ️ <b>안내사항</b>: 본 서비스의 해양 및 기상 수치는 기상청과 공공 해양 수치예보 모델을 기반으로 계산된 실시간 예측 데이터입니다. 국지적인 지형 및 조류에 따라 현장 상황이 다를 수 있으므로 입수 전 반드시 안전 수칙과 현장 표지를 확인하시기 바랍니다.
        </div>
      `;
    }

    document.getElementById("tcBottomSheetOverlay")?.classList.add("open");
  }

  function closeBottomSheet() {
    document.getElementById("tcBottomSheetOverlay")?.classList.remove("open");
  }

  // ─────────────────────────────────────────────────────────────
  // Public Export
  // ─────────────────────────────────────────────────────────────
  window.SNORKYTodayConditionDetail = Object.freeze({
    open,
    close,
    isOpen,
    syncData,
    onDataReady,
    openVisibilitySheet,
    openSourceSheet
  });

})();
