/**
 * SNORKY 3.0: Square Detailed Metrics Layout — Today Condition Detail Screen
 * Based on Stitch Screen: ba56b0b73c30424d854c98344df067ed
 * Project: projects/5550177983917219663
 */
(function () {
  "use strict";

  let modalEl = null;
  let activePoint = null;
  let todayTopRow = null;
  let todayRows = [];
  let selectedHour = null;
  let currentHour = null;
  let todayDayData = null;
  let marineData = null;
  let kmaData = null;
  let historyActive = false;
  let analysisTransition = null;

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
    const ptyCode = Number(row?.precipitation_type ?? row?.precipitation_type_code ?? row?.pty ?? 0);
    const skyCode = Number(row?.sky_code);
    const precip = row?.precipitation;

    if (ptyCode === 1) return { icon: "rainy", label: "비", color: "#60a5fa" };
    if (ptyCode === 2) return { icon: "weather_mix", label: "비/눈", color: "#60a5fa" };
    if (ptyCode === 3) return { icon: "ac_unit", label: "눈", color: "#60a5fa" };
    if (ptyCode === 4) return { icon: "thunderstorm", label: "소나기", color: "#60a5fa" };
    if (ptyCode === 5) return { icon: "rainy", label: "빗방울", color: "#60a5fa" };
    if (ptyCode === 6) return { icon: "weather_mix", label: "빗방울/눈날림", color: "#60a5fa" };
    if (ptyCode === 7) return { icon: "ac_unit", label: "눈날림", color: "#60a5fa" };
    if (ptyCode > 0 || (Number.isFinite(precip) && precip > 0.5)) return { icon: "rainy", label: "비", color: "#60a5fa" };

    if (skyCode === 4) return { icon: "cloud", label: "흐림", color: "#94a3b8" };
    if (skyCode === 3) return { icon: "partly_cloudy_day", label: "구름많음", color: "#38bdf8" };
    if (skyCode === 1) return { icon: "sunny", label: "맑음", color: "#f59e0b" };

    const clouds = row?.cloud_cover;
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
    if (text === "참고") return { pillClass: "pill-neutral", text: "참고" };
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
  // KHOA 26 Tide Observation Stations Lookup
  // ─────────────────────────────────────────────────────────────
  const KHOA_TIDE_STATIONS = [
    { code: "DT_0006", name: "묵호", lat: 37.55027, lng: 129.11638 },
    { code: "DT_0012", name: "속초", lat: 38.20722, lng: 128.59416 },
    { code: "DT_0013", name: "후포", lat: 36.67805, lng: 129.45722 },
    { code: "DT_0007", name: "포항", lat: 36.05055, lng: 129.38555 },
    { code: "DT_0026", name: "울산", lat: 35.50055, lng: 129.38555 },
    { code: "DT_0008", name: "부산", lat: 35.09611, lng: 129.03666 },
    { code: "DT_0010", name: "통영", lat: 34.82777, lng: 128.43444 },
    { code: "DT_0009", name: "여수", lat: 34.74722, lng: 127.76638 },
    { code: "DT_0023", name: "완도", lat: 34.31611, lng: 126.75888 },
    { code: "DT_0004", name: "목포", lat: 34.77888, lng: 126.37611 },
    { code: "DT_0003", name: "군산", lat: 35.97583, lng: 126.55000 },
    { code: "DT_0016", name: "보령", lat: 36.40694, lng: 126.49527 },
    { code: "DT_0015", name: "안흥", lat: 36.67444, lng: 126.13055 },
    { code: "DT_0002", name: "평택", lat: 36.96388, lng: 126.82083 },
    { code: "DT_0001", name: "인천", lat: 37.45194, lng: 126.59222 },
    { code: "DT_0005", name: "제주", lat: 33.52750, lng: 126.54305 },
    { code: "DT_0011", name: "서귀포", lat: 33.24055, lng: 126.56166 },
    { code: "DT_0021", name: "성산포", lat: 33.47361, lng: 126.92777 },
    { code: "DT_0022", name: "모슬포", lat: 33.21388, lng: 126.25055 },
    { code: "DT_0014", name: "울릉도", lat: 37.52555, lng: 130.86000 }
  ];

  function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  function getNearestTideStation(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { code: "DT_0006", name: "묵호", distKm: "42.7" };
    }
    let nearest = KHOA_TIDE_STATIONS[0];
    let minDist = Infinity;
    for (const st of KHOA_TIDE_STATIONS) {
      const d = getDistanceKm(lat, lng, st.lat, st.lng);
      if (d < minDist) {
        minDist = d;
        nearest = st;
      }
    }
    return { ...nearest, distKm: (Math.round(minDist * 10) / 10).toFixed(1) };
  }

  function getTideEvents() {
    if (Array.isArray(todayDayData?.tideEvents) && todayDayData.tideEvents.length > 0) {
      return todayDayData.tideEvents;
    }
    if (Array.isArray(marineData?.tideEvents) && marineData.tideEvents.length > 0) {
      return marineData.tideEvents;
    }
    return [
      { type: "high", minutes: 3 * 60 + 25, time: "03:25", level: 27 },
      { type: "low", minutes: 6 * 60 + 42, time: "06:42", level: 26 },
      { type: "high", minutes: 12 * 60 + 37, time: "12:37", level: 34 },
      { type: "low", minutes: 20 * 60 + 23, time: "20:23", level: 12 },
    ];
  }

  function renderTideGraphToSvg(svg, isModal = false) {
    if (!svg) return;

    try {
      const tideEvents = getTideEvents();
      if (!tideEvents || !tideEvents.length) {
        svg.innerHTML = `
          <text x="${isModal ? 170 : 180}" y="${isModal ? 90 : 50}"
                font-size="${isModal ? 14 : 11.5}" font-weight="600" fill="#94a3b8"
                text-anchor="middle">조석 데이터 없음</text>`;
        return;
      }

      const chart = isModal
        ? { left: 16, right: 324, top: 40, bottom: 122, labelY: 158 }
        : { left: 14, right: 346, top: 18, bottom: 74,  labelY: 90 };

      const minLevel = Math.min(...tideEvents.map(e => e.level));
      const maxLevel = Math.max(...tideEvents.map(e => e.level));
      const levelRange = Math.max(1, maxLevel - minLevel);
      const gradId = isModal ? "tcTideModalAreaFill" : "tcTideAreaFill";

      const chartEvents = tideEvents.map(event => {
        const levelRatio = (event.level - minLevel) / levelRange;
        const x = chart.left + (event.minutes / 1440) * (chart.right - chart.left);
        const isHigh = event.type === "high";
        const y = isHigh
          ? chart.top + (isModal ? 20 : 14) - levelRatio * (isModal ? 18 : 9)
          : chart.bottom - (isModal ? 12 : 8) - levelRatio * (isModal ? 18 : 10);
        return { ...event, x, y };
      });

      const start = {
        type: "boundary",
        minutes: 0,
        x: chart.left,
        y: Math.min(chart.bottom - (isModal ? 6 : 5), chartEvents[0].y + (isModal ? 20 : 16)),
      };
      const end = {
        type: "boundary",
        minutes: 1440,
        x: chart.right,
        y: Math.max(chart.top + (isModal ? 10 : 7), chartEvents[chartEvents.length - 1].y - (isModal ? 16 : 14)),
      };
      const pts = [start, ...chartEvents, end];

      // KST 현재 시각 위치 계산
      const now = new Date();
      const kstMinutes = (now.getUTCHours() + 9) % 24 * 60 + now.getUTCMinutes();
      let left = pts[0];
      let right = pts[1];
      for (let index = 0; index < pts.length - 1; index += 1) {
        if (kstMinutes >= pts[index].minutes && kstMinutes <= pts[index + 1].minutes) {
          left = pts[index];
          right = pts[index + 1];
          break;
        }
      }

      const span = Math.max(1, right.minutes - left.minutes);
      const ratio = Math.max(0, Math.min(1, (kstMinutes - left.minutes) / span));
      const curveRatio = ratio * ratio * (3 - 2 * ratio);
      const markerX = left.x + (right.x - left.x) * ratio;
      const markerY = left.y + (right.y - left.y) * curveRatio;
      const hasLevelBounds = Number.isFinite(left.level) && Number.isFinite(right.level);
      const currentLevel = hasLevelBounds ? Math.round(left.level + (right.level - left.level) * ratio) : null;
      const currentTime = `${String(Math.floor(kstMinutes / 60)).padStart(2, "0")}:${String(kstMinutes % 60).padStart(2, "0")}`;
      const currentAria = currentLevel == null
        ? `현재 ${currentTime}`
        : `현재 ${currentTime}, ${currentLevel}cm`;

      const currentLabelX = Math.max(isModal ? 58 : 43, Math.min(chart.right - (isModal ? 58 : 43), markerX));
      const currentMarkerR = isModal ? "6.5" : "3.8";
      const currentTextY = isModal ? "18" : "11";
      const currentFontSize = isModal ? "14" : "8.5";
      const lineStrokeWidth = isModal ? 3.2 : 2;

      const curvePath = pts.reduce((path, point, index) => {
        if (index === 0) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
        const prev = pts[index - 1];
        const dist = point.x - prev.x;
        return `${path} C ${(prev.x + dist * 0.45).toFixed(1)} ${prev.y.toFixed(1)}, ${(point.x - dist * 0.45).toFixed(1)} ${point.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
      }, "");
      const areaPath = `${curvePath} L ${chart.right} ${chart.bottom} L ${chart.left} ${chart.bottom} Z`;

      const fs = isModal ? 13.5 : 8.5;
      const timeGrid = Array.from({ length: 12 }, (_, i) => {
        const hour = i * 2;
        const x = chart.left + (hour / 24) * (chart.right - chart.left);
        return `<g><line x1="${x.toFixed(1)}" y1="${chart.top}" x2="${x.toFixed(1)}" y2="${chart.bottom}" stroke-width="${isModal ? 1.2 : 0.75}"/><text x="${x.toFixed(1)}" y="${chart.labelY}" font-size="${fs}" font-weight="600" fill="#64748b" text-anchor="middle">${hour}시</text></g>`;
      }).join("");

      const eventLabels = chartEvents.map(event => {
        const isHigh = event.type === "high";
        const nameY  = isHigh ? event.y - (isModal ? 20 : 12) : event.y + (isModal ? 18 : 11);
        const valueY = nameY + (isModal ? 15 : 9);
        const label  = isHigh ? "만조" : "간조";
        const color  = isHigh ? "#e11d48" : "#0284c7";
        const cr     = isModal ? 6.5 : 3.8;
        const nsz    = isModal ? 14 : 8.5;
        const vsz    = isModal ? 16 : 8.5;
        return `
          <g class="tc-tide-event tc-tide-event-${event.type}">
            <circle cx="${event.x.toFixed(1)}" cy="${event.y.toFixed(1)}" r="${cr}" stroke-width="${isModal ? 2.5 : 1.8}"/>
            <text x="${event.x.toFixed(1)}" y="${nameY.toFixed(1)}" font-size="${nsz}" font-weight="700" fill="${color}" text-anchor="middle" paint-order="stroke" stroke="#ffffff" stroke-width="${isModal ? 3.5 : 2.5}" stroke-linejoin="round">${label} ${event.time}</text>
            <text x="${event.x.toFixed(1)}" y="${valueY.toFixed(1)}" font-size="${vsz}" font-weight="${isModal ? 900 : 800}" fill="#0f172a" text-anchor="middle" paint-order="stroke" stroke="#ffffff" stroke-width="${isModal ? 3.5 : 2.5}" stroke-linejoin="round">${event.level}cm</text>
          </g>`;
      }).join("");

      svg.innerHTML = `
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0d9488" stop-opacity="${isModal ? 0.22 : 0.18}"/>
            <stop offset="100%" stop-color="#0d9488" stop-opacity="0.01"/>
          </linearGradient>
        </defs>
        <g class="tc-tide-grid">${timeGrid}</g>
        <path class="tc-tide-area" fill="url(#${gradId})" d="${areaPath}"/>
        <path class="tc-tide-line" stroke-width="${lineStrokeWidth}" d="${curvePath}"/>
        ${eventLabels}
        <g class="tc-tide-current" aria-label="${currentAria}">
          <line x1="${markerX.toFixed(1)}" y1="${chart.top}" x2="${markerX.toFixed(1)}" y2="${chart.bottom}" stroke-width="${isModal ? '1.5' : '1'}" stroke-dasharray="${isModal ? '3 3' : '2 2'}"/>
          <circle cx="${markerX.toFixed(1)}" cy="${markerY.toFixed(1)}" r="${currentMarkerR}" stroke-width="${isModal ? '2' : '1.5'}"/>
          <text x="${currentLabelX.toFixed(1)}" y="${currentTextY}" font-size="${currentFontSize}" font-weight="900" text-anchor="middle">현재 ${currentTime}</text>
        </g>`;
    } catch (err) {
      console.warn("[SNORKY Today Detail] renderTideGraphToSvg error:", err);
      try {
        svg.innerHTML = `
          <text x="${isModal ? 170 : 180}" y="${isModal ? 90 : 50}"
                font-size="${isModal ? 14 : 11.5}" font-weight="600" fill="#94a3b8"
                text-anchor="middle">조석 데이터 없음</text>`;
      } catch (_) {}
    }
  }

  function renderTideSection() {
    try {
      const svg = document.querySelector("#tcTideCard .tc-tide-graph svg, #tcTideSection .tc-tide-graph svg, .tc-tide-graph svg");
      if (svg) {
        renderTideGraphToSvg(svg, false);
      }
    } catch (err) {
      console.warn("[SNORKY Today Detail] renderTideSection error:", err);
    }
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
        <header class="tc-top-app-bar snorky-detail-header">
          <button id="tcBackBtn" class="tc-icon-btn" type="button" aria-label="뒤로가기">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 id="tcPointTitle" class="tc-app-title">포인트 컨디션</h1>
          <div class="tc-top-app-bar-spacer" aria-hidden="true"></div>
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
                  <span id="tcWeatherLiveBadge" class="tc-weather-live-badge" title="KMA 예보 기반">예보 기반</span>
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
          </section>

          <!-- 4. Square Detailed Metrics Grid (3x3 Integrated Layout) -->
          <section class="tc-metrics-section">
            <div class="tc-metrics-header">
              <h3>바다 수치</h3>
              <div id="tcMetricsRefBadge" class="tc-metrics-ref-badge" role="button" tabindex="0">
                <span id="tcMetricsRefTime">기상 데이터 출처 및 기준시각</span>
                <span class="material-symbols-outlined">info</span>
              </div>
            </div>
            <div id="tcMetricsGrid" class="tc-metrics-grid">
              <!-- 8 Metric Cards (6 standard + 1 visibility + 1 tide graph) -->
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
    document.getElementById("tcTideMoreBtn")?.addEventListener("click", openTideSheet);
    document.getElementById("tcMetricsRefBadge")?.addEventListener("click", () => openSourceSheet());
    document.getElementById("tcFooterCard")?.addEventListener("click", () => openSourceSheet());
    document.getElementById("tcSheetCloseBtn")?.addEventListener("click", closeBottomSheet);

    document.getElementById("tcBottomSheetOverlay")?.addEventListener("click", function (e) {
      if (e.target === this) closeBottomSheet();
    });

    modalEl.addEventListener("click", function (e) {
      if (e.target === modalEl) close(true);
    });

    document.addEventListener("snorky:favorites-updated", () => {
      if (isOpen && activePoint) {
        updateFavoriteState();
      }
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
      const initial = window.SNORKYEvaluationResults?.selectCurrentTodayHourlySlot?.(slots, now)
        || (!latestPast ? nearestFuture : !nearestFuture ? latestPast
        : nowHour - latestPast.hour <= nearestFuture.hour - nowHour ? latestPast : nearestFuture);
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

  function mapResultRowToScrubberRow(row) {
    const pStart = row.period_start || row.forecast_time;
    let hour = 12;
    if (pStart) {
      const pStr = String(pStart);
      if (pStr.includes("+09:00")) {
        const m = pStr.match(/T(\d{2}):/);
        hour = m ? Number(m[1]) : 12;
      } else {
        const dt = new Date(pStr);
        if (!isNaN(dt.getTime())) {
          const kst = new Date(dt.getTime() + 9 * 3600000);
          hour = kst.getUTCHours();
        }
      }
    }
    const m = row.metrics || {};

    const waveHeight = row.wave_height ?? m.wave_height ?? null;
    const wavePeriod = row.wave_period ?? m.wave_period ?? null;
    const currentSpeed = row.current_speed ?? m.current_speed ?? null;
    const seaTemp = row.sea_temperature ?? m.sea_temperature ?? null;
    const windSpeed = row.wind_speed ?? m.wind_speed ?? null;
    const windDir = row.wind_direction ?? m.wind_direction ?? null;
    const windDirDeg = row.wind_direction_degree ?? m.wind_direction_degree ?? null;
    const precip = row.precipitation ?? m.precipitation ?? null;
    const precipProb = row.precipitation_probability ?? m.precipitation_probability ?? null;
    const temp = row.temperature ?? m.temperature ?? null;
    const skyCode = row.sky_code ?? m.sky_code ?? null;
    const precipType = row.precipitation_type ?? m.precipitation_type ?? null;
    const cloudCover = row.cloud_cover ?? m.cloud_cover ?? null;
    const visScore = row.visibility_score ?? m.visibility_score ?? null;
    const visGrade = row.visibility_grade ?? m.visibility_grade ?? null;

    const weatherState = (precipType === 1 || precipType === 4 || (precip && precip > 0.5)) ? "RAIN"
      : (skyCode === "4" || skyCode === 4) ? "OVERCAST"
      : (skyCode === "3" || skyCode === 3) ? "MOSTLY_CLOUDY"
      : "CLEAR";

    const baseVisScore = row.base_visibility_score ?? m.base_visibility_score ?? null;
    const baseVisGrade = row.base_visibility_grade ?? m.base_visibility_grade ?? null;
    const baseVisExplanation = row.base_visibility_explanation ?? m.base_visibility_explanation ?? null;
    const visualCondition = m.visual_condition || {
      lightState: hour >= 6 && hour < 18 ? "DAY" : "NIGHT",
      weatherState: weatherState,
    };
    const visualPenalty = Number.isFinite(m.visual_condition_penalty) ? m.visual_condition_penalty : 0;

    const v12 = {
      conditionScore: row.condition_score,
      conditionStatus: row.condition_status,
      safety: row.safety_status,
      safetyReasons: row.safety_reasons || [],
      qualityStatus: row.quality_status,
      recommendation: row.recommendation,
      visibilityGrade: visGrade,
      visibilityScore: visScore,
      baseVisibilityScore: baseVisScore,
      baseVisibilityGrade: baseVisGrade,
      baseVisibilityExplanation: baseVisExplanation,
      visualConditionPenalty: visualPenalty,
      waveHeight: waveHeight,
      seaTemperature: seaTemp,
      windSpeed: windSpeed,
      metrics: {
        waveScore: m.wave_score,
        windScore: m.wind_score,
        currentScore: m.current_score,
      },
      wavePeriodAdjustment: {
        periodImpact: wavePeriod ? (wavePeriod >= 10 ? "MAXIMUM" : wavePeriod >= 7 ? "APPLIED" : "NONE") : "NONE",
      },
      temperatureActivity: {
        label: row.temperature_suitability || (seaTemp ? (seaTemp >= 24 ? "최적 수온" : seaTemp >= 20 ? "적정 수온" : "저수온 주의") : "수온 정보 확인 필요"),
      },
      windAdjustment: {
        finalWindScore: m.wind_score,
      },
      underwaterVisibility: {
        score: visScore,
        grade: visGrade,
        explanation: row.visibility_explanation || (visGrade ? `수중시야: ${visGrade}` : null),
      },
      entryPointAssessment: {
        grade: m.entry_grade || "A",
      },
      visualCondition: visualCondition
    };

    return {
      date: row.target_date,
      hour: hour,
      timestamp: pStart,
      temperature: temp,
      wind_speed: windSpeed,
      wind_direction: windDir,
      wind_direction_degree: windDirDeg,
      wave_height: waveHeight,
      wave_period: wavePeriod,
      current_speed: currentSpeed,
      sea_temperature: seaTemp,
      precipitation: precip,
      precipitation_probability: precipProb,
      precipitation_type: precipType,
      sky_code: skyCode,
      cloud_cover: cloudCover,
      visibility_grade: visGrade,
      visibility_score: visScore,
      temperature_suitability: row.temperature_suitability,
      score: row.condition_score,
      recommendation: row.recommendation,
      v12,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Open / Close Screen
  // ─────────────────────────────────────────────────────────────
  async function open(point, options = {}) {
    ensureModal();

    activePoint = point || (typeof spot !== "undefined" ? spot : null);
    if (!activePoint) return;
    selectedHour = null;
    currentHour = null;

    const currentPointId = String(activePoint.supabaseId || activePoint.id || "");

    // Hide point modal behind smoothly
    const pointModal = document.getElementById("pointModal");
    if (pointModal && pointModal.classList.contains("open")) {
      pointModal.style.visibility = "hidden";
    }

    modalEl.classList.add("open");
    document.body.style.overflow = "hidden";
    analysisTransition?.cancel();
    const entryAnalysis = window.SNORKYConditionAnalysis?.start(
      modalEl.querySelector(".today-condition-sheet")
    ) || null;
    analysisTransition = entryAnalysis;

    // History state for smooth back navigation
    if (!historyActive) {
      try {
        history.pushState({ ...history.state, snorkyTodayDetail: true }, "");
        historyActive = true;
      } catch (_) {}
    }

    renderHeader();
    renderLoadingState();

    try {
      const reader = window.SNORKYEvaluationResults;
      if (!reader?.loadTodayHourly) {
        throw new Error("Result 조회 어댑터가 없습니다.");
      }

      const [todayMap, hourlyResultRows] = await Promise.all([
        activePoint?.isCustomSpot === true
          ? Promise.resolve(new Map([[currentPointId, reader.getDryRunToday?.(currentPointId) || null]]))
          : (reader.loadTodayResults ? reader.loadTodayResults(true).catch(() => new Map()) : Promise.resolve(new Map())),
        reader.loadTodayHourly(currentPointId)
      ]);

      if (!hourlyResultRows || !hourlyResultRows.length) {
        entryAnalysis?.fail();
        renderErrorState("시간별 예보 데이터가 아직 준비되지 않았습니다.");
        return;
      }

      const rawToday = todayMap && typeof todayMap.get === "function" ? todayMap.get(currentPointId) : null;
      todayTopRow = rawToday ? mapResultRowToScrubberRow(rawToday) : null;

      const mappedRows = hourlyResultRows.map(mapResultRowToScrubberRow);
      const rendered = syncData(
        { spot: activePoint, days: [{ date: hourlyResultRows[0].target_date, rows: mappedRows }] },
        mappedRows
      );
      if (rendered) entryAnalysis?.complete();
      else entryAnalysis?.fail();
    } catch (err) {
      console.warn("[SNORKY Today Detail] loadTodayHourly error:", err);
      entryAnalysis?.fail();
      renderErrorState("시간별 예보 데이터를 불러오지 못했습니다.");
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

  // 나만의 스팟이 Safety 준비 전에 열렸다면 공식 kma-warnings 완료값으로 카드만 갱신한다.
  document.addEventListener("snorky:kma-safety-updated", function () {
    if (isOpen() && activePoint?.isCustomSpot === true && todayRows.length) {
      renderSelectedHourData();
    }
  });

  function isOpen() {
    return Boolean(modalEl && modalEl.classList.contains("open"));
  }

  function close(triggerBack = true) {
    if (!modalEl || !modalEl.classList.contains("open")) return;

    analysisTransition?.cancel();
    analysisTransition = null;
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
    if (!window.SNORKYAuthSession?.isLoggedIn?.()) {
      window.SNORKYAuthSession?.showLoginPrompt?.("즐겨찾기는 로그인 후 이용할 수 있어요.");
      return;
    }
    const btn = document.getElementById("tcFavoriteBtn");
    const isFav = window.SNORKYEngagement?.toggleFavorite?.(activePoint);
    const currentFav = typeof isFav === "boolean" ? isFav : Boolean(window.SNORKYEngagement?.isFavorite?.(activePoint));
    if (btn) {
      btn.classList.toggle("active", currentFav);
      const svg = btn.querySelector("svg");
      if (svg) svg.setAttribute("fill", currentFav ? "currentColor" : "none");
    }
    const modalFav = document.getElementById("pointFavoriteToggle");
    if (modalFav) {
      modalFav.classList.toggle("active", currentFav);
      modalFav.setAttribute("aria-pressed", String(currentFav));
      const modalSvg = modalFav.querySelector("svg");
      if (modalSvg) modalSvg.setAttribute("fill", currentFav ? "currentColor" : "none");
    }
  }

  function updateFavoriteState() {
    const btn = document.getElementById("tcFavoriteBtn");
    if (!btn || !activePoint) return;
    const isFav = Boolean(window.SNORKYEngagement?.isFavorite?.(activePoint));
    btn.classList.toggle("active", isFav);
    const svg = btn.querySelector("svg");
    if (svg) svg.setAttribute("fill", isFav ? "currentColor" : "none");
    const modalFav = document.getElementById("pointFavoriteToggle");
    if (modalFav) {
      modalFav.classList.toggle("active", isFav);
      modalFav.setAttribute("aria-pressed", String(isFav));
      const modalSvg = modalFav.querySelector("svg");
      if (modalSvg) modalSvg.setAttribute("fill", isFav ? "currentColor" : "none");
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Header Rendering
  // ─────────────────────────────────────────────────────────────
  function renderHeader() {
    const pointName = activePoint?.name || (Array.isArray(activePoint) ? activePoint[0] : "스노클링 포인트");
    const titleEl = document.getElementById("tcPointTitle");
    if (titleEl) titleEl.textContent = pointName;
    const head = titleEl?.closest(".tc-top-app-bar");
    if (head) {
      head.classList.remove("tc-title-compact", "tc-title-tight", "tc-title-overflow");
      const length = [...String(pointName)].length;
      if (length >= 16) head.classList.add("tc-title-overflow");
      else if (length >= 13) head.classList.add("tc-title-tight");
      else if (length >= 10) head.classList.add("tc-title-compact");
    }

    updateFavoriteState();

    const dateText = getKoreanDateText(todayDayData?.date);
    const dateEl = document.getElementById("tcDateText");
    if (dateEl) dateEl.textContent = dateText;
    renderTideReferenceTime();
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

    const cardsHtml = visibleRows.map(row => {
      const isSelected = row.hour === selectedHour;
      const isCurrent = row.hour === currentHour;
      const w = getHourlyCardWeatherIconInfo(row);
      const weatherIconColor = isSelected ? "#FFFFFF" : w.color;
      const weatherIconStyle = w.isStitchMapping
        ? ` style="color:${weatherIconColor};font-variation-settings:'FILL' 0, 'wght' 300;"`
        : "";
      const temp = Number.isFinite(row.temperature) ? Math.round(row.temperature) : "--";
      const rainAmount = Number.isFinite(row.precipitation)
        ? `${row.precipitation === 0 ? "0" : fmt(row.precipitation, 1)}mm`
        : "--mm";
      const rainProbability = Number.isFinite(row.precipitation_probability)
        ? `${Math.round(row.precipitation_probability)}%`
        : "--%";
      
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
        const rawScore = v12?.conditionScore != null ? v12.conditionScore : null;
        const scoreNum = Number(rawScore);
        const isAvailable = Number.isFinite(scoreNum);
        scoreText = isAvailable ? Math.round(scoreNum) : "--";
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
          <div class="tc-hour-rain" aria-label="강수예보">☔ ${rainAmount} · ${rainProbability}</div>
          <div class="tc-hour-badge ${gradeClass}">
            <span>${scoreText}</span>
            <span class="tc-hour-badge-divider"></span>
            <span>${statusText}</span>
          </div>
        </div>
      `;
    }).join("");
    host.innerHTML = cardsHtml;

    // Bind click events
    host.querySelectorAll("[data-tc-hour]").forEach(card => {
      card.addEventListener("click", function () {
        const hour = Number(this.dataset.tcHour);
        this.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
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
    return todayTopRow;
  }

  function getRepresentativeTemperatureRow() {
    const selectedRow = getActiveHourRow();
    if (selectedRow?.temperature != null) return selectedRow;

    const validRows = todayRows.filter(row => row?.temperature != null && Number.isFinite(Number(row.temperature)));
    if (!validRows.length) return null;

    const now = new Date();
    const nowHour = now.getHours() + now.getMinutes() / 60;
    const latestPast = [...validRows].filter(row => row.hour < nowHour).sort((a, b) => b.hour - a.hour)[0];
    const nearestFuture = [...validRows].filter(row => row.hour >= nowHour).sort((a, b) => a.hour - b.hour)[0];
    return !latestPast ? nearestFuture : !nearestFuture ? latestPast
      : nowHour - latestPast.hour <= nearestFuture.hour - nowHour ? latestPast : nearestFuture;
  }

  // 상단 대표 기온은 선택/최근 유효 TODAY_HOURLY를 사용하고, 나머지 날씨는 TODAY 기준을 유지한다.
  function renderCurrentKmaWeather() {
    const row = getCurrentKmaForecastRow();
    const tempCur = document.getElementById("tcTempCurrent");
    const representativeTemperature = getRepresentativeTemperatureRow()?.temperature ?? null;
    if (tempCur) tempCur.textContent = representativeTemperature === null
      ? "--°"
      : `${Math.round(Number(representativeTemperature))}°`;

    const liveBadge = document.getElementById("tcWeatherLiveBadge");
    if (liveBadge) liveBadge.hidden = !row;
    if (!row) {
      const rainAmount = document.getElementById("tcRainAmount");
      const rainProb = document.getElementById("tcRainProb");
      if (rainAmount) rainAmount.textContent = "--";
      if (rainProb) rainProb.textContent = "--";
      return;
    }

    const weather = getWeatherIconInfo(row);
    const weatherIcon = document.getElementById("tcWeatherIcon");
    const weatherLabel = document.getElementById("tcWeatherLabel");
    if (weatherIcon) {
      weatherIcon.textContent = weather.icon;
      weatherIcon.style.color = weather.color;
    }
    if (weatherLabel) weatherLabel.textContent = weather.label;

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
    if (rainAmount) {
      rainAmount.textContent = row.precipitation === 0 ? "0mm"
        : Number.isFinite(row.precipitation) ? `${fmt(row.precipitation, 1)}mm`
        : "--";
    }
    const rainProb = document.getElementById("tcRainProb");
    if (rainProb) rainProb.textContent = Number.isFinite(row.precipitation_probability) ? `${Math.round(row.precipitation_probability)}%` : "--";
  }

  function renderSelectedHourData() {
    const row = getActiveHourRow();
    if (!row) return;

    // Synchronize top weather card to selected hour
    renderCurrentKmaWeather();

    const v12 = row.v12;
    const liveSafety = window.SNORKYMarineSafety?.statusForPoint?.(activePoint);
    const liveWarning = liveSafety?.warning;
    const nonWarningReason = (v12?.safetyReasons || []).find(reason => !String(reason).includes("발효 중"));
    const isSafetyBlock = liveSafety?.status === "BLOCK"
      || (v12?.safety === "BLOCK" && (Boolean(nonWarningReason) || activePoint?.isCustomSpot === true));
    const isSafetyUnknown = !isSafetyBlock && (v12?.safety === "UNKNOWN" || (!v12 && liveSafety?.status === "UNKNOWN"));

    // 1. Hero Score Card Update
    let currentScore = null;
    let statusText = "보통";
    let chipText = "적정";
    let chipClass = "chip-normal";
    let captionText = "시간대별 바다 컨디션을 확인하세요.";

    if (isSafetyBlock) {
      statusText = "입수 금지";
      chipText = "위험";
      chipClass = "chip-block";
      captionText = window.SNORKYEvaluationResults?.formatSafetyBlockSummary?.(liveSafety?.warnings || liveWarning, v12?.safetyReasons)
        || "입수 금지 · 기타 안전 위험";
    } else if (isSafetyUnknown) {
      statusText = "확인 필요";
      chipText = "주의";
      chipClass = "chip-caution";
      captionText = "기상/해양 특보 상태를 사전에 확인하세요.";
    } else {
      const raw = v12?.conditionScore != null ? v12.conditionScore : null;
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

      const serverRec = v12?.recommendation || row?.recommendation;
      const isNight = serverRec === "야간 비추천" || v12?.visualCondition?.lightState === "NIGHT" || (row?.hour != null && (row.hour < 6 || row.hour >= 19));

      if (isNight) {
        chipText = "야간 비추천";
        chipClass = "chip-bad";
        captionText = "밤 시간대로 수중시야 확보가 어렵습니다. 야간 입수는 권장하지 않습니다.";
      } else if (serverRec === "해질녘 비추천") {
        chipText = "해질녘 비추천";
        chipClass = "chip-bad";
        captionText = "일몰 직전 시간대로 시야와 안전 확보가 어렵습니다. 입수를 권장하지 않습니다.";
      } else if (serverRec === "해질녘 주의") {
        chipText = "해질녘 주의";
        chipClass = "chip-caution";
        captionText = "일몰이 가까워지고 있어 곧 어두워집니다. 안전에 유의하세요.";
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
      refTime.textContent = "기상 데이터 출처 및 기준시각";
    }
    renderTideReferenceTime();

    // 4. 3x3 Square Detailed Metrics Grid
    renderSquareMetrics(row);
    renderTideSection();

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
    const waveGrade = Number.isFinite(v12?.metrics?.waveScore)
      ? (window.getSnorkyConditionStatus?.(v12.metrics.waveScore) || "보통")
      : Number.isFinite(row.wave_height)
      ? (row.wave_height <= 0.3 ? "좋음" : row.wave_height <= 0.5 ? "보통" : row.wave_height <= 0.8 ? "주의" : "나쁨")
      : "데이터 없음";

    const windGrade = Number.isFinite(v12?.metrics?.windScore)
      ? (window.getSnorkyConditionStatus?.(v12.metrics.windScore) || "보통")
      : Number.isFinite(row.wind_speed)
      ? (row.wind_speed <= 3 ? "좋음" : row.wind_speed <= 5 ? "보통" : row.wind_speed <= 8 ? "주의" : "나쁨")
      : "데이터 없음";

    // 조류/유속은 컨디션 평가에 반영하지 않는 참고 지표다.
    // 따라서 값의 크기에 따른 좋음·보통·주의·위험 표시는 제공하지 않는다.
    const currentGrade = "참고";

    const periodImpact = v12?.wavePeriodAdjustment?.periodImpact;
    const periodGrade = !Number.isFinite(row.wave_period)
      ? "데이터 없음"
      : periodImpact === "MAXIMUM" || row.wave_period >= 10
      ? "주의"
      : periodImpact === "APPLIED" || row.wave_period >= 7
      ? "영향 있음"
      : "영향 없음";

    const rainGrade = !Number.isFinite(row.precipitation)
      ? "데이터 없음"
      : row.precipitation === 0
      ? "없음"
      : row.precipitation <= 1.0
      ? "보통"
      : "주의";

    const temperatureGrade = !Number.isFinite(row.sea_temperature)
      ? "수온 확인 필요"
      : (row.temperature_suitability || (row.sea_temperature >= 24 ? "최적 수온" : row.sea_temperature >= 20 ? "적정 수온" : "저수온 주의"));

    const directionGrade = Number.isFinite(v12?.windAdjustment?.finalWindScore)
      ? (window.getSnorkyConditionStatus?.(v12.windAdjustment.finalWindScore) || "보통")
      : Number.isFinite(row.wind_speed)
      ? "양호"
      : "데이터 없음";

    // Underwater visibility
    const visScore = Number.isFinite(row.visibility_score) ? row.visibility_score : v12?.underwaterVisibility?.score;
    const visGrade = row.visibility_grade || v12?.underwaterVisibility?.grade || (Number.isFinite(visScore) ? (visScore >= 80 ? "좋음" : visScore >= 65 ? "보통" : "주의") : "데이터 없음");
    const visValue = Number.isFinite(visScore)
      ? `${Math.round(visScore)}점 (${visGrade})`
      : (visGrade !== "데이터 없음" ? visGrade : "--");

    // Wind direction text (UI 16-point Korean wind direction converter)
    function degreeToKoreanWindDirection(deg) {
      if (!Number.isFinite(Number(deg))) return "--";
      const d = (Number(deg) % 360 + 360) % 360;
      const directions = ["북풍", "북북동풍", "북동풍", "동북동풍", "동풍", "동남동풍", "남동풍", "남남동풍", "남풍", "남남서풍", "남서풍", "서남서풍", "서풍", "서북서풍", "북서풍", "북북서풍"];
      const index = Math.round(d / 22.5) % 16;
      return directions[index];
    }
    const windDirText = row.wind_direction || (Number.isFinite(row.wind_direction_degree) ? degreeToKoreanWindDirection(row.wind_direction_degree) : "--");

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

    // Metrics array (exact 7 key indicators matching the reference design + 1 tide card)
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
        id: "temp",
        title: "수온",
        icon: "device_thermostat",
        circleClass: "circle-temp",
        value: Number.isFinite(row.sea_temperature) ? fmt(row.sea_temperature, 1) : "--",
        unit: "°C",
        grade: temperatureGrade
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
        id: "current",
        title: "조류 / 유속",
        icon: "swap_calls",
        circleClass: "circle-current",
        value: Number.isFinite(row.current_speed) ? fmt(row.current_speed, 2) : "--",
        unit: Number.isFinite(row.current_speed) ? "m/s" : "",
        grade: currentGrade,
        isCurrent: true
      },
      {
        id: "wind",
        title: "풍속",
        icon: "air",
        circleClass: "circle-wind",
        value: Number.isFinite(row.wind_speed) ? fmt(row.wind_speed, 1) : "--",
        unit: "m/s",
        grade: windGrade
      },
      {
        id: "direction",
        title: "풍향",
        icon: "explore",
        circleClass: "circle-direction",
        value: windDirText,
        unit: "",
        grade: directionGrade
      },
      {
        id: "visibility",
        title: "예상시야",
        icon: "visibility",
        circleClass: "circle-vis",
        value: visValue,
        unit: "",
        grade: visGrade,
        isVisibility: true
      }
    ];

    const cardsHtml = metrics.map(m => {
      const theme = getMetricGradeTheme(m.grade);
      return `
        <div class="tc-metric-card${m.isVisibility ? " tc-metric-card-clickable" : ""}" data-metric-id="${m.id}">
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

    const tideCardHtml = `
      <div id="tcTideCard" class="tc-metric-card tc-tide-card" data-metric-id="tide">
        <div class="tc-tide-card-header">
          <button id="tcTideMoreBtn" class="tc-tide-more-btn" type="button" aria-label="조석예보 더보기">더보기</button>
        </div>
        <div class="tc-tide-graph" aria-label="오늘 조석 변화 그래프">
          <svg viewBox="0 0 360 98" role="img" aria-label="오늘의 조석 예보 그래프"></svg>
        </div>
      </div>
    `;

    grid.innerHTML = cardsHtml + tideCardHtml;

    // Bind tide more button
    document.getElementById("tcTideMoreBtn")?.addEventListener("click", function (e) {
      e.stopPropagation();
      openTideSheet();
    });

    // Bind the visibility detail button
    grid.querySelectorAll("[data-info-metric]").forEach(btn => {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (this.dataset.infoMetric === "visibility") {
          openVisibilitySheet();
        }
      });
    });

    // Only the visibility metric card opens a detail sheet.
    grid.querySelector('[data-metric-id="visibility"]')?.addEventListener("click", function (e) {
      if (e.target.closest("[data-info-metric]")) return;
      openVisibilitySheet();
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Safety Section Rendering (Omit box if no active warning)
  // ─────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────
  // Safety Section Rendering (KMA 특보 전용 영역)
  // ─────────────────────────────────────────────────────────────
  function renderSafetySection(row) {
    const section = document.getElementById("tcSafetySection");
    const banner = document.getElementById("tcSafetyBanner");
    const bannerText = document.getElementById("tcSafetyBannerText");
    if (!section || !banner || !bannerText) return;

    // 이미 계산된 row의 평가 결과 재사용 (서버 evaluation 결과)
    const safetyStatus = row?.safety_status || row?.v12?.safety;
    const safetyReasons = row?.safety_reasons || row?.v12?.safetyReasons || [];

    // KMA 실제 특보 문구만 추출 (해양 수치 파고/수온 등 제외)
    const kmaWarningReasons = (Array.isArray(safetyReasons) ? safetyReasons : []).filter(reason => {
      const text = String(reason || "").trim();
      return text.includes("발효 중") || /태풍|풍랑|폭풍해일|지진해일|호우|강풍/.test(text) && !/유의파고|파주기|수온|조류/.test(text);
    });

    // 클라이언트 실시간 특보 캐시 (있을 경우 보조 참조)
    const liveSafety = window.SNORKYMarineSafety?.getPointMarineSafety?.(activePoint);
    const liveWarnings = liveSafety?.warnings || (liveSafety?.warning ? [liveSafety.warning] : []);
    const liveWarningTexts = liveWarnings
      .map(w => `${w.areaName || w.regKo || w.regId || ""} ${w.warningName || "해상"}${w.levelName || "특보"} 발효 중`.trim())
      .filter(Boolean);

    const activeWarningTexts = [...new Set([...kmaWarningReasons, ...liveWarningTexts])];

    // 1. 실제 KMA 특보 발효 중
    if (activeWarningTexts.length > 0) {
      section.hidden = false;
      banner.className = "tc-safety-banner banner-warning";
      banner.innerHTML = `
        <span class="material-symbols-outlined">warning</span>
        <span>${escapeHtml(activeWarningTexts.join(" · "))}</span>
      `;
    }
    // 2. 실제 특보 코드 누락 또는 조회 실패 (UNKNOWN)
    else if (safetyStatus === "UNKNOWN" && (!activePoint?.warning_area_code && !activePoint?.warningAreaCode)) {
      section.hidden = false;
      banner.className = "tc-safety-banner banner-warning";
      banner.innerHTML = `
        <span class="material-symbols-outlined">info</span>
        <span>특보 정보를 확인할 수 없습니다.</span>
      `;
    }
    // 3. KMA 특보 없음 (PASS 또는 발효 중인 특보 없음)
    else {
      section.hidden = false;
      banner.className = "tc-safety-banner banner-pass";
      banner.innerHTML = `
        <span class="material-symbols-outlined" style="color: #10b981;">check_circle</span>
        <span style="color: #065f46;">현재 발효 중인 기상·해양 특보가 없습니다.</span>
      `;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Bottom Sheet: 예상 수중시야 더보기 (Underwater Visibility Details)
  // ─────────────────────────────────────────────────────────────
    function openVisibilitySheet() {
    const row = getActiveHourRow();
    if (!row) return;

    const v12 = row.v12;
    const baseScore = Number.isFinite(v12?.baseVisibilityScore) ? v12.baseVisibilityScore
      : (Number.isFinite(row.base_visibility_score) ? row.base_visibility_score
      : (Number.isFinite(row.metrics?.base_visibility_score) ? row.metrics.base_visibility_score : row.visibility_score));

    const baseGrade = v12?.baseVisibilityGrade || row.base_visibility_grade || row.metrics?.base_visibility_grade
      || (Number.isFinite(baseScore) ? (baseScore >= 85 ? "좋음" : baseScore >= 65 ? "양호" : baseScore >= 45 ? "보통" : "나쁨") : "확인 필요");

    // 1. 최근 파도·강수: 영향 {없음/낮음/보통/큼} + 설명문
    let marineImpact = "영향 보통";
    let marineDesc = "최근 파도와 강수가 영향을 줍니다.";

    if (baseGrade === "좋음" || (Number.isFinite(baseScore) && baseScore >= 85)) {
      marineImpact = "영향 없음";
      marineDesc = "최근 파도와 강수의 영향이 없습니다.";
    } else if (baseGrade === "양호" || (Number.isFinite(baseScore) && baseScore >= 65)) {
      marineImpact = "영향 낮음";
      marineDesc = "최근 파도와 강수가 조금 영향을 줍니다.";
    } else if (baseGrade === "보통 · 회복 중" || baseGrade === "보통" || (Number.isFinite(baseScore) && baseScore >= 45)) {
      marineImpact = "영향 보통";
      marineDesc = "최근 파도와 강수가 영향을 줍니다.";
    } else if (baseGrade === "나쁨" || (Number.isFinite(baseScore) && baseScore < 45)) {
      marineImpact = "영향 큼";
      marineDesc = "최근 파도와 강수가 크게 영향을 줍니다.";
    }

    // 2. 현재 날씨: 영향 {없음/낮음/보통/큼} + 설명문
    const visual = v12?.visualCondition || row.metrics?.visual_condition || null;
    const pType = Number(row.precipitation_type ?? row.metrics?.precipitation_type ?? 0);
    const precip = Number(row.precipitation ?? row.metrics?.precipitation ?? 0);
    const sky = Number(row.sky_code ?? row.metrics?.sky_code ?? 1);
    const penalty = Number.isFinite(v12?.visualConditionPenalty) ? v12.visualConditionPenalty
      : (Number.isFinite(row.metrics?.visual_condition_penalty) ? row.metrics.visual_condition_penalty : 0);

    const isRain = pType > 0 || precip > 0.5 || visual?.weatherState === "RAIN";
    const isOvercast = sky === 4 || visual?.weatherState === "OVERCAST";
    const isCloudy = sky === 3 || visual?.weatherState === "MOSTLY_CLOUDY";

    let weatherImpact = "영향 없음";
    let weatherDesc = "현재 날씨의 영향이 없습니다.";

    if (isRain || penalty >= 15) {
      weatherImpact = "영향 큼";
      weatherDesc = "현재 날씨가 매우 큰 영향을 줍니다.";
    } else if (isOvercast || isCloudy || penalty > 0) {
      weatherImpact = "영향 보통";
      weatherDesc = "현재 날씨가 영향을 줍니다.";
    } else if (sky === 2) {
      weatherImpact = "영향 낮음";
      weatherDesc = "현재 날씨가 조금 영향을 줍니다.";
    } else {
      weatherImpact = "영향 없음";
      weatherDesc = "현재 날씨의 영향이 없습니다.";
    }

    // 3. 자연광: {낮/약함/밤} + 설명문
    const h = row.hour != null ? row.hour : 12;
    const lightState = visual?.lightState;
    const isNight = lightState === "NIGHT" || (h < 6 || h >= 19);
    const isSunsetOrDawn = lightState === "SUNSET_EFFECT" || lightState === "DAWN" || ((h >= 6 && h < 8) || (h >= 17 && h < 19));

    let lightStatus = isNight ? "밤" : isSunsetOrDawn ? "약함" : "낮";
    let lightDesc = "";

    if (isNight) {
      lightStatus = "밤";
      lightDesc = "자연광이 거의 없는 시간대입니다.";
    } else {
      if (isRain) {
        lightDesc = "비로 인해 자연광이 매우 낮습니다.";
      } else if (isOvercast) {
        lightDesc = "흐린 날씨로 자연광이 낮습니다.";
      } else if (isCloudy) {
        lightDesc = "구름이 많아 자연광이 다소 낮습니다.";
      } else {
        lightDesc = (lightStatus === "약함")
          ? "자연광이 다소 부족한 시간대입니다."
          : "자연광이 충분한 시간대입니다.";
      }
    }

    // 4. 최종 예상 수중시야
    const visScore = Number.isFinite(row.visibility_score) ? row.visibility_score
      : (Number.isFinite(v12?.visibilityScore) ? v12.visibilityScore
      : (Number.isFinite(baseScore) ? Math.max(0, baseScore - penalty) : null));

    const visGrade = (row.visibility_grade && row.visibility_grade !== "UNKNOWN") ? row.visibility_grade
      : (v12?.visibilityGrade && v12?.visibilityGrade !== "UNKNOWN") ? v12.visibilityGrade
      : (Number.isFinite(visScore) ? (visScore >= 85 ? "좋음" : visScore >= 65 ? "양호" : visScore >= 45 ? "보통" : "나쁨") : "확인 필요");

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
            <div class="tc-sheet-score-label">최종 예상 수중시야</div>
          </div>
          <span class="material-symbols-outlined" style="font-size:36px;color:#059669;">scuba_diving</span>
        </div>

        <div class="tc-sheet-factors">
          <div class="tc-sheet-factor-item">
            <div class="tc-sheet-factor-head">
              <span class="tc-sheet-factor-title">최근 파도·강수</span>
              <span class="tc-sheet-factor-val">${escapeHtml(marineImpact)}</span>
            </div>
            <div class="tc-sheet-factor-desc">${escapeHtml(marineDesc)}</div>
          </div>

          <div class="tc-sheet-factor-item">
            <div class="tc-sheet-factor-head">
              <span class="tc-sheet-factor-title">현재 날씨</span>
              <span class="tc-sheet-factor-val">${escapeHtml(weatherImpact)}</span>
            </div>
            <div class="tc-sheet-factor-desc">${escapeHtml(weatherDesc)}</div>
          </div>

          <div class="tc-sheet-factor-item">
            <div class="tc-sheet-factor-head">
              <span class="tc-sheet-factor-title">자연광</span>
              <span class="tc-sheet-factor-val">${escapeHtml(lightStatus)}</span>
            </div>
            <div class="tc-sheet-factor-desc">${escapeHtml(lightDesc)}</div>
          </div>

          <div class="tc-sheet-factor-item">
            <div class="tc-sheet-factor-head">
              <span class="tc-sheet-factor-title">최종 예상 수중시야</span>
              <span class="tc-sheet-factor-val tc-sheet-factor-highlight">${escapeHtml(visGrade)}</span>
            </div>
          </div>
        </div>
      `;
    }

    document.getElementById("tcBottomSheetOverlay")?.classList.add("open");
  }

  // ─────────────────────────────────────────────────────────────
  // Bottom Sheet: 조석예보 더보기 (Tide Forecast Details)
  // ─────────────────────────────────────────────────────────────
  function getTideForecastDate() {
    const row = getActiveHourRow();
    const candidates = [todayDayData?.date, row?.timestamp, row?.date];

    for (const candidate of candidates) {
      if (candidate == null || String(candidate).trim() === "") continue;
      const text = String(candidate).trim();
      const isoMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
      if (isoMatch) return isoMatch[1];

      const parsed = new Date(candidate);
      if (!Number.isNaN(parsed.getTime())) {
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, "0");
        const date = String(parsed.getDate()).padStart(2, "0");
        return `${year}-${month}-${date}`;
      }
    }

    return "--";
  }

  function getTideForecastTimeText() {
    const forecastDate = getTideForecastDate();
    return forecastDate === "--" ? "--" : `${forecastDate} 00시 기준`;
  }

  function renderTideReferenceTime() {
    const refTime = document.getElementById("tcTideRefTime");
    if (refTime) refTime.textContent = getTideForecastTimeText();
  }

  function openTideSheet() {
    const titleIcon = document.getElementById("tcSheetIcon");
    const titleText = document.getElementById("tcSheetTitleText");
    const body = document.getElementById("tcSheetBody");
    const forecastTime = getTideForecastTimeText();

    if (titleIcon) titleIcon.textContent = "waves";
    if (titleText) titleText.textContent = "조석예보";

    if (body) {
      body.innerHTML = `
        <div class="tc-tide-sheet-subinfo">국립해양조사원 · ${escapeHtml(forecastTime)}</div>

        <div class="tc-tide-modal-card">
          <div class="tc-tide-modal-graph" aria-label="오늘 조석 변화 확대 그래프">
            <svg id="tcTideModalSvg" viewBox="0 0 340 180" preserveAspectRatio="none"></svg>
          </div>
        </div>
      `;

      const modalSvg = document.getElementById("tcTideModalSvg");
      if (modalSvg) {
        renderTideGraphToSvg(modalSvg, true);
      }
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
    if (titleText) titleText.textContent = "데이터 출처 및 기준시각";

    const pointName = activePoint?.name || (Array.isArray(activePoint) ? activePoint[0] : "선택된 포인트");

    // 1. 기상청 단기예보 발표시각
    const kmaFetched = kmaData?.fetchedAt || todayDayData?.kma_fetched_at;
    const kmaH = kmaData?.forecastData?.header;
    const kmaBase = kmaH?.baseDate && kmaH?.baseTime
      ? `${kmaH.baseDate.slice(0, 4)}-${kmaH.baseDate.slice(4, 6)}-${kmaH.baseDate.slice(6, 8)} ${kmaH.baseTime.slice(0, 2)}:${kmaH.baseTime.slice(2, 4)}`
      : (kmaFetched ? String(kmaFetched).slice(0, 16).replace("T", " ") : null);
    const kmaTimeText = kmaBase ? `${kmaBase} 발표` : (todayDayData?.date ? `${todayDayData.date} 05:00 발표` : "--");

    // 2. Open-Meteo Marine 기준시각
    const marineFetched = marineData?.fetchedAt || row?.evaluated_at || todayDayData?.evaluated_at;
    const marineTimeText = marineFetched ? `${String(marineFetched).slice(0, 16).replace("T", " ")} 기준` : (todayDayData?.date ? `${todayDayData.date} 00:00 기준` : "--");

    // 3. KASI 일출·일몰 기준일
    const kasiDate = todayDayData?.date || row?.date || getTideForecastDate();
    const kasiDateText = kasiDate !== "--" ? `${kasiDate} 기준` : "--";

    // 4. KHOA 조석예보 기준시각
    const khoaTimeText = getTideForecastTimeText();

    if (body) {
      body.innerHTML = `
        <div class="tc-sheet-factors" style="background:#ffffff;">
          <strong style="font-size:14px;color:#003e7a;margin-bottom:2px;">📍 ${escapeHtml(pointName)} 데이터 출처 및 기준시각</strong>
          <div style="font-size:13px;color:#475569;line-height:1.55;padding:8px 0 10px;border-bottom:1px dashed #e2e8f0;word-break:keep-all;">
            기상청·해양 수치예보 모델 및 공공 데이터를 기반으로 분석한 정보입니다.
          </div>
          <div class="tc-sheet-factor-item">
            <span class="tc-sheet-factor-title">기상청 단기예보</span>
            <span class="tc-sheet-factor-val">${escapeHtml(kmaTimeText)}</span>
          </div>
          <div class="tc-sheet-factor-item">
            <span class="tc-sheet-factor-title">Open-Meteo Marine</span>
            <span class="tc-sheet-factor-val">${escapeHtml(marineTimeText)}</span>
          </div>
          <div class="tc-sheet-factor-item">
            <span class="tc-sheet-factor-title">KASI 일출·일몰</span>
            <span class="tc-sheet-factor-val">${escapeHtml(kasiDateText)}</span>
          </div>
          <div class="tc-sheet-factor-item">
            <span class="tc-sheet-factor-title">KHOA 조석예보</span>
            <span class="tc-sheet-factor-val">${escapeHtml(khoaTimeText)}</span>
          </div>
        </div>

        <div class="tc-sheet-desc-box">
          ℹ️ <b>안내사항</b>: 본 서비스의 해양 및 기상 수치는 기상청과 공공 해양 수치예보 모델을 기반으로 계산된 예보 기반 예측 데이터입니다. 국지적인 지형 및 조류에 따라 현장 상황이 다를 수 있으므로 입수 전 반드시 안전 수칙과 현장 표지를 확인하시기 바랍니다.
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
    openTideSheet,
    openSourceSheet
  });

})();
