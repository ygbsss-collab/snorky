/**
 * SNORKY Detailed Map View (디테일 지도 보기)
 * - Header: 뒤로가기 + 포인트명
 * - Top Filter Bar: 풍향 / 풍속 / 너울 / 해류 / 수심
 * - Viewport: Kakao Satellite Map (기본) ↔ KHOA S-57 ENC Map (수심 선택 시)
 * - Controls: 🎯 위치복귀 / + 확대 / − 축소
 * - Markers: 각 지도 엔진의 정식 마커/라벨을 원본 lat/lng에 고정
 */
(function () {
  "use strict";

  const KHOA_WEB_KEY = window.SNORKY_KHOA_WEB_KEY || "ACF017B495B26A2B73F64B46F";

  let screenEl = null;
  let activePoint = null;
  let activeMode = "default"; // 'default' | 'wind_dir' | 'wind_spd' | 'swell' | 'current' | 'depth'
  let historyActive = false;

  // Kakao Map Instance & Overlays
  let kakaoMapInstance = null;
  let kakaoMarker = null;
  let kakaoLabelOverlay = null;

  // OpenLayers Instance & Layers
  let olMapInstance = null;
  let olView = null;
  let encLayer = null;
  let olMarkerLayer = null;
  let encVectorUrl = null;

  const resolutions = [
    156543.03, 78271.52, 39135.76, 19567.88, 9783.94,
    4891.96981025128125, 2445.98490512, 1222.99245256, 611.49622628, 305.74811314,
    152.87405657, 76.43702828, 38.21851414, 19.10925707, 9.55462853,
    4.77731426, 2.38865713, 1.19433, 0.5972, 0.298583
  ];

  const tileExtent = [
    -20037508.3427892439067364, -20037508.3427892550826073,
    20037508.3427892439067364, 20037508.3427892439067364
  ];

  // Dedicated Detail Map Marine Fields for Wave / Swell / Current animations
  const DETAIL_MAP_MARINE_FIELDS = [
    "wave_height",
    "wave_direction",
    "wave_period",
    "swell_wave_height",
    "swell_wave_direction",
    "swell_wave_period",
    "ocean_current_velocity",
    "ocean_current_direction"
  ];

  let activeMarineData = null;
  const detailMarineCache = new Map();

  async function fetchDetailMapMarineData(point) {
    if (!point) return null;
    const pt = normalizePoint(point);
    const lat = pt.lat;
    const lng = pt.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const cacheKey = `${lat.toFixed(4)}:${lng.toFixed(4)}`;
    const now = Date.now();
    const cached = detailMarineCache.get(cacheKey);
    if (cached && (now - cached.time < 30 * 60 * 1000)) {
      activeMarineData = cached.data;
      return cached.data;
    }

    const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&hourly=${DETAIL_MAP_MARINE_FIELDS.join(",")}&velocity_unit=ms&timezone=Asia/Seoul&past_days=0&forecast_days=7`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn("[SNORKY Detail Map] Marine data fetch failed HTTP", res.status);
        return null;
      }
      const data = await res.json();
      if (!data?.hourly || !Array.isArray(data.hourly.time)) return null;

      const hourly = data.hourly;
      const unit = String(data.hourly_units?.ocean_current_velocity || "km/h").toLowerCase();
      const currentToMs = (val) => {
        if (val === null || val === undefined || !Number.isFinite(Number(val))) return null;
        const num = Number(val);
        if (unit.includes("km")) return num / 3.6;
        if (unit.includes("kn")) return num * 0.514444;
        return num;
      };

      const normalized = {
        pointId: pt.supabaseId || pt.id,
        latitude: lat,
        longitude: lng,
        fetchedAt: new Date().toISOString(),
        hourly: {
          time: hourly.time || [],
          wave_height: hourly.wave_height || [],
          wave_direction: hourly.wave_direction || [],
          wave_period: hourly.wave_period || [],
          swell_wave_height: hourly.swell_wave_height || [],
          swell_wave_direction: hourly.swell_wave_direction || [],
          swell_wave_period: hourly.swell_wave_period || [],
          ocean_current_velocity: (hourly.ocean_current_velocity || []).map(currentToMs),
          ocean_current_direction: hourly.ocean_current_direction || [],
        },
      };

      detailMarineCache.set(cacheKey, { data: normalized, time: now });
      activeMarineData = normalized;
      if (activeMode === "wave" && waveAnimationRunning) {
        updateWaveParameters();
      }
      return normalized;
    } catch (err) {
      console.warn("[SNORKY Detail Map] Marine data fetch error:", err.message);
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────────────────
  // Date & Time Selector State & Marine Slot Accessor
  // ──────────────────────────────────────────────────────────────────────────
  let selectedDate = null; // 'YYYY-MM-DD'
  let selectedTime = null; // 'YYYY-MM-DDTHH:00'
  let selectedHour = null; // 0..23

  function getAvailableDates() {
    if (!activeMarineData?.hourly?.time || !activeMarineData.hourly.time.length) {
      const nowKst = new Date(Date.now() + 9 * 3600000);
      const list = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(nowKst.getTime() + i * 86400000);
        list.push(d.toISOString().slice(0, 10));
      }
      return list;
    }
    const dates = [...new Set(activeMarineData.hourly.time.map((t) => t.slice(0, 10)))];
    return dates.slice(0, 7);
  }

  function getAvailableHoursForDate(dateStr) {
    if (!activeMarineData?.hourly?.time) {
      return [3, 6, 9, 12, 15, 18, 21];
    }
    const matchingTimes = activeMarineData.hourly.time.filter((t) => t.startsWith(dateStr));
    const hours = matchingTimes.map((t) => Number(t.slice(11, 13)));
    const standardSlots = [3, 6, 9, 12, 15, 18, 21];
    const filtered = standardSlots.filter((h) => hours.includes(h));
    return filtered.length ? filtered : hours;
  }

  function renderTimelineUI() {
    const dateContainer = document.getElementById("pdmDateList");
    const timeContainer = document.getElementById("pdmTimeList");
    if (!dateContainer || !timeContainer) return;

    const dates = getAvailableDates();
    if (!selectedDate || !dates.includes(selectedDate)) {
      selectedDate = dates[0] || new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    }

    // 1. Render Date buttons (실제 날짜 + KST 요일: MM/DD (요일))
    const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
    dateContainer.innerHTML = dates
      .map((d) => {
        const [yyyy, mm, dd] = d.split("-").map(Number);
        const dayIdx = new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0)).getUTCDay();
        const label = `${String(mm).padStart(2, "0")}/${String(dd).padStart(2, "0")} (${dayNames[dayIdx]})`;
        const isActive = d === selectedDate;
        return `<button class="pdm-date-btn${isActive ? " active" : ""}" data-date="${d}" type="button">${escapeHtml(label)}</button>`;
      })
      .join("");

    // 2. Render Time buttons for selected date (03시, 06시, 09시, 12시, 15시, 18시, 21시)
    const hours = getAvailableHoursForDate(selectedDate);
    if (selectedHour === null || !hours.includes(selectedHour)) {
      if (selectedDate === dates[0]) {
        // Today: pick slot closest to current KST hour
        const nowKst = new Date(Date.now() + 9 * 3600000);
        const currentH = nowKst.getUTCHours();
        selectedHour = hours.reduce((prev, curr) => (Math.abs(curr - currentH) < Math.abs(prev - currentH) ? curr : prev), hours[0]);
      } else {
        selectedHour = hours[0]; // First slot of the day
      }
    }

    selectedTime = `${selectedDate}T${String(selectedHour).padStart(2, "0")}:00`;

    timeContainer.innerHTML = hours
      .map((h) => {
        const timeIso = `${selectedDate}T${String(h).padStart(2, "0")}:00`;
        const isActive = h === selectedHour;
        const label = `${String(h).padStart(2, "0")}시`;
        return `<button class="pdm-time-btn${isActive ? " active" : ""}" data-time="${timeIso}" data-hour="${h}" type="button">${label}</button>`;
      })
      .join("");

    if (waveAnimationRunning) {
      updateWaveParameters();
      updateSwellParameters();
      updateWindParameters();
      updateCurrentParameters();
    }
    if (layerStates?.temp) {
      fetchSstGrid();
    }
    updateWaveCard();
    updateSwellCard();
    updateWindCard();
    updateCurrentCard();
    updateTempCard();
  }

  function getSelectedMarineSlot() {
    if (!activeMarineData?.hourly?.time || !activeMarineData.hourly.time.length) return null;
    const hourly = activeMarineData.hourly;
    const target = selectedTime || `${selectedDate}T${String(selectedHour).padStart(2, "0")}:00`;
    let idx = hourly.time.findIndex((t) => t === target || t.startsWith(target.slice(0, 13)));
    if (idx === -1) idx = 0;

    return {
      time: hourly.time[idx],
      wave_height: Number(hourly.wave_height?.[idx] ?? 0.5),
      wave_direction: Number(hourly.wave_direction?.[idx] ?? 0),
      wave_period: Number(hourly.wave_period?.[idx] ?? 6.0),
      swell_wave_height: Number(hourly.swell_wave_height?.[idx] ?? 0.3),
      swell_wave_direction: Number(hourly.swell_wave_direction?.[idx] ?? 0),
      swell_wave_period: Number(hourly.swell_wave_period?.[idx] ?? 5.0),
      ocean_current_velocity: Number(hourly.ocean_current_velocity?.[idx] ?? 0),
      ocean_current_direction: Number(hourly.ocean_current_direction?.[idx] ?? 0),
    };
  }

  let activeWeatherData = null;

  async function fetchDetailMapWeatherData(point) {
    if (!point) return null;
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    try {
      if (window.SNORKYKmaWeatherCache?.fetch) {
        const data = await window.SNORKYKmaWeatherCache.fetch(lat, lng);
        if (data) {
          activeWeatherData = data;
          if (waveAnimationRunning) {
            updateWindParameters();
          }
          updateWindCard();
          return data;
        }
      }
    } catch (_) {}
    return null;
  }

  function getSelectedWeatherSlot() {
    const target = selectedTime || `${selectedDate}T${String(selectedHour).padStart(2, "0")}:00`;
    if (activeWeatherData) {
      const row = window.SNORKYKmaWeatherCache?.nearestHourly?.(activeWeatherData, target, 90);
      if (row) {
        return {
          windSpeed: Number(row.windSpeed) || 0,
          windDirection: Number(row.windDirection) || 0,
        };
      }
      const hourly = activeWeatherData?.forecastData?.hourly || [];
      const found = hourly.find((r) => r.datetime && r.datetime.startsWith(target.slice(0, 13)));
      if (found) {
        return {
          windSpeed: Number(found.windSpeed) || 0,
          windDirection: Number(found.windDirection) || 0,
        };
      }
    }
    // Fallback to activePoint weather / todayCondition properties
    const fallbackWsd = Number(activePoint?.weather?.windSpeed ?? activePoint?.todayCondition?.windSpeed ?? 3.5);
    const fallbackVec = Number(activePoint?.weather?.windDirection ?? activePoint?.todayCondition?.windDirection ?? 0);
    return {
      windSpeed: fallbackWsd,
      windDirection: fallbackVec,
    };
  }

  function resolveCurrentMarineSlot(marineData) {
    return getSelectedMarineSlot();
  }

  function updateWaveCard() {
    const card = document.getElementById("pdmWaveCard");
    if (!card) return;

    const slot = getSelectedMarineSlot();
    const isVisible = Boolean(layerStates?.wave && !isDepthActive);
    card.classList.toggle("active", isVisible);
    if (!isVisible || !slot) return;

    const h = Number(slot.wave_height) || 0;

    const dotEl = document.getElementById("pdmWaveCardDot");
    const valEl = document.getElementById("pdmWaveCardHeight");
    const indEl = document.getElementById("pdmWaveCardIndicator");

    const colorRgba = getWaveColor(h, 1.0);
    if (dotEl) dotEl.style.color = colorRgba;
    if (valEl) valEl.textContent = `${h.toFixed(1)} m`;

    if (indEl) {
      // Piecewise linear mapping to 7 equal segments (0~0.2, 0.2~0.4, 0.4~0.6, 0.6~0.8, 0.8~1.0, 1.0~1.5, 1.5m+)
      let ratio = 0;
      if (h < 0.2) ratio = (h / 0.2) * (1 / 7);
      else if (h < 0.4) ratio = (1 / 7) + ((h - 0.2) / 0.2) * (1 / 7);
      else if (h < 0.6) ratio = (2 / 7) + ((h - 0.4) / 0.2) * (1 / 7);
      else if (h < 0.8) ratio = (3 / 7) + ((h - 0.6) / 0.2) * (1 / 7);
      else if (h < 1.0) ratio = (4 / 7) + ((h - 0.8) / 0.2) * (1 / 7);
      else if (h < 1.5) ratio = (5 / 7) + ((h - 1.0) / 0.5) * (1 / 7);
      else ratio = (6 / 7) + Math.min(1 / 7, ((h - 1.5) / 0.5) * (1 / 7));
      indEl.style.left = `${(Math.max(0, Math.min(1.0, ratio)) * 100).toFixed(1)}%`;
    }
  }

  function updateSwellCard() {
    const card = document.getElementById("pdmSwellCard");
    if (!card) return;

    const slot = getSelectedMarineSlot();
    const isVisible = Boolean(layerStates?.swell && !isDepthActive);
    card.classList.toggle("active", isVisible);
    if (!isVisible || !slot) return;

    const h = Number(slot.swell_wave_height) || 0;

    const dotEl = document.getElementById("pdmSwellCardDot");
    const valEl = document.getElementById("pdmSwellCardHeight");
    const indEl = document.getElementById("pdmSwellCardIndicator");

    const colorRgba = getWaveColor(h, 1.0);
    if (dotEl) dotEl.style.color = colorRgba;
    if (valEl) valEl.textContent = `${h.toFixed(1)} m`;

    if (indEl) {
      // Piecewise linear mapping to 7 equal segments (0~0.2, 0.2~0.4, 0.4~0.6, 0.6~0.8, 0.8~1.0, 1.0~1.5, 1.5m+)
      let ratio = 0;
      if (h < 0.2) ratio = (h / 0.2) * (1 / 7);
      else if (h < 0.4) ratio = (1 / 7) + ((h - 0.2) / 0.2) * (1 / 7);
      else if (h < 0.6) ratio = (2 / 7) + ((h - 0.4) / 0.2) * (1 / 7);
      else if (h < 0.8) ratio = (3 / 7) + ((h - 0.6) / 0.2) * (1 / 7);
      else if (h < 1.0) ratio = (4 / 7) + ((h - 0.8) / 0.2) * (1 / 7);
      else if (h < 1.5) ratio = (5 / 7) + ((h - 1.0) / 0.5) * (1 / 7);
      else ratio = (6 / 7) + Math.min(1 / 7, ((h - 1.5) / 0.5) * (1 / 7));
      indEl.style.left = `${(Math.max(0, Math.min(1.0, ratio)) * 100).toFixed(1)}%`;
    }
  }

  function getWindDirectionName(deg) {
    const normalized = ((deg % 360) + 360) % 360;
    const directions = [
      "북풍", "북북동풍", "북동풍", "동북동풍",
      "동풍", "동남동풍", "남동풍", "남남동풍",
      "남풍", "남남서풍", "남서풍", "서남서풍",
      "서풍", "서북서풍", "북서풍", "북북서풍"
    ];
    const idx = Math.round(normalized / 22.5) % 16;
    return directions[idx] || "북풍";
  }

  function updateWindCard() {
    const card = document.getElementById("pdmWindCard");
    if (!card) return;

    const isVisible = Boolean(layerStates?.wind && !isDepthActive);
    card.classList.toggle("active", isVisible);
    if (!isVisible) return;

    const slot = getSelectedWeatherSlot();
    if (!slot) return;

    const speed = Number(slot.windSpeed) || 0;
    const dir = Math.round(Number(slot.windDirection) || 0) % 360;
    const dirName = getWindDirectionName(dir);

    const dotEl = document.getElementById("pdmWindCardDot");
    const speedEl = document.getElementById("pdmWindCardSpeed");
    const nameEl = document.getElementById("pdmWindCardName");
    const arrowEl = document.getElementById("pdmWindCardArrow");
    const indEl = document.getElementById("pdmWindCardIndicator");

    const colorRgba = getWindColor(speed, 1.0);
    if (dotEl) dotEl.style.color = colorRgba;
    if (speedEl) speedEl.textContent = `${speed.toFixed(1)} m/s`;
    if (nameEl) nameEl.textContent = dirName;
    if (arrowEl) {
      arrowEl.style.transform = `rotate(${dir}deg)`;
    }
    if (indEl) {
      // Piecewise linear mapping to 5 equal segments (0~2 m/s, 2~4 m/s, 4~6 m/s, 6~8 m/s, 8m/s+)
      let ratio = 0;
      if (speed < 2.0) {
        ratio = (speed / 2.0) * 0.20;
      } else if (speed < 4.0) {
        ratio = 0.20 + ((speed - 2.0) / 2.0) * 0.20;
      } else if (speed < 6.0) {
        ratio = 0.40 + ((speed - 4.0) / 2.0) * 0.20;
      } else if (speed < 8.0) {
        ratio = 0.60 + ((speed - 6.0) / 2.0) * 0.20;
      } else {
        ratio = 0.80 + Math.min(0.20, ((speed - 8.0) / 2.0) * 0.20);
      }
      indEl.style.left = `${(Math.max(0, Math.min(1.0, ratio)) * 100).toFixed(1)}%`;
    }
  }

  let detailTideCache = {}; // { [YYYY-MM-DD]: tideEvents[] }

  async function getTideEventsForDetailMap(dateStr) {
    if (!dateStr || !activePoint) return null;
    if (detailTideCache[dateStr]) return detailTideCache[dateStr];

    // 1. Check activePoint.tideEventsMap
    if (activePoint.tideEventsMap && Array.isArray(activePoint.tideEventsMap[dateStr])) {
      detailTideCache[dateStr] = activePoint.tideEventsMap[dateStr];
      return detailTideCache[dateStr];
    }

    // 2. Check window.SNORKY_TIDE_CACHE
    const globalCache = window.SNORKY_TIDE_CACHE;
    if (globalCache && Array.isArray(globalCache[dateStr]) && globalCache[dateStr].length > 0) {
      detailTideCache[dateStr] = globalCache[dateStr];
      return detailTideCache[dateStr];
    }

    // 3. Check activePoint.tideEvents (if today)
    if (Array.isArray(activePoint.tideEvents) && activePoint.tideEvents.length > 0) {
      detailTideCache[dateStr] = activePoint.tideEvents;
      return activePoint.tideEvents;
    }

    // 4. Try window.SNORKYTideData.getTideEventsForDate
    if (window.SNORKYTideData?.getTideEventsForDate) {
      try {
        const events = await window.SNORKYTideData.getTideEventsForDate(dateStr, activePoint);
        if (Array.isArray(events) && events.length > 0) {
          detailTideCache[dateStr] = events;
          return events;
        }
      } catch (_) {}
    }

    return null;
  }

  function resolveTideStatus(events, hour) {
    if (!Array.isArray(events) || !events.length) {
      return { stateText: "정보 없음", nextEventText: "" };
    }

    const targetMinutes = (hour ?? 12) * 60;
    const sorted = [...events].sort((a, b) => (a.minutes || 0) - (b.minutes || 0));

    // 1. Check if near high / low tide (within 45 minutes)
    for (const ev of sorted) {
      const diff = Math.abs((ev.minutes || 0) - targetMinutes);
      if (diff <= 45) {
        const stateText = ev.type === "high" ? "만조 근처" : "간조 근처";
        const next = sorted.find((e) => (e.minutes || 0) > targetMinutes);
        const nextEventText = next ? `다음 ${next.type === "high" ? "만조" : "간조"} ${next.time}` : "";
        return { stateText, nextEventText };
      }
    }

    // 2. Check flood (밀물) or ebb (썰물)
    let prev = null;
    let next = null;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].minutes <= targetMinutes) {
        prev = sorted[i];
      }
      if (sorted[i].minutes > targetMinutes && !next) {
        next = sorted[i];
      }
    }

    let stateText = "밀물";
    if (prev && next) {
      stateText = prev.type === "low" && next.type === "high" ? "밀물" : "썰물";
    } else if (next) {
      stateText = next.type === "high" ? "밀물" : "썰물";
    } else if (prev) {
      stateText = prev.type === "high" ? "썰물" : "밀물";
    }

    const nextEventText = next ? `다음 ${next.type === "high" ? "만조" : "간조"} ${next.time}` : "";
    return { stateText, nextEventText };
  }

  async function updateCurrentCard() {
    const card = document.getElementById("pdmCurrentCard");
    if (!card) return;

    const isVisible = Boolean(layerStates?.current && !isDepthActive);
    card.classList.toggle("active", isVisible);
    if (!isVisible) return;

    const slot = getSelectedMarineSlot();
    const vel = Number(slot?.ocean_current_velocity) || 0;
    const dir = Math.round(Number(slot?.ocean_current_direction) || 0) % 360;

    const velEl = document.getElementById("pdmCurrentCardVel");
    const arrowEl = document.getElementById("pdmCurrentCardArrow");
    const stateEl = document.getElementById("pdmCurrentCardTideState");
    const nextEl = document.getElementById("pdmCurrentCardTideNext");

    if (velEl) velEl.textContent = `${vel.toFixed(2)} m/s`;
    if (arrowEl) arrowEl.style.transform = `rotate(${dir}deg)`;

    // Resolve tide status for current selected date & hour
    const tideEvents = await getTideEventsForDetailMap(selectedDate);
    const { stateText, nextEventText } = resolveTideStatus(tideEvents, selectedHour);

    if (stateEl) {
      stateEl.textContent = stateText;
      if (stateText === "만조 근처") {
        stateEl.style.background = "#FFE4E6";
        stateEl.style.color = "#E11D48";
      } else if (stateText === "간조 근처") {
        stateEl.style.background = "#E0F2FE";
        stateEl.style.color = "#0284C7";
      } else if (stateText === "밀물") {
        stateEl.style.background = "#DCFCE7";
        stateEl.style.color = "#16A34A";
      } else if (stateText === "썰물") {
        stateEl.style.background = "#FEF3C7";
        stateEl.style.color = "#D97706";
      } else {
        stateEl.style.background = "#F1F5F9";
        stateEl.style.color = "#64748B";
      }
    }
    if (nextEl) {
      nextEl.textContent = nextEventText;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Sea Surface Temperature (SST) Grid Distribution System (4x4 Grid)
  // ──────────────────────────────────────────────────────────────────────────
  let sstGridCache = new Map(); // key -> 4x4 array of temperatures
  let sstGridData = null; // { boundsKey, grid: number[4][4], minLat, maxLat, minLng, maxLng }
  let sstLoading = false;
  let sstOffscreenCanvas = null;
  let sstOffscreenCtx = null;

  function getSstColorHex(tempC) {
    const t = Number(tempC) || 0;
    if (t < 15) return "#1D4ED8"; // 진한 파랑
    if (t < 18) return "#2563EB"; // 파랑
    if (t < 21) return "#06B6D4"; // 청록
    if (t < 24) return "#22C55E"; // 초록
    if (t < 27) return "#EAB308"; // 노랑
    if (t < 30) return "#F97316"; // 주황
    return "#EF4444"; // 빨강
  }

  function getTempIndicatorRatio(t) {
    if (t < 15) return Math.max(0, (t / 15) * (1 / 7));
    if (t < 18) return (1 / 7) + ((t - 15) / 3) * (1 / 7);
    if (t < 21) return (2 / 7) + ((t - 18) / 3) * (1 / 7);
    if (t < 24) return (3 / 7) + ((t - 21) / 3) * (1 / 7);
    if (t < 27) return (4 / 7) + ((t - 24) / 3) * (1 / 7);
    if (t < 30) return (5 / 7) + ((t - 27) / 3) * (1 / 7);
    return (6 / 7) + Math.min(1 / 7, ((t - 30) / 3) * (1 / 7));
  }

  function getCenterWaterTemp() {
    if (sstGridData?.grid) {
      const g = sstGridData.grid;
      const centerVals = [g[1][1], g[1][2], g[2][1], g[2][2]].filter((v) => Number.isFinite(v));
      if (centerVals.length) {
        return centerVals.reduce((a, b) => a + b, 0) / centerVals.length;
      }
    }
    return Number(activePoint?.waterTemp ?? activePoint?.todayCondition?.waterTemp ?? 24.0);
  }

  function updateTempCard() {
    const card = document.getElementById("pdmTempCard");
    if (!card) return;

    const isVisible = Boolean(layerStates?.temp && !isDepthActive);
    card.classList.toggle("active", isVisible);
    if (!isVisible) return;

    const tempVal = getCenterWaterTemp();
    const dotEl = document.getElementById("pdmTempCardDot");
    const valEl = document.getElementById("pdmTempCardVal");
    const indEl = document.getElementById("pdmTempCardIndicator");

    const colorHex = getSstColorHex(tempVal);
    if (dotEl) dotEl.style.color = colorHex;
    if (valEl) valEl.textContent = `${tempVal.toFixed(1)} °C`;

    if (indEl) {
      const ratio = getTempIndicatorRatio(tempVal);
      indEl.style.left = `${(Math.max(0, Math.min(1.0, ratio)) * 100).toFixed(1)}%`;
    }
  }

  async function fetchSstGrid() {
    if (!kakaoMapInstance || !layerStates?.temp || isDepthActive) return null;
    const bounds = kakaoMapInstance.getBounds();
    if (!bounds) return null;

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const minLat = sw.getLat();
    const maxLat = ne.getLat();
    const minLng = sw.getLng();
    const maxLng = ne.getLng();

    const targetTime = selectedTime || `${selectedDate}T${String(selectedHour).padStart(2, "0")}:00`;
    const boundsKey = `${targetTime}_${minLat.toFixed(3)}_${maxLat.toFixed(3)}_${minLng.toFixed(3)}_${maxLng.toFixed(3)}`;

    if (sstGridCache.has(boundsKey)) {
      sstGridData = { boundsKey, grid: sstGridCache.get(boundsKey), minLat, maxLat, minLng, maxLng };
      updateTempCard();
      return sstGridData;
    }

    if (sstLoading) return null;
    sstLoading = true;

    try {
      const dLat = (maxLat - minLat) / 4;
      const dLng = (maxLng - minLng) / 4;

      const coords = [];
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const lat = minLat + (r + 0.5) * dLat;
          const lng = minLng + (c + 0.5) * dLng;
          coords.push({ r, c, lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) });
        }
      }

      const lats = coords.map((p) => p.lat).join(",");
      const lngs = coords.map((p) => p.lng).join(",");

      const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lngs}&hourly=sea_surface_temperature&timezone=Asia%2FSeoul`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      if (!Array.isArray(list) || list.length !== 16) throw new Error("Invalid SST array");

      const grid = Array.from({ length: 4 }, () => Array(4).fill(null));

      for (let i = 0; i < 16; i++) {
        const item = list[i];
        const r = coords[i].r;
        const c = coords[i].c;
        const hourly = item?.hourly;
        let tempVal = 24.0;

        if (hourly?.time && Array.isArray(hourly.sea_surface_temperature)) {
          let idx = hourly.time.findIndex((t) => t === targetTime || t.startsWith(targetTime.slice(0, 13)));
          if (idx === -1) idx = 0;
          tempVal = Number(hourly.sea_surface_temperature[idx] ?? 24.0);
        }
        grid[r][c] = tempVal;
      }

      sstGridCache.set(boundsKey, grid);
      sstGridData = { boundsKey, grid, minLat, maxLat, minLng, maxLng };
      updateTempCard();
      return sstGridData;
    } catch (err) {
      console.warn("[SNORKY Detail Map] SST grid fetch error:", err);
      return null;
    } finally {
      sstLoading = false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Wave, Swell, Wind & Current Particle Animation System (Kakao SKYVIEW Overlay)
  // ──────────────────────────────────────────────────────────────────────────
  let waveCanvas = null;
  let waveCtx = null;
  let waveAnimId = null;
  let waveAnimationRunning = false;
  let waveParticles = [];
  let swellParticles = [];
  let windParticles = [];
  let currentParticles = [];
  let currentParams = {
    velocity: 0.12,
    dirDeg: 0,
    dirX: 0,
    dirY: -1,
    speed: 0.45,
    count: 32,
  };
  let waveParams = {
    height: 0.5,
    dirDeg: 0,
    dirX: 0,
    dirY: -1,
    normX: 1,
    normY: 0,
    period: 6.0,
    speed: 0.72,
    count: 64,
  };
  let swellParams = {
    height: 0.3,
    dirDeg: 0,
    dirX: 0,
    dirY: -1,
    normX: 1,
    normY: 0,
    period: 5.0,
    speed: 0.7,
    count: 18,
  };
  let windParams = {
    windSpeed: 3.5,
    dirDeg: 0,
    dirX: 0,
    dirY: -1,
    speed: 0.8,
    count: 130,
  };

  function getWindColor(windSpeed, alpha = 1.0) {
    const s = Math.max(0, Number(windSpeed) || 0);
    const a = Number(alpha).toFixed(3);
    if (s < 2.0) {
      return `rgba(59, 130, 246, ${a})`; // 0~2 m/s: 선명한 파랑 (#3B82F6)
    } else if (s < 4.0) {
      return `rgba(6, 182, 212, ${a})`;  // 2~4 m/s: 선명한 청록 (#06B6D4)
    } else if (s < 6.0) {
      return `rgba(250, 204, 21, ${a})`; // 4~6 m/s: 고채도 밝은 노랑 (#FACC15)
    } else if (s < 8.0) {
      return `rgba(249, 115, 22, ${a})`; // 6~8 m/s: 선명한 주황 (#F97316)
    } else {
      return `rgba(239, 68, 68, ${a})`;  // 8 m/s 이상: 선명한 빨강 (#EF4444)
    }
  }

  function getWaveColor(waveHeight, alpha = 1.0) {
    const h = Math.max(0, Number(waveHeight) || 0);
    const a = Number(alpha).toFixed(3);
    if (h < 0.2) {
      return `rgba(29, 78, 216, ${a})`; // 0.0~0.2m: 진한 파랑
    } else if (h < 0.4) {
      return `rgba(37, 99, 235, ${a})`; // 0.2~0.4m: 파랑
    } else if (h < 0.6) {
      return `rgba(6, 182, 212, ${a})`; // 0.4~0.6m: 청록
    } else if (h < 0.8) {
      return `rgba(34, 197, 94, ${a})`; // 0.6~0.8m: 초록
    } else if (h < 1.0) {
      return `rgba(234, 179, 8, ${a})`; // 0.8~1.0m: 노랑
    } else if (h < 1.5) {
      return `rgba(249, 115, 22, ${a})`; // 1.0~1.5m: 주황
    } else {
      return `rgba(239, 68, 68, ${a})`; // 1.5m 이상: 빨강
    }
  }

  function initWaveCanvas() {
    waveCanvas = document.getElementById("pointDetailWaveCanvas");
    if (!waveCanvas) return;
    waveCtx = waveCanvas.getContext("2d");
    resizeWaveCanvas();
  }

  function resizeWaveCanvas() {
    if (!waveCanvas) return;
    const rect = waveCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    if (w > 0 && h > 0 && (waveCanvas.width !== w * dpr || waveCanvas.height !== h * dpr)) {
      waveCanvas.width = w * dpr;
      waveCanvas.height = h * dpr;
      if (waveCtx) {
        waveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
  }

  function updateWaveParameters() {
    const slot = getSelectedMarineSlot();
    if (!slot) return;

    const h = Math.max(0.1, Math.min(8.0, Number(slot.wave_height) || 0.5));
    const dir = (Number(slot.wave_direction) || 0) % 360;
    const period = Math.max(2.0, Math.min(20.0, Number(slot.wave_period) || 6.0));

    // Direction waves propagate towards:
    // Open-Meteo wave_direction is degrees clockwise from north (direction waves are coming from)
    // Screen coordinate vector: x = -sin(dir), y = cos(dir)
    const rad = (dir * Math.PI) / 180;
    const dirX = -Math.sin(rad);
    const dirY = Math.cos(rad);
    const normX = -dirY;
    const normY = dirX;

    // Relative velocity proportional to wave period (longer period -> faster/longer flow)
    // Overall speed reduced by 40% (calm & natural flow)
    // Clamped between min (0.20 px/frame) and max (0.58 px/frame)
    const speed = Math.max(0.20, Math.min(0.58, 0.17 + period * 0.033));
    const count = 64; // ~50% density increase (42 -> 64)

    waveParams = {
      height: h,
      dirDeg: dir,
      dirX,
      dirY,
      normX,
      normY,
      period,
      speed,
      count,
    };

    updateWaveCard();
  }

  function updateSwellParameters() {
    const slot = getSelectedMarineSlot();
    if (!slot) return;

    const h = Math.max(0.05, Math.min(8.0, Number(slot.swell_wave_height) || 0.3));
    const dir = (Number(slot.swell_wave_direction) || 0) % 360;
    const period = Math.max(2.0, Math.min(20.0, Number(slot.swell_wave_period) || 5.0));

    const rad = (dir * Math.PI) / 180;
    const dirX = -Math.sin(rad);
    const dirY = Math.cos(rad);
    const normX = -dirY;
    const normY = dirX;

    // Relative velocity proportional to swell period (longer period -> faster/longer flow)
    const speed = Math.max(0.35, Math.min(0.95, 0.28 + period * 0.055));
    const count = 18;

    swellParams = {
      height: h,
      dirDeg: dir,
      dirX,
      dirY,
      normX,
      normY,
      period,
      speed,
      count,
    };

    updateSwellCard();
  }

  function updateWindParameters() {
    const slot = getSelectedWeatherSlot();
    if (!slot) return;

    const speedVal = Math.max(0.2, Math.min(25.0, Number(slot.windSpeed) || 3.5));
    const dir = (Number(slot.windDirection) || 0) % 360;

    // KMA/Open-Meteo windDirection is direction wind is blowing FROM (degrees clockwise from north)
    // Screen translation vector towards where wind is blowing TO:
    const rad = (dir * Math.PI) / 180;
    const dirX = -Math.sin(rad);
    const dirY = Math.cos(rad);

    // Movement speed proportional to wind speed (m/s) with 20~35% speed reduction for a smooth calm drift
    const speed = Math.max(0.40, Math.min(1.85, 0.28 + speedVal * 0.12));
    // High density (2.5x ~ 3x increase: 110 ~ 160 particles for clear visible wind coverage)
    const count = Math.max(110, Math.min(160, Math.round(115 + speedVal * 4.0)));

    windParams = {
      windSpeed: speedVal,
      dirDeg: dir,
      dirX,
      dirY,
      speed,
      count,
    };
  }

  function updateCurrentParameters() {
    const slot = getSelectedMarineSlot();
    if (!slot) return;

    const velocity = Math.max(0.01, Math.min(3.0, Number(slot.ocean_current_velocity) || 0.12));
    const dir = (Number(slot.ocean_current_direction) || 0) % 360;

    // Ocean current direction is direction current is flowing TO:
    const rad = (dir * Math.PI) / 180;
    const dirX = Math.sin(rad);
    const dirY = -Math.cos(rad);

    // Speed proportional to velocity
    const speed = Math.max(0.25, Math.min(1.4, 0.20 + velocity * 1.6));
    // Density increases slightly with velocity (24 ~ 40 particles)
    const count = Math.max(24, Math.min(42, Math.round(24 + velocity * 12)));

    currentParams = {
      velocity,
      dirDeg: dir,
      dirX,
      dirY,
      speed,
      count,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Vector Land / Coastline Polygon Mask System (Canvas destination-out)
  // ──────────────────────────────────────────────────────────────────────────
  let landPolygonsLoading = false;
  let cachedVisibleRings = [];

  function loadLandPolygons() {
    if (window.SNORKY_LAND_RINGS) {
      updateVisibleLandRings();
      return Promise.resolve(window.SNORKY_LAND_RINGS);
    }
    if (landPolygonsLoading) return Promise.resolve([]);
    landPolygonsLoading = true;
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "./public/js/korea-coast-polygons.js";
      script.onload = () => {
        landPolygonsLoading = false;
        updateVisibleLandRings();
        resolve(window.SNORKY_LAND_RINGS || []);
      };
      script.onerror = () => {
        landPolygonsLoading = false;
        resolve([]);
      };
      document.head.appendChild(script);
    });
  }

  function updateVisibleLandRings() {
    if (!window.SNORKY_LAND_RINGS || !kakaoMapInstance || !window.kakao) {
      return;
    }
    try {
      const bounds = kakaoMapInstance.getBounds();
      if (!bounds) return;
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const pad = 0.05; // Viewport padding
      const minLng = sw.getLng() - pad;
      const minLat = sw.getLat() - pad;
      const maxLng = ne.getLng() + pad;
      const maxLat = ne.getLat() + pad;

      cachedVisibleRings = window.SNORKY_LAND_RINGS.filter((item) => {
        const b = item.b;
        return !(b[2] < minLng || b[0] > maxLng || b[3] < minLat || b[1] > maxLat);
      });
    } catch (_) {
      cachedVisibleRings = [];
    }
  }

  function isPointInLandPolygon(lng, lat, rings) {
    for (let i = 0; i < rings.length; i++) {
      const b = rings[i].b;
      if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
      const poly = rings[i].r;
      let inside = false;
      for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) {
        const xi = poly[j][0], yi = poly[j][1];
        const xk = poly[k][0], yk = poly[k][1];
        const intersect = ((yi > lat) !== (yk > lat)) && (lng < (xk - xi) * (lat - yi) / (yk - yi) + xi);
        if (intersect) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  }

  function isSeaPixel(x, y) {
    if (!kakaoMapInstance || !window.kakao || !cachedVisibleRings.length) return true;
    try {
      const proj = kakaoMapInstance.getProjection();
      if (!proj) return true;
      const pt = new window.kakao.maps.Point(x, y);
      const latLng = proj.coordsFromContainerPoint(pt);
      const isLand = isPointInLandPolygon(latLng.getLng(), latLng.getLat(), cachedVisibleRings);
      return !isLand;
    } catch (_) {
      return true;
    }
  }

  function applyLandMask(ctx, width, height) {
    if (!kakaoMapInstance || !window.kakao || !cachedVisibleRings.length) return;
    try {
      const proj = kakaoMapInstance.getProjection();
      if (!proj) return;

      ctx.save();
      // Punch out / erase all land & island polygons with safety margin
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000000";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 8; // Coastal safety margin
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      for (let i = 0; i < cachedVisibleRings.length; i++) {
        const pts = cachedVisibleRings[i].r;
        ctx.beginPath();
        for (let j = 0; j < pts.length; j++) {
          const latLng = new window.kakao.maps.LatLng(pts[j][1], pts[j][0]);
          const pt = proj.containerPointFromCoords(latLng);
          if (j === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    } catch (_) {}
  }

  function resetWaveParticle(p, w, h, randomLife = false) {
    p.x = Math.random() * w;
    p.y = Math.random() * h;
    for (let tries = 0; tries < 8; tries++) {
      if (isSeaPixel(p.x, p.y)) break;
      p.x = Math.random() * w;
      p.y = Math.random() * h;
    }
    const baseLife = 52 + (waveParams.period || 6.0) * 2.6;
    p.maxLife = Math.floor(baseLife + Math.random() * 26);
    p.life = randomLife ? Math.floor(Math.random() * p.maxLife) : 0;
    p.crestLength = Math.max(9, Math.min(15, 10 + waveParams.height * 1.5 + Math.random() * 2));
    p.lineWidth = 1.6;
    p.speedMult = 0.90 + Math.random() * 0.20; // Exact ±10% random deviation
  }

  function resetSwellParticle(p, w, h, randomLife = false) {
    p.x = Math.random() * w;
    p.y = Math.random() * h;
    for (let tries = 0; tries < 8; tries++) {
      if (isSeaPixel(p.x, p.y)) break;
      p.x = Math.random() * w;
      p.y = Math.random() * h;
    }
    const baseLife = 70 + (swellParams.period || 5.0) * 3.5;
    p.maxLife = Math.floor(baseLife + Math.random() * 30);
    p.life = randomLife ? Math.floor(Math.random() * p.maxLife) : 0;
    p.crestLength = Math.max(28, Math.min(48, 30 + swellParams.height * 4.0 + Math.random() * 4));
    p.lineWidth = 1.8;
    p.speedMult = 0.90 + Math.random() * 0.20; // Exact ±10% random deviation
  }

  function resetWindParticle(p, w, h, randomLife = false) {
    p.x = Math.random() * w;
    p.y = Math.random() * h;
    const baseLife = 40 + Math.random() * 25;
    p.maxLife = Math.floor(baseLife);
    p.life = randomLife ? Math.floor(Math.random() * p.maxLife) : 0;
    // Short vivid dash particle: 6~10px length
    p.length = Math.max(6, Math.min(10, 6.5 + (windParams.windSpeed || 3.5) * 0.35 + Math.random() * 1.2));
    p.lineWidth = 2.4;
    p.speedMult = 0.90 + Math.random() * 0.20; // ±10% random deviation
  }

  function resetCurrentParticle(p, w, h, randomLife = false) {
    p.x = Math.random() * w;
    p.y = Math.random() * h;
    for (let tries = 0; tries < 8; tries++) {
      if (isSeaPixel(p.x, p.y)) break;
      p.x = Math.random() * w;
      p.y = Math.random() * h;
    }
    const baseLife = 50 + Math.random() * 25;
    p.maxLife = Math.floor(baseLife);
    p.life = randomLife ? Math.floor(Math.random() * p.maxLife) : 0;
    p.length = Math.max(8, Math.min(15, 8.5 + (currentParams.velocity || 0.12) * 8.0 + Math.random() * 2));
    p.lineWidth = 1.8;
    p.speedMult = 0.90 + Math.random() * 0.20;
  }

  function startMarineAnimation() {
    if (isDepthActive && !layerStates.current) return;
    if (!waveCanvas) initWaveCanvas();
    if (!waveCanvas || !waveCtx) return;

    waveAnimationRunning = true;
    resizeWaveCanvas();
    waveCanvas.style.display = "block";
    updateWaveParameters();
    updateSwellParameters();
    updateWindParameters();
    updateCurrentParameters();
    loadLandPolygons();

    const rect = waveCanvas.getBoundingClientRect();
    const w = rect.width || window.innerWidth;
    const h = rect.height || window.innerHeight;

    // Initialize evenly distributed wave particles across grid (if empty)
    if (!waveParticles.length) {
      waveParticles = [];
      const cols = 8;
      const rows = 8;
      const cellW = w / cols;
      const cellH = h / rows;
      let created = 0;

      for (let r = 0; r < rows && created < waveParams.count; r++) {
        for (let c = 0; c < cols && created < waveParams.count; c++) {
          const baseLife = 52 + (waveParams.period || 6.0) * 2.6;
          const maxLife = Math.floor(baseLife + Math.random() * 26);
          const p = {
            x: c * cellW + Math.random() * cellW,
            y: r * cellH + Math.random() * cellH,
            maxLife: maxLife,
            life: Math.floor(Math.random() * maxLife),
            crestLength: Math.max(9, Math.min(15, 10 + waveParams.height * 1.5 + Math.random() * 2)),
            lineWidth: 1.6,
            speedMult: 0.90 + Math.random() * 0.20,
          };
          waveParticles.push(p);
          created++;
        }
      }
    }

    // Initialize evenly distributed swell particles across grid (if empty)
    if (!swellParticles.length) {
      swellParticles = [];
      const cols = 4;
      const rows = 4;
      const cellW = w / cols;
      const cellH = h / rows;
      let created = 0;

      for (let r = 0; r < rows && created < swellParams.count; r++) {
        for (let c = 0; c < cols && created < swellParams.count; c++) {
          const baseLife = 70 + (swellParams.period || 5.0) * 3.5;
          const maxLife = Math.floor(baseLife + Math.random() * 30);
          const p = {
            x: c * cellW + Math.random() * cellW,
            y: r * cellH + Math.random() * cellH,
            maxLife: maxLife,
            life: Math.floor(Math.random() * maxLife),
            crestLength: Math.max(28, Math.min(48, 30 + swellParams.height * 4.0 + Math.random() * 4)),
            lineWidth: 1.8,
            speedMult: 0.90 + Math.random() * 0.20,
          };
          swellParticles.push(p);
          created++;
        }
      }
    }

    // Initialize evenly distributed wind particles across grid (12x11 grid, 2.5x ~ 3x density)
    if (!windParticles.length) {
      windParticles = [];
      const cols = 12;
      const rows = 11;
      const cellW = w / cols;
      const cellH = h / rows;
      let created = 0;

      for (let r = 0; r < rows && created < windParams.count; r++) {
        for (let c = 0; c < cols && created < windParams.count; c++) {
          const baseLife = 40 + Math.random() * 25;
          const maxLife = Math.floor(baseLife);
          const p = {
            x: c * cellW + Math.random() * cellW,
            y: r * cellH + Math.random() * cellH,
            maxLife: maxLife,
            life: Math.floor(Math.random() * maxLife),
            length: Math.max(6, Math.min(10, 6.5 + (windParams.windSpeed || 3.5) * 0.35 + Math.random() * 1.2)),
            lineWidth: 2.4,
            speedMult: 0.90 + Math.random() * 0.20,
          };
          windParticles.push(p);
          created++;
        }
      }
    }

    // Initialize evenly distributed current particles across grid (6x6 grid, 24~42 particles)
    if (!currentParticles.length) {
      currentParticles = [];
      const cols = 6;
      const rows = 6;
      const cellW = w / cols;
      const cellH = h / rows;
      let created = 0;

      for (let r = 0; r < rows && created < currentParams.count; r++) {
        for (let c = 0; c < cols && created < currentParams.count; c++) {
          const baseLife = 50 + Math.random() * 25;
          const maxLife = Math.floor(baseLife);
          const p = {
            x: c * cellW + Math.random() * cellW,
            y: r * cellH + Math.random() * cellH,
            maxLife: maxLife,
            life: Math.floor(Math.random() * maxLife),
            length: Math.max(8, Math.min(15, 8.5 + (currentParams.velocity || 0.12) * 8.0 + Math.random() * 2)),
            lineWidth: 1.8,
            speedMult: 0.90 + Math.random() * 0.20,
          };
          currentParticles.push(p);
          created++;
        }
      }
    }

    if (waveAnimId) {
      cancelAnimationFrame(waveAnimId);
      waveAnimId = null;
    }

    function renderLoop() {
      if (!waveAnimationRunning || !waveCanvas || waveCanvas.style.display === "none") {
        waveAnimId = null;
        return;
      }

      const rect = waveCanvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      waveCtx.clearRect(0, 0, width, height);

      // 0. Render Sea Surface Temperature (SST) 4x4 Grid Layer (반투명 부드러운 수온 필드)
      if (!isDepthActive && layerStates.temp && sstGridData?.grid) {
        if (!sstOffscreenCanvas) {
          sstOffscreenCanvas = document.createElement("canvas");
          sstOffscreenCanvas.width = 4;
          sstOffscreenCanvas.height = 4;
          sstOffscreenCtx = sstOffscreenCanvas.getContext("2d");
        }

        const g = sstGridData.grid;
        // Draw 4x4 color cells (row 3 is North/top, row 0 is South/bottom)
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            const tempVal = g[3 - y][x];
            sstOffscreenCtx.fillStyle = getSstColorHex(tempVal);
            sstOffscreenCtx.fillRect(x, y, 1, 1);
          }
        }

        waveCtx.save();
        waveCtx.globalAlpha = 0.38;
        waveCtx.imageSmoothingEnabled = true;
        waveCtx.imageSmoothingQuality = "high";
        waveCtx.filter = "blur(18px)";
        waveCtx.drawImage(sstOffscreenCanvas, 0, 0, width, height);
        waveCtx.restore();
      }

      // 1. Render Wave Particles (파고/파향: 짧은 초승달형 곡선)
      if (!isDepthActive && layerStates.wave) {
        const dx = waveParams.dirX;
        const dy = waveParams.dirY;
        const nx = waveParams.normX;
        const ny = waveParams.normY;
        const baseSpeed = waveParams.speed;

        for (let i = 0; i < waveParticles.length; i++) {
          const p = waveParticles[i];
          p.life++;

          if (p.life >= p.maxLife) {
            resetWaveParticle(p, width, height, false);
          }

          p.x += dx * baseSpeed * p.speedMult;
          p.y += dy * baseSpeed * p.speedMult;

          const margin = 20;
          if (p.x < -margin) p.x = width + margin;
          else if (p.x > width + margin) p.x = -margin;
          if (p.y < -margin) p.y = height + margin;
          else if (p.y > height + margin) p.y = -margin;

          const progress = p.life / p.maxLife;
          const alpha = Math.sin(Math.PI * progress);
          if (alpha <= 0.02) continue;

          // Draw small curved wave crest (Pongdang style crescent wave arc)
          const halfLen = p.crestLength / 2;
          const startX = p.x - nx * halfLen;
          const startY = p.y - ny * halfLen;
          const endX = p.x + nx * halfLen;
          const endY = p.y + ny * halfLen;
          const bowDist = 2.8 + Math.min(1.5, waveParams.height * 0.5);
          const ctrlX = p.x + dx * bowDist;
          const ctrlY = p.y + dy * bowDist;

          waveCtx.save();
          waveCtx.beginPath();
          waveCtx.moveTo(startX, startY);
          waveCtx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
          waveCtx.strokeStyle = getWaveColor(waveParams.height, alpha * 0.95);
          waveCtx.lineWidth = p.lineWidth;
          waveCtx.lineCap = "round";
          waveCtx.stroke();
          waveCtx.restore();
        }
      }

      // 2. Render Swell Particles (너울: 갈매기형 3중 곡선 '⌒⌒⌒')
      if (!isDepthActive && layerStates.swell) {
        const dx = swellParams.dirX;
        const dy = swellParams.dirY;
        const nx = swellParams.normX;
        const ny = swellParams.normY;
        const baseSpeed = swellParams.speed;

        for (let i = 0; i < swellParticles.length; i++) {
          const p = swellParticles[i];
          p.life++;

          if (p.life >= p.maxLife) {
            resetSwellParticle(p, width, height, false);
          }

          p.x += dx * baseSpeed * p.speedMult;
          p.y += dy * baseSpeed * p.speedMult;

          const margin = 35;
          if (p.x < -margin) p.x = width + margin;
          else if (p.x > width + margin) p.x = -margin;
          if (p.y < -margin) p.y = height + margin;
          else if (p.y > height + margin) p.y = -margin;

          const progress = p.life / p.maxLife;
          const alpha = Math.sin(Math.PI * progress);
          if (alpha <= 0.02) continue;

          // Draw seagull-shaped triple arc '⌒⌒⌒' with equal spacing
          const halfSpan = p.crestLength / 2;
          const thirdSpan = p.crestLength / 3;
          const sixthSpan = p.crestLength / 6;

          // 4 key points along the normal line: Left tip, Joint 1, Joint 2, Right tip
          const p0X = p.x - nx * halfSpan;
          const p0Y = p.y - ny * halfSpan;

          const p1X = p.x - nx * sixthSpan;
          const p1Y = p.y - ny * sixthSpan;

          const p2X = p.x + nx * sixthSpan;
          const p2Y = p.y + ny * sixthSpan;

          const p3X = p.x + nx * halfSpan;
          const p3Y = p.y + ny * halfSpan;

          // Forward bow for the 3 arch peaks
          const bowDist = 3.2 + Math.min(2.2, (swellParams.height || 0.4) * 1.5);
          const ctrl1X = (p.x - nx * thirdSpan) + dx * bowDist;
          const ctrl1Y = (p.y - ny * thirdSpan) + dy * bowDist;
          const ctrl2X = p.x + dx * bowDist;
          const ctrl2Y = p.y + dy * bowDist;
          const ctrl3X = (p.x + nx * thirdSpan) + dx * bowDist;
          const ctrl3Y = (p.y + ny * thirdSpan) + dy * bowDist;

          waveCtx.save();
          waveCtx.beginPath();
          // 1st arch '⌒'
          waveCtx.moveTo(p0X, p0Y);
          waveCtx.quadraticCurveTo(ctrl1X, ctrl1Y, p1X, p1Y);
          // 2nd arch '⌒'
          waveCtx.quadraticCurveTo(ctrl2X, ctrl2Y, p2X, p2Y);
          // 3rd arch '⌒'
          waveCtx.quadraticCurveTo(ctrl3X, ctrl3Y, p3X, p3Y);

          waveCtx.strokeStyle = getWaveColor(swellParams.height, alpha * 0.90);
          waveCtx.lineWidth = p.lineWidth || 1.8;
          waveCtx.lineCap = "round";
          waveCtx.lineJoin = "round";
          waveCtx.stroke();
          waveCtx.restore();
        }
      }

      // 3. Render Ocean Current Particles (해류: 짧은 청록색 직선/화살표 입자, 바다 마스크 적용)
      if (layerStates.current) {
        const dx = currentParams.dirX;
        const dy = currentParams.dirY;
        const baseSpeed = currentParams.speed;

        for (let i = 0; i < currentParticles.length; i++) {
          const p = currentParticles[i];
          p.life++;

          if (p.life >= p.maxLife) {
            resetCurrentParticle(p, width, height, false);
          }

          p.x += dx * baseSpeed * p.speedMult;
          p.y += dy * baseSpeed * p.speedMult;

          const margin = 20;
          if (p.x < -margin) p.x = width + margin;
          else if (p.x > width + margin) p.x = -margin;
          if (p.y < -margin) p.y = height + margin;
          else if (p.y > height + margin) p.y = -margin;

          const progress = p.life / p.maxLife;
          const peakAlpha = isDepthActive ? 0.40 : 0.90;
          const alpha = Math.sin(Math.PI * progress) * peakAlpha;
          if (alpha <= 0.02) continue;

          // Draw short stream line with subtle directional arrowhead
          const halfLen = p.length / 2;
          const startX = p.x - dx * halfLen;
          const startY = p.y - dy * halfLen;
          const endX = p.x + dx * halfLen;
          const endY = p.y + dy * halfLen;

          // Arrowhead fin
          const arrowLen = Math.max(3, Math.min(5, p.length * 0.35));
          const fin1X = endX - dx * arrowLen + dy * (arrowLen * 0.5);
          const fin1Y = endY - dy * arrowLen - dx * (arrowLen * 0.5);
          const fin2X = endX - dx * arrowLen - dy * (arrowLen * 0.5);
          const fin2Y = endY - dy * arrowLen + dx * (arrowLen * 0.5);

          waveCtx.save();
          waveCtx.strokeStyle = `rgba(6, 182, 212, ${alpha.toFixed(3)})`;
          waveCtx.lineWidth = isDepthActive ? 1.2 : (p.lineWidth || 1.8);
          waveCtx.lineCap = "round";
          waveCtx.lineJoin = "round";

          waveCtx.beginPath();
          waveCtx.moveTo(startX, startY);
          waveCtx.lineTo(endX, endY);
          waveCtx.moveTo(fin1X, fin1Y);
          waveCtx.lineTo(endX, endY);
          waveCtx.lineTo(fin2X, fin2Y);
          waveCtx.stroke();
          waveCtx.restore();
        }
      }

      // 4. Apply Vector Land / Island Polygon Mask (destination-out) to sea layers (temp, wave, swell, current)
      if (!isDepthActive && (layerStates.wave || layerStates.swell || layerStates.current || layerStates.temp)) {
        applyLandMask(waveCtx, width, height);
      }

      // 5. Render Wind Particles (풍향/풍속: 선명한 짧은 막대형 대시, 색상=풍속, 육지+바다 전역 표시)
      if (!isDepthActive && layerStates.wind) {
        const dx = windParams.dirX;
        const dy = windParams.dirY;
        const baseSpeed = windParams.speed;

        for (let i = 0; i < windParticles.length; i++) {
          const p = windParticles[i];
          p.life++;

          if (p.life >= p.maxLife) {
            resetWindParticle(p, width, height, false);
          }

          p.x += dx * baseSpeed * p.speedMult;
          p.y += dy * baseSpeed * p.speedMult;

          const margin = 20;
          if (p.x < -margin) p.x = width + margin;
          else if (p.x > width + margin) p.x = -margin;
          if (p.y < -margin) p.y = height + margin;
          else if (p.y > height + margin) p.y = -margin;

          const progress = p.life / p.maxLife;
          // High opacity (0.88 ~ 0.95 at peak)
          const alpha = Math.sin(Math.PI * progress) * 0.94;
          if (alpha <= 0.05) continue;

          // Draw short vivid dash bar particle along wind direction (dx, dy)
          const halfLen = p.length / 2;
          const startX = p.x - dx * halfLen;
          const startY = p.y - dy * halfLen;
          const endX = p.x + dx * halfLen;
          const endY = p.y + dy * halfLen;

          waveCtx.save();
          // Subtle contrast shadow so bright dash pops clearly on satellite map
          waveCtx.shadowColor = "rgba(0, 0, 0, 0.50)";
          waveCtx.shadowBlur = 2.5;
          waveCtx.beginPath();
          waveCtx.moveTo(startX, startY);
          waveCtx.lineTo(endX, endY);
          waveCtx.strokeStyle = getWindColor(windParams.windSpeed, alpha);
          waveCtx.lineWidth = p.lineWidth || 2.4;
          waveCtx.lineCap = "round";
          waveCtx.stroke();
          waveCtx.restore();
        }
      }

      waveAnimId = requestAnimationFrame(renderLoop);
    }

    waveAnimId = requestAnimationFrame(renderLoop);
  }

  function stopMarineAnimation() {
    waveAnimationRunning = false;
    if (waveAnimId) {
      cancelAnimationFrame(waveAnimId);
      waveAnimId = null;
    }
    if (waveCanvas) {
      waveCanvas.style.display = "none";
      if (waveCtx) {
        const rect = waveCanvas.getBoundingClientRect();
        waveCtx.clearRect(0, 0, rect.width, rect.height);
      }
    }
    waveParticles = [];
    swellParticles = [];
    windParticles = [];
    currentParticles = [];
  }

  function startWaveAnimation() {
    startMarineAnimation();
  }

  function stopWaveAnimation() {
    if (!layerStates.wave && !layerStates.swell && !layerStates.wind && !layerStates.current) {
      stopMarineAnimation();
    }
  }

  function setTimeSlot(dateStr, hourNum) {
    if (dateStr) selectedDate = dateStr;
    if (hourNum !== undefined && hourNum !== null && Number.isFinite(Number(hourNum))) {
      selectedHour = Number(hourNum);
    }
    if (waveAnimationRunning) {
      updateWaveParameters();
      updateSwellParameters();
      updateWindParameters();
    }
    updateWaveCard();
    updateSwellCard();
    updateWindCard();
  }

  function escapeHtml(val) {
    return String(val ?? "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function normalizePoint(input) {
    if (!input) return { lat: 34.795811, lng: 128.694208, name: "윤돌섬", role: "snorkeling" };
    const pt = input.point || input;
    const lat = Number(pt.lat ?? pt.latitude ?? 34.795811);
    const lng = Number(pt.lng ?? pt.longitude ?? 128.694208);
    return {
      ...pt,
      lat: Number.isFinite(lat) ? lat : 34.795811,
      lng: Number.isFinite(lng) ? lng : 128.694208,
      name: pt.name || pt.title || input.title || "스노클링 포인트",
      role: pt.role || input.role || "snorkeling",
    };
  }

  function injectStyles() {
    if (document.getElementById("snorkyDetailMapStyles")) return;
    const style = document.createElement("style");
    style.id = "snorkyDetailMapStyles";
    style.textContent = `
      .point-detail-map-screen {
        position: fixed;
        inset: 0 0 var(--snorky-bottom-nav-offset, 0px) 0;
        z-index: 2150;
        display: flex;
        flex-direction: column;
        width: 100vw;
        height: calc(100vh - var(--snorky-bottom-nav-offset, 0px));
        height: calc(100dvh - var(--snorky-bottom-nav-offset, 0px));
        background: #FFFFFF;
        color: #1F2D3D;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Pretendard", sans-serif;
        box-sizing: border-box;
        overflow: hidden;
      }
      .point-detail-map-screen[hidden] {
        display: none !important;
      }

      /* Header */
      .pdm-header {
        position: relative;
        z-index: 30;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-height: 52px;
        height: 52px;
        margin: 0;
        padding: 0 16px;
        background: rgba(255, 255, 255, 0.98);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border-bottom: 1px solid #E5E9ED;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
        box-sizing: border-box;
        flex-shrink: 0;
      }
      .pdm-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        flex: 1;
      }
      .pdm-back-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        min-width: 36px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: transparent;
        color: #101828;
        font-size: 24px;
        font-weight: 300;
        line-height: 1;
        cursor: pointer;
        transition: background 0.15s ease, transform 0.15s ease;
      }
      .pdm-back-btn:hover {
        background: #F1F5F9;
      }
      .pdm-back-btn:active {
        transform: scale(0.95);
      }
      .pdm-title-box {
        min-width: 0;
        flex: 1;
      }
      .pdm-title {
        margin: 0;
        font-size: 17px;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: #1F2D3D;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: 1.25;
      }

      /* Mode Filter Bar (상단 2열 그리드 배치, 가로 스크롤 없음) */
      .pdm-mode-bar {
        position: relative;
        z-index: 25;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 4px 6px;
        margin: 0;
        padding: 6px 10px;
        background: #FFFFFF;
        border-bottom: 1px solid #E5E9ED;
        box-sizing: border-box;
        flex-shrink: 0;
      }
      .pdm-mode-chip {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        height: 26px;
        padding: 0 4px;
        border: 1px solid #E5E9ED;
        border-radius: 6px;
        background: #F5F7F9;
        color: #1F2D3D;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        text-align: center;
        box-sizing: border-box;
        transition: all 0.15s ease;
      }
      .pdm-mode-chip:hover {
        background: #E5E9ED;
      }
      .pdm-mode-chip.active {
        background: #0284c7;
        border-color: #0284c7;
        color: #FFFFFF;
        box-shadow: 0 1px 4px rgba(2, 132, 199, 0.20);
      }
      .pdm-mode-chip.active.depth-chip {
        background: #0d9488;
        border-color: #0d9488;
        color: #FFFFFF;
        box-shadow: 0 1px 4px rgba(13, 148, 136, 0.20);
      }

      /* Map Viewport Wrap */
      .pdm-viewport-wrap {
        position: relative;
        flex: 1;
        width: 100%;
        height: 100%;
        min-height: 0;
        background: #FFFFFF;
        overflow: hidden;
      }

      /* Kakao Satellite Map Viewport */
      .pdm-kakao-viewport {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 10;
        cursor: grab;
        pointer-events: auto !important;
        touch-action: pan-x pan-y pinch-zoom !important;
      }
      .pdm-kakao-viewport:active {
        cursor: grabbing;
      }

      /* Wave & Swell Particle Canvas Overlay */
      .pdm-wave-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none !important;
        touch-action: none !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }

      /* OpenLayers ENC Map Viewport */
      .pdm-ol-viewport {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 10;
        cursor: grab;
      }
      .pdm-ol-viewport:active {
        cursor: grabbing;
      }
      .pdm-ol-viewport .ol-zoom,
      .pdm-ol-viewport .ol-attribution {
        display: none !important;
      }

      /* Floating Controls */
      .pdm-floating-controls {
        position: absolute;
        top: 14px;
        right: 14px;
        z-index: 35;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: auto;
      }
      .pdm-float-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        padding: 0;
        border: 1px solid #E5E9ED;
        border-radius: 12px;
        background: #FFFFFF;
        color: #1F2D3D;
        font-size: 18px;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
        transition: transform 0.15s ease, background 0.15s ease;
      }
      .pdm-float-btn:hover {
        background: #F5F7F9;
      }
      .pdm-float-btn:active {
        transform: scale(0.92);
        background: #E5E9ED;
      }

      /* Marker Overlays */
      .pdm-pin-wrap {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translate(-50%, -100%);
        pointer-events: auto;
        cursor: pointer;
      }
      .pdm-pin-bubble {
        padding: 4px 9px;
        background: #FFFFFF;
        border: 1px solid #E5E9ED;
        border-radius: 8px;
        color: #1F2D3D;
        font-size: 12px;
        font-weight: 800;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        margin-bottom: 4px;
      }

      /* Bottom Timeline Selector Bar (날짜 + 시간대) */
      .pdm-timeline-bar {
        position: absolute;
        bottom: 14px;
        left: 14px;
        right: 14px;
        z-index: 35;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px 10px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid #E5E9ED;
        border-radius: 16px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
        box-sizing: border-box;
        pointer-events: auto;
        max-width: 480px;
        margin: 0 auto;
      }
      .pdm-date-list,
      .pdm-time-list {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
      }
      .pdm-date-list::-webkit-scrollbar,
      .pdm-time-list::-webkit-scrollbar {
        display: none;
      }
      .pdm-date-btn {
        flex-shrink: 0;
        padding: 4px 10px;
        background: #F1F5F9;
        border: 1px solid #CBD5E1;
        border-radius: 14px;
        color: #475569;
        font-size: 11.5px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .pdm-date-btn.active {
        background: #0284c7;
        border-color: #0284c7;
        color: #FFFFFF;
        font-weight: 800;
      }
      .pdm-time-btn {
        flex-shrink: 0;
        padding: 3px 9px;
        background: #F8FAFC;
        border: 1px solid #E2E8F0;
        border-radius: 12px;
        color: #64748B;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .pdm-time-btn.active {
        background: #0284c7;
        border-color: #0284c7;
        color: #FFFFFF;
        font-weight: 800;
      }

      /* Top-Left Status Cards Container (컴팩트 정렬) */
      .pdm-status-cards-wrap {
        position: absolute;
        top: 8px;
        left: 8px;
        z-index: 35;
        display: flex;
        flex-direction: column;
        gap: 4px;
        pointer-events: none;
      }

      /* Compact Level Card */
      .pdm-wave-card {
        position: static;
        top: auto;
        left: auto;
        display: none;
        flex-direction: column;
        gap: 2px;
        width: 104px;
        min-width: 96px;
        max-width: 110px;
        padding: 4px 6px;
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        border: 1px solid rgba(229, 233, 237, 0.9);
        border-radius: 7px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        box-sizing: border-box;
        pointer-events: auto;
        color: #1F2D3D;
      }
      .pdm-wave-card.active {
        display: flex;
      }
      .pdm-wave-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        line-height: 1;
      }
      .pdm-wave-card-title {
        font-size: 9.5px;
        font-weight: 700;
        color: #64748B;
        letter-spacing: -0.2px;
      }
      .pdm-wave-card-body {
        display: flex;
        align-items: baseline;
        gap: 3px;
        line-height: 1.1;
      }
      .pdm-wave-card-dot {
        font-size: 9px;
        line-height: 1;
      }
      .pdm-wave-card-val {
        font-size: 11.5px;
        font-weight: 800;
        color: #0F172A;
      }
      .pdm-wave-card-dir {
        font-size: 9.5px;
        font-weight: 700;
        color: #475569;
        margin-left: 1px;
      }
      .pdm-wind-card-arrow {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10.5px;
        font-weight: 900;
        color: #0284c7;
        line-height: 1;
        transform-origin: center center;
        transition: transform 0.25s ease;
      }
      .pdm-wind-card-name {
        font-size: 9.5px;
        font-weight: 700;
        color: #64748B;
        margin-left: 1px;
      }
      .pdm-wave-card-bar-wrap {
        display: flex;
        flex-direction: column;
        gap: 1px;
        margin-top: 1px;
      }
      .pdm-wave-card-bar {
        position: relative;
        display: flex;
        width: 100%;
        height: 3.5px;
        border-radius: 2px;
        overflow: visible;
      }
      .pdm-wave-card-seg {
        flex: 1;
        height: 100%;
      }
      .pdm-wave-card-seg:first-child {
        border-top-left-radius: 2px;
        border-bottom-left-radius: 2px;
      }
      .pdm-wave-card-seg:last-child {
        border-top-right-radius: 2px;
        border-bottom-right-radius: 2px;
      }
      .pdm-wave-card-indicator {
        position: absolute;
        top: -1.5px;
        width: 2.5px;
        height: 6.5px;
        background: #0F172A;
        border: 0.5px solid #FFFFFF;
        border-radius: 1px;
        transform: translateX(-50%);
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        transition: left 0.2s ease;
      }
      .pdm-wave-card-labels {
        display: flex;
        justify-content: space-between;
        font-size: 7.5px;
        font-weight: 600;
        color: #94A3B8;
        line-height: 1;
        margin-top: 0.5px;
      }
      .pdm-current-card-tide {
        display: flex;
        align-items: center;
        gap: 3px;
        margin-top: 1px;
      }
      .pdm-current-tide-badge {
        display: inline-flex;
        align-items: center;
        padding: 0.5px 3.5px;
        border-radius: 3px;
        font-size: 8.5px;
        font-weight: 800;
        background: #DCFCE7;
        color: #16A34A;
        line-height: 1.2;
        white-space: nowrap;
      }
      .pdm-current-tide-next {
        font-size: 8.5px;
        font-weight: 600;
        color: #64748B;
        white-space: nowrap;
      }

      @media (max-width: 480px) {
        .pdm-header { padding: 0 12px; min-height: 52px; height: 52px; }
        .pdm-title { font-size: 14px; }
        .pdm-mode-bar { padding: 5px 8px; gap: 4px; }
        .pdm-mode-chip { height: 25px; padding: 0 3px; font-size: 10.5px; }
        .pdm-timeline-bar { bottom: 8px; left: 8px; right: 8px; padding: 5px 6px; }
        .pdm-status-cards-wrap { top: 8px; left: 8px; gap: 3px; }
        .pdm-wave-card { width: 98px; min-width: 90px; padding: 3.5px 5px; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureScreen() {
    if (screenEl) return screenEl;
    injectStyles();

    screenEl = document.createElement("section");
    screenEl.id = "pointDetailMapScreen";
    screenEl.className = "point-detail-map-screen";
    screenEl.setAttribute("role", "dialog");
    screenEl.setAttribute("aria-modal", "true");
    screenEl.setAttribute("aria-labelledby", "pointDetailMapTitle");
    screenEl.hidden = true;

    screenEl.innerHTML = `
      <!-- Header -->
      <header class="pdm-header">
        <div class="pdm-header-left">
          <button id="pdmCloseBtn" class="pdm-back-btn" type="button" aria-label="상세 화면으로 돌아가기">‹</button>
          <div class="pdm-title-box">
            <h1 id="pointDetailMapTitle" class="pdm-title">포인트명</h1>
          </div>
        </div>
      </header>

      <!-- Mode Selector Bar (상단 레이어 탭: 2열/2줄 6개 항목) -->
      <nav id="pdmModeBar" class="pdm-mode-bar" aria-label="지도 모드 선택">
        <button class="pdm-mode-chip" data-mode="wind" type="button">🍃 풍향/풍속</button>
        <button class="pdm-mode-chip" data-mode="wave" type="button">🌊 파고/파향</button>
        <button class="pdm-mode-chip" data-mode="swell" type="button">🌊 너울</button>
        <button class="pdm-mode-chip" data-mode="temp" type="button">🌡️ 수온</button>
        <button class="pdm-mode-chip depth-chip" data-mode="depth" type="button">⚓ 수심</button>
        <button class="pdm-mode-chip" data-mode="current" type="button">🌀 해류</button>
      </nav>

      <!-- Map Viewport Container -->
      <main class="pdm-viewport-wrap">
        <!-- 1. Kakao Satellite Map (Active for default, wave, wind, swell, current, temp) -->
        <div id="pointDetailKakaoMap" class="pdm-kakao-viewport"></div>

        <!-- Wave & Swell Particle Animation Canvas (Overlay on Kakao Satellite) -->
        <canvas id="pointDetailWaveCanvas" class="pdm-wave-canvas" style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 15; display: none;"></canvas>

        <!-- 2. OpenLayers KHOA ENC Map (Active when depth is selected) -->
        <div id="pointDetailOlMap" class="pdm-ol-viewport" style="display: none;"></div>

        <!-- Top-Left Marine Status Cards Container -->
        <div class="pdm-status-cards-wrap">
          <!-- 1. Wave Status Card (파고/파향 레벨 카드) -->
          <div id="pdmWaveCard" class="pdm-wave-card" aria-label="파고/파향 현재 상태">
            <div class="pdm-wave-card-header">
              <span class="pdm-wave-card-title">파고/파향</span>
            </div>
            <div class="pdm-wave-card-body">
              <span id="pdmWaveCardDot" class="pdm-wave-card-dot" style="color: #06B6D4;">●</span>
              <span id="pdmWaveCardHeight" class="pdm-wave-card-val">0.6 m</span>
            </div>
            <div class="pdm-wave-card-bar-wrap">
              <div class="pdm-wave-card-bar">
                <span class="pdm-wave-card-seg" style="background:#1D4ED8;" title="0.0~0.2m"></span>
                <span class="pdm-wave-card-seg" style="background:#2563EB;" title="0.2~0.4m"></span>
                <span class="pdm-wave-card-seg" style="background:#06B6D4;" title="0.4~0.6m"></span>
                <span class="pdm-wave-card-seg" style="background:#22C55E;" title="0.6~0.8m"></span>
                <span class="pdm-wave-card-seg" style="background:#EAB308;" title="0.8~1.0m"></span>
                <span class="pdm-wave-card-seg" style="background:#F97316;" title="1.0~1.5m"></span>
                <span class="pdm-wave-card-seg" style="background:#EF4444;" title="1.5m+"></span>
                <span id="pdmWaveCardIndicator" class="pdm-wave-card-indicator" style="left: 33.3%;"></span>
              </div>
              <div class="pdm-wave-card-labels">
                <span>0m</span>
                <span>1.5m+</span>
              </div>
            </div>
          </div>

          <!-- 2. Swell Status Card (너울 레벨 카드) -->
          <div id="pdmSwellCard" class="pdm-wave-card" aria-label="너울 현재 상태">
            <div class="pdm-wave-card-header">
              <span class="pdm-wave-card-title">너울</span>
            </div>
            <div class="pdm-wave-card-body">
              <span id="pdmSwellCardDot" class="pdm-wave-card-dot" style="color: #06B6D4;">●</span>
              <span id="pdmSwellCardHeight" class="pdm-wave-card-val">0.5 m</span>
            </div>
            <div class="pdm-wave-card-bar-wrap">
              <div class="pdm-wave-card-bar">
                <span class="pdm-wave-card-seg" style="background:#1D4ED8;" title="0.0~0.2m"></span>
                <span class="pdm-wave-card-seg" style="background:#2563EB;" title="0.2~0.4m"></span>
                <span class="pdm-wave-card-seg" style="background:#06B6D4;" title="0.4~0.6m"></span>
                <span class="pdm-wave-card-seg" style="background:#22C55E;" title="0.6~0.8m"></span>
                <span class="pdm-wave-card-seg" style="background:#EAB308;" title="0.8~1.0m"></span>
                <span class="pdm-wave-card-seg" style="background:#F97316;" title="1.0~1.5m"></span>
                <span class="pdm-wave-card-seg" style="background:#EF4444;" title="1.5m+"></span>
                <span id="pdmSwellCardIndicator" class="pdm-wave-card-indicator" style="left: 33.3%;"></span>
              </div>
              <div class="pdm-wave-card-labels">
                <span>0m</span>
                <span>1.5m+</span>
              </div>
            </div>
          </div>

          <!-- 3. Wind Status Card (풍향/풍속 정보 및 레벨 카드) -->
          <div id="pdmWindCard" class="pdm-wave-card" aria-label="풍향/풍속 현재 상태">
            <div class="pdm-wave-card-header">
              <span class="pdm-wave-card-title">풍향 / 풍속</span>
            </div>
            <div class="pdm-wave-card-body">
              <span id="pdmWindCardDot" class="pdm-wave-card-dot" style="color: #06B6D4;">●</span>
              <span id="pdmWindCardSpeed" class="pdm-wave-card-val">4.2 m/s</span>
              <span id="pdmWindCardName" class="pdm-wind-card-name">남서풍</span>
              <span id="pdmWindCardArrow" class="pdm-wind-card-arrow">↓</span>
            </div>
            <div class="pdm-wave-card-bar-wrap">
              <div class="pdm-wave-card-bar">
                <span class="pdm-wave-card-seg" style="background:#3B82F6;" title="0~2 m/s"></span>
                <span class="pdm-wave-card-seg" style="background:#06B6D4;" title="2~4 m/s"></span>
                <span class="pdm-wave-card-seg" style="background:#FACC15;" title="4~6 m/s"></span>
                <span class="pdm-wave-card-seg" style="background:#F97316;" title="6~8 m/s"></span>
                <span class="pdm-wave-card-seg" style="background:#EF4444;" title="8m/s+"></span>
                <span id="pdmWindCardIndicator" class="pdm-wave-card-indicator" style="left: 52.5%;"></span>
              </div>
              <div class="pdm-wave-card-labels">
                <span>0m/s</span>
                <span>8m/s+</span>
              </div>
            </div>
          </div>

          <!-- 4. Current & Tide Status Card (해류 정보 및 조석 상태 카드) -->
          <div id="pdmCurrentCard" class="pdm-wave-card" aria-label="해류 및 조석 현재 상태">
            <div class="pdm-wave-card-header">
              <span class="pdm-wave-card-title">해류</span>
            </div>
            <div class="pdm-wave-card-body">
              <span id="pdmCurrentCardDot" class="pdm-wave-card-dot" style="color: #06B6D4;">●</span>
              <span id="pdmCurrentCardVel" class="pdm-wave-card-val">0.12 m/s</span>
              <span id="pdmCurrentCardArrow" class="pdm-wind-card-arrow" style="color:#06B6D4;">↓</span>
            </div>
            <div class="pdm-current-card-tide">
              <span id="pdmCurrentCardTideState" class="pdm-current-tide-badge">밀물</span>
              <span id="pdmCurrentCardTideNext" class="pdm-current-tide-next">다음 만조 18:42</span>
            </div>
          </div>

          <!-- 5. Temperature Status Card (수온 정보 및 레벨 카드) -->
          <div id="pdmTempCard" class="pdm-wave-card" aria-label="수온 현재 상태">
            <div class="pdm-wave-card-header">
              <span class="pdm-wave-card-title">수온</span>
            </div>
            <div class="pdm-wave-card-body">
              <span id="pdmTempCardDot" class="pdm-wave-card-dot" style="color: #22C55E;">●</span>
              <span id="pdmTempCardVal" class="pdm-wave-card-val">24.5 °C</span>
            </div>
            <div class="pdm-wave-card-bar-wrap">
              <div class="pdm-wave-card-bar">
                <span class="pdm-wave-card-seg" style="background:#1D4ED8;" title="<15°C"></span>
                <span class="pdm-wave-card-seg" style="background:#2563EB;" title="15~18°C"></span>
                <span class="pdm-wave-card-seg" style="background:#06B6D4;" title="18~21°C"></span>
                <span class="pdm-wave-card-seg" style="background:#22C55E;" title="21~24°C"></span>
                <span class="pdm-wave-card-seg" style="background:#EAB308;" title="24~27°C"></span>
                <span class="pdm-wave-card-seg" style="background:#F97316;" title="27~30°C"></span>
                <span class="pdm-wave-card-seg" style="background:#EF4444;" title="≥30°C"></span>
                <span id="pdmTempCardIndicator" class="pdm-wave-card-indicator" style="left: 50%;"></span>
              </div>
              <div class="pdm-wave-card-labels">
                <span>&lt;15°C</span>
                <span>30°C+</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Floating Controls (+ / - 줌 버튼만 유지) -->
        <div class="pdm-floating-controls">
          <button id="pdmZoomInBtn" class="pdm-float-btn" type="button" title="확대" aria-label="지도 확대">+</button>
          <button id="pdmZoomOutBtn" class="pdm-float-btn" type="button" title="축소" aria-label="지도 축소">−</button>
        </div>

        <!-- Bottom Timeline Selector (날짜 + 시간대 선택) -->
        <footer id="pdmTimelineBar" class="pdm-timeline-bar" aria-label="날짜 및 시간대 선택">
          <div id="pdmDateList" class="pdm-date-list" role="tablist" aria-label="날짜 선택"></div>
          <div id="pdmTimeList" class="pdm-time-list" role="tablist" aria-label="시간대 선택"></div>
        </footer>
      </main>
    `;

    document.body.appendChild(screenEl);
    bindEvents();
    return screenEl;
  }

  function fetchKhoaEncUrl() {
    return new Promise((resolve) => {
      if (encVectorUrl) {
        resolve(encVectorUrl);
        return;
      }
      const script = document.createElement("script");
      script.src = `https://www.khoa.go.kr/oceanmap/BASEMAP_ENC573857/otmsSSLVectormapApi.do?ServiceKey=${KHOA_WEB_KEY}&version=2`;
      script.onload = () => {
        encVectorUrl = window._vectorMapUrl || `https://www.khoa.go.kr/oceanmap/BASEMAP_ENC573857/SSLVectormapApi.do?ServiceKey=${KHOA_WEB_KEY}`;
        resolve(encVectorUrl);
      };
      script.onerror = () => {
        encVectorUrl = `https://www.khoa.go.kr/oceanmap/BASEMAP_ENC573857/SSLVectormapApi.do?ServiceKey=${KHOA_WEB_KEY}`;
        resolve(encVectorUrl);
      };
      document.head.appendChild(script);
    });
  }

  function createKhoaEncLayer(url) {
    if (!window.ol) return null;

    const targetUrl = url || encVectorUrl || `https://www.khoa.go.kr/oceanmap/BASEMAP_ENC573857/SSLVectormapApi.do?ServiceKey=${KHOA_WEB_KEY}`;

    return new window.ol.layer.Tile({
      division: "TILE",
      layerName: "BASEMAP_ENC",
      visible: true,
      opacity: 1.0,
      source: new window.ol.source.TileWMS({
        matrixSet: "EPSG:3857",
        projection: "EPSG:3857",
        hidpi: false,
        tileGrid: new window.ol.tilegrid.TileGrid({
          extent: tileExtent,
          origin: [tileExtent[0], tileExtent[1]],
          resolutions: resolutions,
        }),
        url: targetUrl,
        serverType: "mapserver",
      }),
      zIndex: 1,
    });
  }

  function createOlMarkerLayer(point) {
    if (!window.ol) return null;
    const pt = normalizePoint(point || activePoint);
    const lat = pt.lat;
    const lng = pt.lng;

    const coord3857 = window.ol.proj.fromLonLat([lng, lat]);
    const pointTitle = pt.name || "스노클링 포인트";

    const feature = new window.ol.Feature({
      geometry: new window.ol.geom.Point(coord3857),
      name: pointTitle,
    });

    const isParking = pt.role === "parking";
    const mainColor = isParking ? "#f59e0b" : "#0284c7";

    const markerStyles = [
      new window.ol.style.Style({
        image: new window.ol.style.Circle({
          radius: 13,
          fill: new window.ol.style.Fill({ color: isParking ? "rgba(245, 158, 11, 0.3)" : "rgba(2, 132, 199, 0.3)" }),
        }),
      }),
      new window.ol.style.Style({
        image: new window.ol.style.Circle({
          radius: 8,
          fill: new window.ol.style.Fill({ color: mainColor }),
          stroke: new window.ol.style.Stroke({ color: "#ffffff", width: 3 }),
        }),
      }),
    ];

    feature.setStyle(markerStyles);

    return new window.ol.layer.Vector({
      source: new window.ol.source.Vector({ features: [feature] }),
      zIndex: 100,
    });
  }

  function initKakaoMap(point) {
    const pt = normalizePoint(point || activePoint);
    const lat = pt.lat;
    const lng = pt.lng;
    const pointTitle = pt.name || "스노클링 포인트";

    const container = document.getElementById("pointDetailKakaoMap");
    if (!container || !window.kakao || !window.kakao.maps) return;

    const kakaoPosition = new window.kakao.maps.LatLng(lat, lng);

    if (!kakaoMapInstance) {
      container.innerHTML = "";
      kakaoMapInstance = new window.kakao.maps.Map(container, {
        center: kakaoPosition,
        level: 3,
        draggable: true,
        scrollwheel: true,
        disableDoubleClickZoom: false,
      });
      kakaoMapInstance.setMapTypeId(window.kakao.maps.MapTypeId.SKYVIEW);
      kakaoMapInstance.setDraggable(true);
      kakaoMapInstance.setZoomable(true);
    } else {
      kakaoMapInstance.setCenter(kakaoPosition);
      kakaoMapInstance.setLevel(3);
      kakaoMapInstance.setDraggable(true);
      kakaoMapInstance.setZoomable(true);
      kakaoMapInstance.relayout();
    }

    // 1. Kakao Official SDK Marker (kakao.maps.Marker)
    if (kakaoMarker) {
      kakaoMarker.setMap(null);
    }
    kakaoMarker = new window.kakao.maps.Marker({
      position: kakaoPosition,
      map: kakaoMapInstance,
    });

    // 2. Kakao Label Overlay (kakao.maps.CustomOverlay)
    if (kakaoLabelOverlay) {
      kakaoLabelOverlay.setMap(null);
    }
    const labelContent = `
      <div style="transform: translate(-50%, -100%); margin-top: -38px; pointer-events: none;">
        <div style="padding: 4px 9px; background: #FFFFFF; border: 1px solid #E5E9ED; border-radius: 8px; color: #1F2D3D; font-size: 12px; font-weight: 800; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          ${escapeHtml(pointTitle)}
        </div>
      </div>
    `;
    kakaoLabelOverlay = new window.kakao.maps.CustomOverlay({
      position: kakaoPosition,
      content: labelContent,
      yAnchor: 0,
      zIndex: 20,
    });
    kakaoLabelOverlay.setMap(kakaoMapInstance);

    if (!kakaoMapInstance._pdmSeaMaskBound) {
      window.kakao.maps.event.addListener(kakaoMapInstance, "dragend", () => {
        if (waveAnimationRunning) {
          loadLandPolygons();
        }
      });
      window.kakao.maps.event.addListener(kakaoMapInstance, "zoom_changed", () => {
        if (waveAnimationRunning) {
          resizeWaveCanvas();
          loadLandPolygons();
        }
      });
      window.kakao.maps.event.addListener(kakaoMapInstance, "idle", () => {
        if (waveAnimationRunning) {
          resizeWaveCanvas();
          loadLandPolygons();
        }
        if (layerStates.temp && !isDepthActive) {
          fetchSstGrid();
        }
      });
      kakaoMapInstance._pdmSeaMaskBound = true;
    }
  }

  async function initOpenLayersMap(point) {
    const pt = normalizePoint(point || activePoint);
    const lat = pt.lat;
    const lng = pt.lng;
    const centerCoord = window.ol.proj.fromLonLat([lng, lat]);

    const container = document.getElementById("pointDetailOlMap");
    if (!container || !window.ol) return;

    if (!olView) {
      olView = new window.ol.View({
        center: centerCoord,
        zoom: 16,
        minZoom: 6,
        maxZoom: 19,
        projection: "EPSG:3857",
      });
    } else {
      olView.setCenter(centerCoord);
      olView.setZoom(16);
    }

    const encUrl = await fetchKhoaEncUrl();

    if (encLayer && olMapInstance) {
      olMapInstance.removeLayer(encLayer);
    }
    encLayer = createKhoaEncLayer(encUrl);

    if (olMarkerLayer && olMapInstance) {
      olMapInstance.removeLayer(olMarkerLayer);
    }
    olMarkerLayer = createOlMarkerLayer(pt);

    if (!olMapInstance) {
      container.innerHTML = "";
      const layers = [encLayer, olMarkerLayer].filter(Boolean);
      olMapInstance = new window.ol.Map({
        target: container,
        layers: layers,
        view: olView,
        controls: [],
      });
    } else {
      olMapInstance.setTarget(container);
      if (encLayer) olMapInstance.addLayer(encLayer);
      if (olMarkerLayer) olMapInstance.addLayer(olMarkerLayer);
      olMapInstance.updateSize();
    }
  }

  let layerStates = {
    wave: false,
    wind: false,
    swell: false,
    current: false,
    temp: false,
  };
  let isDepthActive = false;

  function setMapMode(mode) {
    if (mode === "depth") {
      isDepthActive = !isDepthActive;
      if (isDepthActive) {
        // 수심 선택 시 다른 모든 항목(풍향/풍속, 파고/파향, 너울, 해류, 수온) 즉시 전부 해제
        layerStates.wave = false;
        layerStates.wind = false;
        layerStates.swell = false;
        layerStates.current = false;
        layerStates.temp = false;
      }
    } else {
      // 수심 모드 중 다른 항목 선택 시 수심을 먼저 해제하고 해당 항목으로 전환
      if (isDepthActive) {
        isDepthActive = false;
        layerStates.wave = false;
        layerStates.wind = false;
        layerStates.swell = false;
        layerStates.current = false;
        layerStates.temp = false;
      }

      if (mode === "wave") {
        layerStates.wave = !layerStates.wave;
      } else if (mode === "wind" || mode === "wind_dir" || mode === "wind_spd") {
        layerStates.wind = !layerStates.wind;
      } else if (mode === "swell") {
        layerStates.swell = !layerStates.swell;
      } else if (mode === "current") {
        layerStates.current = !layerStates.current;
      } else if (mode === "temp") {
        layerStates.temp = !layerStates.temp;
        if (layerStates.temp) {
          fetchSstGrid();
        }
      }
    }

    const kakaoEl = document.getElementById("pointDetailKakaoMap");
    const olEl = document.getElementById("pointDetailOlMap");

    // Update Mode Chips UI
    const chips = document.querySelectorAll(".pdm-mode-chip");
    chips.forEach((c) => {
      const m = c.getAttribute("data-mode");
      if (m === "depth") {
        c.classList.toggle("active", isDepthActive);
      } else if (m === "wave") {
        c.classList.toggle("active", Boolean(layerStates.wave));
      } else if (m === "wind" || m === "wind_dir" || m === "wind_spd") {
        c.classList.toggle("active", Boolean(layerStates.wind));
      } else if (m === "swell") {
        c.classList.toggle("active", Boolean(layerStates.swell));
      } else if (m === "current") {
        c.classList.toggle("active", Boolean(layerStates.current));
      } else if (m === "temp") {
        c.classList.toggle("active", Boolean(layerStates.temp));
      }
    });

    const lat = Number(activePoint?.lat ?? 34.795811);
    const lng = Number(activePoint?.lng ?? 128.694208);

    if (isDepthActive) {
      // 1. Show OpenLayers KHOA ENC Map (수심 지도만 단독 표시)
      if (kakaoEl) kakaoEl.style.display = "none";
      if (olEl) olEl.style.display = "block";

      initOpenLayersMap(activePoint);
      if (olMapInstance) {
        olMapInstance.updateSize();
        if (olView) olView.setCenter(window.ol.proj.fromLonLat([lng, lat]));
      }

      // 수심 선택 시 모든 애니메이션 및 오버레이 완전 중지
      stopMarineAnimation();
    } else {
      // 2. Show Kakao Satellite Map (SKYVIEW)
      if (olEl) olEl.style.display = "none";
      if (kakaoEl) kakaoEl.style.display = "block";

      initKakaoMap(activePoint);
      if (kakaoMapInstance) {
        kakaoMapInstance.relayout();
        kakaoMapInstance.setCenter(new window.kakao.maps.LatLng(lat, lng));
      }

      if (layerStates.wave || layerStates.swell || layerStates.wind || layerStates.current || layerStates.temp) {
        startMarineAnimation();
      } else {
        stopMarineAnimation();
      }
    }

    updateWaveCard();
    updateSwellCard();
    updateWindCard();
    updateCurrentCard();
    updateTempCard();
  }

  function bindEvents() {
    const closeBtn = document.getElementById("pdmCloseBtn");
    if (closeBtn) closeBtn.onclick = () => close(true);

    // Mode Selector Chip clicks
    const modeBar = document.getElementById("pdmModeBar");
    if (modeBar) {
      modeBar.addEventListener("click", (e) => {
        const chip = e.target.closest(".pdm-mode-chip");
        if (!chip) return;
        const mode = chip.getAttribute("data-mode");
        if (mode) setMapMode(mode);
      });
    }

    const zoomInBtn = document.getElementById("pdmZoomInBtn");
    const zoomOutBtn = document.getElementById("pdmZoomOutBtn");
    if (zoomInBtn) {
      zoomInBtn.onclick = () => {
        if (isDepthActive) {
          if (olView) olView.animate({ zoom: Math.min(19, olView.getZoom() + 1), duration: 200 });
        } else {
          if (kakaoMapInstance) {
            const lvl = kakaoMapInstance.getLevel();
            if (lvl > 1) kakaoMapInstance.setLevel(lvl - 1, { animate: true });
          }
        }
      };
    }
    if (zoomOutBtn) {
      zoomOutBtn.onclick = () => {
        if (isDepthActive) {
          if (olView) olView.animate({ zoom: Math.max(6, olView.getZoom() - 1), duration: 200 });
        } else {
          if (kakaoMapInstance) {
            const lvl = kakaoMapInstance.getLevel();
            if (lvl < 14) kakaoMapInstance.setLevel(lvl + 1, { animate: true });
          }
        }
      };
    }

    // Timeline Date & Time Clicks
    const dateList = document.getElementById("pdmDateList");
    if (dateList) {
      dateList.addEventListener("click", (e) => {
        const btn = e.target.closest(".pdm-date-btn");
        if (!btn) return;
        const d = btn.getAttribute("data-date");
        if (!d || d === selectedDate) return;
        selectedDate = d;
        // On date change, reset selectedHour to first available slot of that date
        const hours = getAvailableHoursForDate(selectedDate);
        selectedHour = hours[0] ?? 9;
        selectedTime = `${selectedDate}T${String(selectedHour).padStart(2, "0")}:00`;
        renderTimelineUI();
      });
    }

    const timeList = document.getElementById("pdmTimeList");
    if (timeList) {
      timeList.addEventListener("click", (e) => {
        const btn = e.target.closest(".pdm-time-btn");
        if (!btn) return;
        const h = Number(btn.getAttribute("data-hour"));
        const timeIso = btn.getAttribute("data-time");
        if (!Number.isFinite(h)) return;
        selectedHour = h;
        selectedTime = timeIso || `${selectedDate}T${String(h).padStart(2, "0")}:00`;
        renderTimelineUI();
      });
    }

    window.addEventListener("resize", () => {
      if (waveAnimationRunning) {
        resizeWaveCanvas();
      }
    });
  }

  function open(options = {}) {
    let session = null;
    try {
      session = window.SNORKYAuthSession?.get() || JSON.parse(localStorage.getItem("snorky_auth_session_v1") || "null");
    } catch (_) {}
    const isLogged = Boolean(session && session.user && session.user.id);

    if (!isLogged) {
      const pt = normalizePoint(options);
      try {
        sessionStorage.setItem("snorky_pending_detail_map", JSON.stringify({
          id: pt.id || pt.supabaseId || null,
          name: pt.name,
          lat: pt.lat,
          lng: pt.lng,
          region: pt.region || null,
        }));
      } catch (_) {}

      if (window.SNORKYAuthSession?.showLoginPrompt) {
        window.SNORKYAuthSession.showLoginPrompt("해양 상세지도는 로그인 후 이용할 수 있어요.");
      } else {
        alert("해양 상세지도는 로그인 후 이용할 수 있어요.");
      }
      return false;
    }

    const screen = ensureScreen();
    const point = normalizePoint(options);
    activePoint = point;

    const titleEl = document.getElementById("pointDetailMapTitle");
    const title = options.title || point.name || "포인트 디테일 지도";
    if (titleEl) titleEl.textContent = title;

    if (options.date) selectedDate = options.date;
    if (options.hour !== undefined && options.hour !== null && Number.isFinite(Number(options.hour))) {
      selectedHour = Number(options.hour);
    }

    const pointModal = document.getElementById("pointModal");
    if (pointModal && pointModal.classList.contains("open")) {
      pointModal.style.visibility = "hidden";
    }

    screen.hidden = false;
    document.body.style.overflow = "hidden";

    // Initialize initial timeline UI
    renderTimelineUI();

    // Pre-load land & island polygon dataset for coastal masking
    loadLandPolygons();

    if (!historyActive) {
      try {
        window.history.pushState({ snorkyPointDetailMap: true }, "");
        historyActive = true;
      } catch (e) {}
    }

    // Fetch dedicated detail map marine data for animations in background
    fetchDetailMapMarineData(point).then(() => {
      renderTimelineUI();
      if (waveAnimationRunning) {
        updateWaveParameters();
        updateSwellParameters();
      }
    });

    // Fetch KMA weather data for wind animation in background
    fetchDetailMapWeatherData(point).then(() => {
      if (waveAnimationRunning) {
        updateWindParameters();
      }
    });

    // Default to Kakao Satellite Mode on entry
    setTimeout(() => {
      setMapMode("default");
    }, 50);

    return true;
  }

  function close(triggerHistoryBack = true) {
    if (!screenEl || screenEl.hidden) return;

    stopMarineAnimation();
    layerStates.wave = false;
    layerStates.wind = false;
    layerStates.swell = false;
    layerStates.current = false;
    layerStates.temp = false;
    isDepthActive = false;

    updateWaveCard();
    updateSwellCard();
    updateWindCard();
    updateCurrentCard();
    updateTempCard();

    screenEl.hidden = true;
    const pointModal = document.getElementById("pointModal");
    if (pointModal && pointModal.classList.contains("open")) {
      pointModal.style.visibility = "visible";
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    if (triggerHistoryBack && historyActive) {
      historyActive = false;
      try {
        if (window.history.state?.snorkyPointDetailMap) {
          window.history.back();
        }
      } catch (e) {}
    } else {
      historyActive = false;
    }
  }

  window.addEventListener("popstate", (e) => {
    if (screenEl && !screenEl.hidden) {
      if (!e.state || !e.state.snorkyPointDetailMap) {
        close(false);
      }
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && screenEl && !screenEl.hidden) {
      close(true);
    }
  });

  window.SNORKYPointDetailMap = {
    open,
    close,
    isOpen: () => Boolean(screenEl && !screenEl.hidden),
    setMapMode,
    setTimeSlot,
    getSelectedDate: () => selectedDate,
    getSelectedTime: () => selectedTime,
    getSelectedMarineSlot,
    getKakaoMap: () => kakaoMapInstance,
    getOlMap: () => olMapInstance,
    getActiveMode: () => (isDepthActive ? "depth" : "default"),
    getLayerStates: () => ({ ...layerStates }),
    isWaveActive: () => Boolean(layerStates.wave),
    isSwellActive: () => Boolean(layerStates.swell),
    getMarineData: () => activeMarineData,
    fetchMarineData: (pt) => fetchDetailMapMarineData(pt || activePoint),
  };
})();
