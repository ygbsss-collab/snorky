/**
 * SNORKY 3.0: 6-Day Condition Forecast Detail View
 * ──────────────────────────────────────────────────
 * UI/명칭 기준: Today 상세 (today-condition-detail.js)
 *
 * 데이터 소스 계약 (변경 금지):
 *   - +1~+3: SNORKYEvaluationResults.loadShortResultsForPoint() — mode='SHORT' Row만 사용
 *   - +4~+6: SNORKYEvaluationResults.loadMidResultsForPoint()   — mode='MID' Row만 사용
 *   - Today / TODAY_HOURLY fallback: 절대 금지
 *   - 조석: 선택한 날짜 기준으로 SNORKY_TIDE_CACHE 또는 외부 tide API 조회
 *           조회 불가 시 그래프에 "데이터 없음" 표시 (추정/계산 금지)
 *
 * 슬롯 규칙:
 *   - SHORT: KST 03, 06, 09, 12, 15, 18, 21시 슬롯만 표시
 *   - MID  : period_start KST hour < 12 → 오전, >= 12 → 오후
 *
 * 점수 알고리즘: 변경 금지 (condition_score 필드 그대로 사용)
 *
 * Public API:
 *   window.SNORKYDailyForecast.open(point)
 *   window.SNORKYDailyForecast.close(back)
 *   window.SNORKYDailyForecast.isOpen()
 */
(function () {
  "use strict";

  /* ──────────────────────────────────────────────────────────
     State
  ────────────────────────────────────────────────────────── */
  let _modal         = null;
  let _point         = null;
  let _historyActive = false;
  let _shortRows     = [];   // mode='SHORT' rows
  let _midRows       = [];   // mode='MID' rows
  let _selectedDate  = null; // YYYY-MM-DD
  let _selectedSlot  = null; // 현재 선택된 row 객체
  let _targetTime    = null; // HH:MM 입수 예정시간
  let _tideCache     = {};   // { [YYYY-MM-DD]: tideEvents[] | null }
  let _analysisTransition = null;

  const DAY_NAMES        = ["일", "월", "화", "수", "목", "금", "토"];
  const SHORT_VALID_HOURS = new Set([3, 6, 9, 12, 15, 18, 21]);

  /* ──────────────────────────────────────────────────────────
     Utilities
  ────────────────────────────────────────────────────────── */
  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  /**
   * KST 시각(0~23) 추출 — evaluation-result-reader.js getResultHour 패턴 준용
   * SHORT/MID Row 기준: hour 필드, forecast_time or period_start ISO 문자열
   */
  function kstHour(row) {
    if (!row) return 99;

    // 1. 직접 hour 필드
    if (row.hour !== null && row.hour !== undefined && row.hour !== "" && Number.isFinite(Number(row.hour))) {
      return Number(row.hour);
    }

    // 2. forecast_time 우선 확인 (ex: "2026-09-01T03:00:00+09:00")
    const ft = String(row.forecast_time || "");
    if (ft) {
      if (ft.includes("+09:00") || ft.endsWith("KST")) {
        const m = ft.match(/T(\d{2}):/);
        if (m) return Number(m[1]);
      }
      const dt = new Date(ft);
      if (!isNaN(dt.getTime())) {
        return new Date(dt.getTime() + 9 * 3600000).getUTCHours();
      }
    }

    // 3. period_start 확인 (ex: "2026-08-31T18:00:00+00:00" -> UTC 18시 = KST 03시)
    const ps = String(row.period_start || "");
    if (ps) {
      if (ps.includes("+09:00") || ps.endsWith("KST")) {
        const m = ps.match(/T(\d{2}):/);
        if (m) return Number(m[1]);
      }
      const dt = new Date(ps);
      if (!isNaN(dt.getTime())) {
        return new Date(dt.getTime() + 9 * 3600000).getUTCHours();
      }
      const hm = ps.match(/^(\d{1,2})(?::\d{2})?$/);
      if (hm) return Number(hm[1]);
    }

    return 99;
  }


  /**
   * YYYY-MM-DD 추출 — target_date 우선 (SHORT/MID Row 기준)
   */
  function dateOf(row) {
    if (!row) return "";
    // target_date는 SHORT/MID 모두 제공
    const td = String(row.target_date || "");
    if (/^\d{4}-\d{2}-\d{2}/.test(td)) return td.slice(0, 10);

    // fallback: period_start에서 추출
    const ps = String(row.period_start || "");
    if (ps.includes("+09:00")) {
      const m = ps.match(/(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
    }
    if (ps) {
      const dt = new Date(ps);
      if (!isNaN(dt.getTime())) {
        const kst = new Date(dt.getTime() + 9 * 3600000);
        return kst.toISOString().slice(0, 10);
      }
    }
    return "";
  }

  function fmt(v, d = 1) {
    if (v === null || v === undefined || v === "") return "--";
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(d) : "--";
  }

  /** row → metrics → min_max_metrics → display_ranges 순으로 값 추출 (TODAY 계약 없음) */
  function val(row, keys) {
    if (!row) return null;
    const srcs = [row, row.metrics, row.min_max_metrics, row.display_ranges];
    for (const k of keys) {
      for (const src of srcs) {
        if (src && src[k] !== undefined && src[k] !== null && src[k] !== "") return src[k];
      }
    }
    return null;
  }

  function scoreNum(row) {
    if (!row) return null;
    const raw = val(row, ["condition_score", "score"]);
    if (raw === null || raw === undefined || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function avgScore(rows) {
    const nums = rows.map(scoreNum).filter(s => s !== null);
    return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
  }

  /* ──────────────────────────────────────────────────────────
     Grade / Pill helpers (Today getMetricGradeTheme 동일)
  ────────────────────────────────────────────────────────── */
  function scoreLabel(sc) {
    if (sc === null || !Number.isFinite(sc)) return "데이터 없음";
    if (sc >= 80) return "매우좋음";
    if (sc >= 65) return "좋음";
    if (sc >= 50) return "보통";
    if (sc >= 30) return "주의";
    return "비추천";
  }

  function scoreCls(sc) {
    if (sc === null || !Number.isFinite(sc)) return "score-none";
    if (sc >= 80) return "score-good";
    if (sc >= 50) return "score-normal";
    if (sc >= 30) return "score-caution";
    return "score-bad";
  }

  function metricGrade(label) {
    const t = String(label || "").trim();
    if (!t || t === "--" || t === "데이터 없음" || t === "확인 필요") return { pillClass: "pill-neutral", text: t || "데이터 없음" };
    if (t === "참고") return { pillClass: "pill-neutral", text: "참고" };
    if (t === "최상" || (t.includes("매우") && t.includes("좋음"))) return { pillClass: "pill-good", text: "매우좋음" };
    if (t === "영향 없음" || t === "완화" || t === "없음") return { pillClass: "pill-neutral", text: t };
    if (t === "영향 있음") return { pillClass: "pill-caution", text: t };
    if (t.includes("좋음") || t.includes("최적") || t.includes("추천")) return { pillClass: "pill-good", text: "좋음" };
    if (t.includes("보통") || t.includes("적정") || t.includes("낮음")) return { pillClass: "pill-normal", text: "보통" };
    if (t.includes("주의") || t.includes("차가움") || t.includes("짧음") || t.includes("흐림")) return { pillClass: "pill-caution", text: t.length > 4 ? "주의" : t };
    if (t.includes("나쁨") || t.includes("금지") || t.includes("위험") || t.includes("비추천")) return { pillClass: "pill-bad", text: t.includes("금지") ? "입수금지" : "비추천" };
    return { pillClass: "pill-neutral", text: t.length > 6 ? t.slice(0, 6) + "…" : t };
  }

  function dayPillFromScore(sc) {
    const label = scoreLabel(sc);
    const mg = metricGrade(label);
    return { cls: mg.pillClass, label: mg.text };
  }

  function dayPill(rows, isMid = false) {
    if (!rows || !rows.length) return { cls: "pill-neutral", label: "데이터 없음" };

    if (isMid) {
      const hasBlock = rows.some(r => val(r, ["safety_status"]) === "BLOCK" || val(r, ["condition_status"]) === "입수 금지" || val(r, ["condition_status"]) === "입수금지");
      if (hasBlock) {
        return { cls: "pill-bad", label: "입수금지" };
      }
      if (rows.some(r => val(r, ["safety_status"]) === "UNKNOWN")) {
        return { cls: "pill-neutral", label: "확인필요" };
      }
      const sc = avgScore(rows);
      return dayPillFromScore(sc);
    }

    // SHORT (+1~+3): 특정 시간대 BLOCK이더라도 날짜 전체를 입수금지로 단정하지 않고 주간/대표 컨디션 기준 산출
    const daySlots = rows.filter(r => {
      const h = kstHour(r);
      return h >= 6 && h < 19;
    });
    const targetRows = daySlots.length ? daySlots : rows;
    const allBlock = targetRows.every(r => val(r, ["safety_status"]) === "BLOCK" || val(r, ["condition_status"]) === "입수 금지" || val(r, ["condition_status"]) === "입수금지");
    if (allBlock) {
      return { cls: "pill-bad", label: "입수금지" };
    }
    if (targetRows.some(r => val(r, ["safety_status"]) === "UNKNOWN")) {
      return { cls: "pill-neutral", label: "확인필요" };
    }

    const sc = avgScore(targetRows);
    return dayPillFromScore(sc);
  }

  function dayScoreCls(rows, isMid = false) {
    if (!rows || !rows.length) return "score-none";
    if (isMid) {
      const hasBlock = rows.some(r => val(r, ["safety_status"]) === "BLOCK" || val(r, ["condition_status"]) === "입수 금지" || val(r, ["condition_status"]) === "입수금지");
      if (hasBlock) return "score-bad";
      if (rows.some(r => val(r, ["safety_status"]) === "UNKNOWN")) return "score-none";
      return scoreCls(avgScore(rows));
    }
    const daySlots = rows.filter(r => {
      const h = kstHour(r);
      return h >= 6 && h < 19;
    });
    const targetRows = daySlots.length ? daySlots : rows;
    const allBlock = targetRows.every(r => val(r, ["safety_status"]) === "BLOCK" || val(r, ["condition_status"]) === "입수 금지" || val(r, ["condition_status"]) === "입수금지");
    if (allBlock) return "score-bad";
    if (targetRows.some(r => val(r, ["safety_status"]) === "UNKNOWN")) return "score-none";
    return scoreCls(avgScore(targetRows));
  }

  function slotPill(r) {
    if (!r) return { cls: "pill-neutral", label: "데이터 없음" };

    const safety = val(r, ["safety_status"]);
    const status = val(r, ["condition_status", "status"]);
    if (safety === "BLOCK" || status === "입수 금지" || status === "입수금지") {
      return { cls: "pill-bad", label: "입수금지" };
    }
    if (safety === "UNKNOWN") return { cls: "pill-neutral", label: "확인필요" };

    const serverRec = val(r, ["recommendation"]);
    const h = kstHour(r);
    const isNight = serverRec === "야간 비추천" || (h !== 99 && (h < 6 || h >= 19));
    if (isNight) {
      return { cls: "pill-bad", label: "야간 비추천" };
    }

    if (status) {
      const mg = metricGrade(status);
      return { cls: mg.pillClass, label: String(status).trim() };
    }
    const sc = scoreNum(r);
    return dayPillFromScore(sc);
  }

  /* ──────────────────────────────────────────────────────────
     Weather icon (Today getWeatherIconInfo 동일)
  ────────────────────────────────────────────────────────── */
  function wIcon(row, isAM = true) {
    if (!row) return { icon: "sunny", color: "#f59e0b", label: "--" };

    // KMA MidLandFcst wf / wfAm / wfPm / weather_text 문자열 지원
    const wfStr = String(val(row, ["weather_text", isAM ? "wfAm" : "wfPm", isAM ? "weather_am" : "weather_pm", "wf", "weather"]) || "").trim();
    if (wfStr) {
      if (wfStr.includes("비") || wfStr.includes("소나기") || wfStr.includes("뇌우")) {
        return { icon: "rainy", color: "#60a5fa", label: "비" };
      }
      if (wfStr.includes("눈")) {
        return { icon: "ac_unit", color: "#93c5fd", label: "눈" };
      }
      if (wfStr.includes("흐림") || wfStr.includes("흐리고")) {
        return { icon: "cloud", color: "#94a3b8", label: "흐림" };
      }
      if (wfStr.includes("구름") || wfStr.includes("구름많음")) {
        return { icon: "partly_cloudy_day", color: "#38bdf8", label: "구름많음" };
      }
      if (wfStr.includes("맑음")) {
        return { icon: "sunny", color: "#f59e0b", label: "맑음" };
      }
    }

    const pty = Number(val(row, ["precipitation_type", "precipitation_type_code", "pty"]) ?? 0);
    const sky = Number(val(row, ["sky_code", "sky"]));
    const precip = Number(val(row, ["precipitation", "rain_amount"]));

    if (pty === 1) return { icon: "rainy",             color: "#60a5fa", label: "비" };
    if (pty === 2) return { icon: "weather_mix",       color: "#60a5fa", label: "비/눈" };
    if (pty === 3) return { icon: "ac_unit",           color: "#93c5fd", label: "눈" };
    if (pty === 4) return { icon: "thunderstorm",      color: "#60a5fa", label: "소나기" };
    if (pty === 5) return { icon: "rainy",             color: "#60a5fa", label: "빗방울" };
    if (pty === 6) return { icon: "weather_mix",       color: "#60a5fa", label: "빗방울/눈날림" };
    if (pty === 7) return { icon: "ac_unit",           color: "#93c5fd", label: "눈날림" };
    if (pty > 0 || (Number.isFinite(precip) && precip > 0.5)) return { icon: "rainy", color: "#60a5fa", label: "비" };

    if (sky === 4) return { icon: "cloud",             color: "#94a3b8", label: "흐림" };
    if (sky === 3) return { icon: "partly_cloudy_day", color: "#38bdf8", label: "구름많음" };
    if (sky === 1) return { icon: "sunny",             color: "#f59e0b", label: "맑음" };

    const clouds = Number(val(row, ["cloud_cover", "clouds"]));
    if (Number.isFinite(clouds) && clouds >= 80) return { icon: "cloud",             color: "#94a3b8", label: "흐림" };
    if (Number.isFinite(clouds) && clouds >= 40) return { icon: "partly_cloudy_day", color: "#38bdf8", label: "구름많음" };
    return { icon: "sunny", color: "#f59e0b", label: "맑음" };
  }

  /* ──────────────────────────────────────────────────────────
     파범위 (MID용 min~max)
  ────────────────────────────────────────────────────────── */
  function waveRange(row) {
    const mm = row?.min_max_metrics?.wave_height || row?.display_ranges?.wave_height;
    if (mm && typeof mm === "object") {
      const mn = Number(mm.min), mx = Number(mm.max), me = Number(mm.mean);
      if (Number.isFinite(mn) && Number.isFinite(mx) && mn !== mx)
        return `${fmt(mn, 1)}~${fmt(mx, 1)}`;
      if (Number.isFinite(mn) && Number.isFinite(mx)) return fmt(mn, 1);
      if (Number.isFinite(me)) return fmt(me, 1);
    }
    const wmin = Number(val(row, ["wave_height_min"]));
    const wmax = Number(val(row, ["wave_height_max"]));
    if (Number.isFinite(wmin) && Number.isFinite(wmax) && wmin !== wmax)
      return `${fmt(wmin, 1)}~${fmt(wmax, 1)}`;
    return fmt(val(row, ["wave_height", "significant_wave_height"]), 1);
  }

  /* 풍향 degree → 한국어 방위 */
  function degToWindDir(deg) {
    if (!Number.isFinite(Number(deg))) return "--";
    const d = (Number(deg) % 360 + 360) % 360;
    const dirs = ["북풍","북북동풍","북동풍","동북동풍","동풍","동남동풍","남동풍","남남동풍","남풍","남남서풍","남서풍","서남서풍","서풍","서북서풍","북서풍","북북서풍"];
    return dirs[Math.round(d / 22.5) % 16];
  }

  /* ──────────────────────────────────────────────────────────
     KHOA 20 Tide Observation Stations Lookup
  ────────────────────────────────────────────────────────── */
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

  /* ──────────────────────────────────────────────────────────
     조석 데이터 — 선택한 point + target_date 기준 조회
     - point_evaluation_results에 조석 추가 금지
     - 추정값 생성 금지 (실패 시 null 반환)
  ────────────────────────────────────────────────────────── */
  function getTideEventsForDate(dateStr) {
    if (!dateStr) return null;

    // 1. 메모리 캐시 확인
    if (Object.prototype.hasOwnProperty.call(_tideCache, dateStr)) {
      return _tideCache[dateStr];
    }

    // 2. 전역 캐시 확인 (window.SNORKY_TIDE_CACHE[YYYY-MM-DD])
    const globalCache = window.SNORKY_TIDE_CACHE;
    if (globalCache && typeof globalCache === "object") {
      if (Array.isArray(globalCache[dateStr]) && globalCache[dateStr].length > 0) {
        _tideCache[dateStr] = globalCache[dateStr];
        return _tideCache[dateStr];
      }
    }

    return null;
  }

  const KHOA_API_KEY = "nUCP4798xT5GfJ9kPBLbiPzl%2FiRPLPBBxk%2BNoqnscMzof37b8YlRQc7vmVH7lMMSH9uMWahHGhzskx%2FTtIRAcQ%3D%3D";
  const KHOA_ENDPOINT = "https://apis.data.go.kr/1192136/tideFcstTime/GetTideFcstTimeApiService";

  /**
   * 국립해양조사원(KHOA) 조석예보 API를 통한 실제 미래 날짜 조석 데이터 조회
   */
  async function fetchKhoaTideEvents(stationCode, dateStr) {
    if (!stationCode || !dateStr) return null;
    const reqDate = dateStr.replace(/\D/g, "").slice(0, 8);
    if (!/^\d{8}$/.test(reqDate)) return null;

    try {
      const url = new URL(KHOA_ENDPOINT);
      url.searchParams.set("serviceKey", decodeURIComponent(KHOA_API_KEY));
      url.searchParams.set("pageNo", "1");
      url.searchParams.set("numOfRows", "300");
      url.searchParams.set("type", "json");
      url.searchParams.set("obsCode", stationCode);
      url.searchParams.set("reqDate", reqDate);
      url.searchParams.set("min", "60");

      const res = await fetch(url.toString());
      if (!res.ok) return null;
      const data = await res.json();
      const items = data?.body?.items?.item || [];
      if (!Array.isArray(items) || items.length < 3) return null;

      const events = [];
      for (let i = 1; i < items.length - 1; i++) {
        const prev = Number(items[i - 1]?.tdlvHgt);
        const curr = Number(items[i]?.tdlvHgt);
        const next = Number(items[i + 1]?.tdlvHgt);
        if (!Number.isFinite(curr) || !Number.isFinite(prev) || !Number.isFinite(next)) continue;

        const dtStr = String(items[i]?.predcDt || "");
        const hm = dtStr.includes(" ") ? dtStr.split(" ")[1] : "";
        if (!hm) continue;
        const [h, m] = hm.split(":").map(Number);
        const minutes = h * 60 + (m || 0);

        if (curr >= prev && curr > next) {
          events.push({ type: "high", minutes, time: hm, level: Math.round(curr) });
        } else if (curr <= prev && curr < next) {
          events.push({ type: "low", minutes, time: hm, level: Math.round(curr) });
        }
      }

      return events.length ? events : null;
    } catch (_) {
      return null;
    }
  }

  /* 비동기 조석 데이터 로드 (선택한 point + target_date 기준) */
  async function fetchTideEventsForDate(dateStr, point) {
    if (!dateStr || !point) return null;

    // 이미 조회된 경우
    if (Object.prototype.hasOwnProperty.call(_tideCache, dateStr)) {
      return _tideCache[dateStr];
    }

    // 1. 전역/메모리 캐시 확인
    const cached = getTideEventsForDate(dateStr);
    if (cached) return cached;

    // 2. point 객체 내 날짜별 조석 맵 확인
    if (point.tideEventsMap && Array.isArray(point.tideEventsMap[dateStr])) {
      _tideCache[dateStr] = point.tideEventsMap[dateStr];
      return _tideCache[dateStr];
    }

    // 3. 외부 API/조석 서비스 연동 (SNORKYTideData)
    if (window.SNORKYTideData?.getTideEventsForDate) {
      try {
        const events = await window.SNORKYTideData.getTideEventsForDate(dateStr, point);
        if (Array.isArray(events) && events.length > 0) {
          _tideCache[dateStr] = events;
          return events;
        }
      } catch (_) { /* noop */ }
    }

    // 4. 관측소 식별 및 KHOA 공공데이터포털 실제 조석 API 조회
    const lat = Number(point.lat || point.latitude);
    const lng = Number(point.lng || point.longitude);
    // 나만의 스팟은 저장 좌표가 없으면 공식 관측소를 임의로 대입하지 않는다.
    if (point.isCustomSpot === true && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
      _tideCache[dateStr] = null;
      return null;
    }
    const station = getNearestTideStation(lat, lng);

    if (station?.code) {
      const liveEvents = await fetchKhoaTideEvents(station.code, dateStr);
      if (Array.isArray(liveEvents) && liveEvents.length > 0) {
        _tideCache[dateStr] = liveEvents;
        return liveEvents;
      }
    }

    // 조회 실패 또는 데이터 부재 시 null (추정 금지)
    _tideCache[dateStr] = null;
    return null;
  }


  /* ──────────────────────────────────────────────────────────
     조석 SVG 렌더 (Today renderTideGraphToSvg 구조 재사용)
  ────────────────────────────────────────────────────────── */
  function renderTideGraph(svg, tideEvents, isModal = false) {
    if (!svg) return;
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
    const gradId = isModal ? "dfTideModalAreaFill" : "dfTideAreaFill";

    const chartEvents = tideEvents.map(event => {
      const levelRatio = (event.level - minLevel) / levelRange;
      const x = chart.left + (event.minutes / 1440) * (chart.right - chart.left);
      const isHigh = event.type === "high";
      const y = isHigh
        ? chart.top + (isModal ? 20 : 14) - levelRatio * (isModal ? 18 : 9)
        : chart.bottom - (isModal ? 12 : 8) - levelRatio * (isModal ? 18 : 10);
      return { ...event, x, y };
    });

    const start = { type: "boundary", minutes: 0, x: chart.left,
      y: Math.min(chart.bottom - (isModal ? 6 : 5), chartEvents[0].y + (isModal ? 20 : 16)) };
    const end = { type: "boundary", minutes: 1440, x: chart.right,
      y: Math.max(chart.top + (isModal ? 10 : 7), chartEvents[chartEvents.length - 1].y - (isModal ? 16 : 14)) };
    const pts = [start, ...chartEvents, end];

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
        <g class="df-tide-event df-tide-event-${event.type}">
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
      <g class="df-tide-grid">${timeGrid}</g>
      <path class="df-tide-area" fill="url(#${gradId})" d="${areaPath}"/>
      <path class="df-tide-line" stroke-width="${isModal ? 3.2 : 2}" d="${curvePath}"/>
      ${eventLabels}`;
  }

  /* ──────────────────────────────────────────────────────────
     메트릭 카드 빌더 (Today tc-metric-card 완전 동일 구조)
  ────────────────────────────────────────────────────────── */
  function metricCard({ id, title, icon, circleClass, value, unit, grade, clickable }) {
    const mg = metricGrade(grade);
    const infoBtn = clickable
      ? `<button class="df-metric-info-btn" type="button" data-df-info="${id}" aria-label="${esc(title)} 상세">
           <span class="material-symbols-outlined">info</span>
         </button>` : "";
    return `
      <div class="df-metric-card${clickable ? " df-metric-clickable" : ""}" data-df-metric="${id}">
        ${infoBtn}
        <div class="df-metric-icon-circle ${circleClass}">
          <span class="material-symbols-outlined">${icon}</span>
        </div>
        <span class="df-metric-title">${esc(title)}</span>
        <div class="df-metric-value-wrap">
          <span>${esc(String(value))}</span>${unit ? `<i class="df-metric-unit">${esc(unit)}</i>` : ""}
        </div>
        <div class="df-metric-pill ${mg.pillClass}">${esc(mg.text)}</div>
      </div>`;
  }

  /* 조석 카드 (Today tc-tide-card 동일 구조, 2-column span) */
  function tideCardHtml() {
    return `
      <div class="df-metric-card df-tide-card" data-df-metric="tide">
        <div class="df-tide-card-header">
          <button id="dfTideMoreBtn" class="df-tide-more-btn" type="button" aria-label="조석예보 더보기">더보기</button>
        </div>
        <div class="df-tide-graph" aria-label="조석 변화 그래프">
          <svg id="dfTideSvg" viewBox="0 0 360 98" role="img" aria-label="조석 예보 그래프"></svg>
        </div>
      </div>`;
  }

  /* ──────────────────────────────────────────────────────────
     컨디션 요약 (Today Hero Score Card 데이터 규칙 동일)
     선택한 SHORT 슬롯의 condition_score / condition_status / recommendation 사용
  ────────────────────────────────────────────────────────── */
  function getConditionSummary(row) {
    if (!row) {
      return {
        score: null,
        statusText: "데이터 없음",
        chipText: "확인 필요",
        chipClass: "chip-normal",
        captionText: "시간대별 바다 컨디션을 확인하세요."
      };
    }

    const safety = val(row, ["safety_status"]);
    const serverStatus = val(row, ["condition_status", "status"]);
    if (safety === "BLOCK" || serverStatus === "입수 금지" || serverStatus === "입수금지") {
      return {
        score: null,
        statusText: "입수금지",
        chipText: "입수금지",
        chipClass: "chip-bad",
        captionText: "안전 기준을 초과하여 입수가 권장되지 않는 시간대입니다."
      };
    }
    if (safety === "UNKNOWN") {
      return {
        score: null,
        statusText: "확인 필요",
        chipText: "Safety UNKNOWN",
        chipClass: "chip-caution",
        captionText: "해상특보 구역을 확정할 수 없어 입수 가능으로 판단하지 않습니다."
      };
    }

    const sc = scoreNum(row);
    const serverRec = val(row, ["recommendation"]);
    const h = kstHour(row);

    let statusText = serverStatus || scoreLabel(sc);
    let chipText = "적정";
    let chipClass = "chip-normal";
    let captionText = "무난하게 스노클링을 즐길 수 있는 바다 컨디션입니다.";

    if (sc !== null) {
      if (sc >= 80) {
        statusText = statusText || "좋음";
        chipText = sc >= 85 ? "최적" : "추천";
        chipClass = "chip-good";
        captionText = "지금 입수하기 완벽한 날씨와 파도 상태입니다.";
      } else if (sc >= 65) {
        statusText = statusText || "보통";
        chipText = "적정";
        chipClass = "chip-normal";
        captionText = "무난하게 스노클링을 즐길 수 있는 바다 컨디션입니다.";
      } else if (sc >= 50) {
        statusText = statusText || "주의";
        chipText = "주의";
        chipClass = "chip-caution";
        captionText = "바람이나 파도가 다소 있어 안전 장비를 꼭 착용하세요.";
      } else {
        statusText = statusText || "나쁨";
        chipText = "비추천";
        chipClass = "chip-bad";
        captionText = "파도 또는 기상 여건이 불안정하여 주의가 필요합니다.";
      }
    }

    // 야간/해질녘 등 recommendation 오버라이드
    const isNight = serverRec === "야간 비추천" || (h !== 99 && (h < 6 || h >= 19));
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

    return {
      score: sc,
      statusText,
      chipText,
      chipClass,
      captionText
    };
  }

  /* ──────────────────────────────────────────────────────────
     Hero 컨디션 요약 카드 빌더 (Today tc-hero-card 구조 완전 호환)
  ────────────────────────────────────────────────────────── */
  function buildHeroCard(row) {
    const summary = getConditionSummary(row);
    const scoreVal = summary.score !== null ? summary.score : "--";
    const scoreNumVal = summary.score !== null ? Math.max(0, Math.min(100, summary.score)) : 0;
    const maxDash = 264;
    const dashOffset = maxDash - (maxDash * scoreNumVal / 100);
    const strokeColor = scoreNumVal >= 80 ? "#a7f3d0" : scoreNumVal >= 65 ? "#93c5fd" : scoreNumVal >= 50 ? "#fde68a" : "#fca5a5";

    return `
      <div class="tc-hero-card df-hero-card">
        <div class="tc-hero-bg" style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuC9-9ndcwb3HGLypeC_28jBKkjdc11Bn8Xd5_TrvLIZoBPuDPMsRSwjG_o19NJiWodfvsEBGoFkqNQ4Wk46UeqLVgHX6wTq65ySTnPMyPMDubaHfWTE8bCzubyPNz1UtCUaotdjRj0g5SQ_O2hyx6xvYKenyDMsvyS1h25nyoYbf61XgDsGzg7P25C_K-5J4J5iEnAcE20PGnPmKtc2ONey_-90f7quCqoeIhuJCpKhjsuwEart9aOm');"></div>
        <div class="tc-hero-overlay"></div>
        <div class="tc-hero-content">
          <div class="tc-hero-left">
            <div class="tc-hero-status-row">
              <span class="tc-hero-status-text">${esc(summary.statusText)}</span>
              <span class="tc-hero-status-chip ${summary.chipClass}">
                <span class="material-symbols-outlined" style="font-size:12px;">check_circle</span>
                <span>${esc(summary.chipText)}</span>
              </span>
            </div>
            <p class="tc-hero-caption">${esc(summary.captionText)}</p>
          </div>
          <div class="tc-hero-gauge-wrap">
            <svg viewBox="0 0 100 100" class="tc-hero-gauge-svg">
              <circle cx="50" cy="50" r="42" class="tc-hero-gauge-bg"/>
              <circle cx="50" cy="50" r="42" class="tc-hero-gauge-progress"
                      style="stroke-dasharray: 264; stroke-dashoffset: ${dashOffset}; stroke: ${strokeColor};"/>
            </svg>
            <div class="tc-hero-gauge-text">
              <span class="tc-hero-gauge-val">${scoreVal}</span>
              ${summary.score !== null ? `<span class="tc-hero-gauge-unit">점</span>` : ""}
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ──────────────────────────────────────────────────────────
     날씨 카드 (Today tc-weather-card 구조 재사용)
     데이터: SHORT/MID Row 필드만 사용 (fallback 없음)
  ────────────────────────────────────────────────────────── */
  function buildWeatherCard(row, isMid) {
    if (!row) return "";
    const wi = wIcon(row);
    const temp = val(row, ["temperature", "temp"]);
    const tempText = (temp !== null && temp !== undefined && temp !== "" && Number.isFinite(Number(temp))) ? `${Math.round(Number(temp))}°` : "--°";
    const precip = val(row, ["precipitation", "rain_amount"]);
    const precipText = (precip !== null && precip !== undefined && precip !== "" && Number.isFinite(Number(precip)))
      ? (Number(precip) === 0 ? "0 mm" : `${fmt(precip, 1)} mm`) : "-- mm";
    const prob = val(row, ["precipitation_probability", "rain_probability"]);
    const probText = (prob !== null && prob !== undefined && prob !== "" && Number.isFinite(Number(prob))) ? `${Math.round(Number(prob))}%` : "--%";

    // 슬롯 레이블
    const h = kstHour(row);
    const slotLabel = isMid
      ? (h < 12 ? "오전 06~12시" : "오후 12~18시")
      : (h !== 99 ? `${String(h).padStart(2, "0")}:00` : "--:--");

    return `
      <div class="df-weather-card">
        <div class="df-weather-left">
          <div class="df-weather-icon-circle">
            <span class="material-symbols-outlined" style="color:${wi.color}">${wi.icon}</span>
          </div>
          <div class="df-weather-label-wrap">
            <span class="df-weather-label">${esc(wi.label)}</span>
            <span class="df-weather-sub">${esc(slotLabel)}</span>
          </div>
        </div>
        <div class="df-weather-divider"></div>
        <div class="df-weather-right">
          <div class="df-temp-row">
            <span class="df-temp-current">${esc(tempText)}</span>
          </div>
          <div class="df-rain-row">
            <div class="df-rain-item">
              <span class="material-symbols-outlined" style="color:#3b82f6">water_drop</span>
              <span>${esc(precipText)}</span>
            </div>
            <div class="df-rain-item">
              <span class="material-symbols-outlined" style="color:#6366f1">umbrella</span>
              <span>${esc(probText)}</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ──────────────────────────────────────────────────────────
     바다 수치 그리드 (Today renderSquareMetrics 구조 재사용)
     데이터: SHORT/MID Row 필드만 — Today/TODAY_HOURLY fallback 없음
  ────────────────────────────────────────────────────────── */
  function buildMetricsGrid(row, isMid) {
    if (!row) {
      return `<div class="df-empty" style="grid-column:1/-1">슬롯 데이터가 없습니다.</div>`;
    }

    // 유의파고
    const wH = isMid ? waveRange(row) : fmt(val(row, ["wave_height", "significant_wave_height"]), 1);
    const wHn = parseFloat(wH);
    const wHGrade = val(row, ["wave_height_status"])
      || (wH !== "--"
        ? (wHn <= 0.3 ? "좋음" : wHn <= 0.5 ? "보통" : wHn <= 0.8 ? "주의" : "나쁨")
        : "데이터 없음");

    // 수온
    const waterT   = val(row, ["water_temperature", "sea_temperature"]);
    const waterTTxt = fmt(waterT, 1);
    const waterTn   = Number(waterT);
    const waterGrade = val(row, ["water_temperature_status"])
      || (Number.isFinite(waterTn)
        ? (waterTn >= 24 ? "최적 수온" : waterTn >= 20 ? "적정 수온" : waterTn >= 15 ? "보통" : "저수온 주의")
        : "데이터 없음");

    // 파주기
    const wP    = val(row, ["wave_period", "wave_period_seconds"]);
    const wPTxt  = fmt(wP, 1);
    const wPn    = Number(wP);
    const wPGrade = val(row, ["wave_period_status"])
      || (Number.isFinite(wPn)
        ? (wPn >= 10 ? "주의" : wPn >= 7 ? "영향 있음" : "영향 없음")
        : "데이터 없음");

    // 조류 / 유속 — 참고 지표
    const curS    = val(row, ["current_speed", "sea_current_speed"]);
    const curSTxt  = fmt(curS, 2);
    const curGrade = (curSTxt !== "--") ? "참고" : "데이터 없음";

    // 풍속
    const windS    = val(row, ["wind_speed"]);
    const windSTxt  = fmt(windS, 1);
    const windSn    = Number(windS);
    const windGrade = val(row, ["wind_speed_status"])
      || (Number.isFinite(windSn)
        ? (windSn <= 3 ? "좋음" : windSn <= 5 ? "보통" : windSn <= 8 ? "주의" : "나쁨")
        : "데이터 없음");

    // 풍향 — degree 또는 문자열 직접
    const windDirRaw = val(row, ["wind_direction"]);
    const windDeg    = val(row, ["wind_direction_degree"]);
    const windDirTxt = windDirRaw
      || (Number.isFinite(Number(windDeg)) ? degToWindDir(windDeg) : "--");
    const windDirGrade = windDirTxt !== "--" ? "참고" : "데이터 없음";

    // 예상 수중시야 — visibility_score or grade 직접
    const visScore = val(row, ["visibility_score", "underwater_visibility", "visibility"]);
    const visGrade = val(row, ["visibility_grade", "underwater_visibility_grade"])
      || (Number.isFinite(Number(visScore))
        ? (Number(visScore) >= 80 ? "좋음" : Number(visScore) >= 65 ? "양호" : Number(visScore) >= 45 ? "보통" : "나쁨")
        : null);
    const visValue = Number.isFinite(Number(visScore))
      ? `${Math.round(Number(visScore))}점`
      : (visGrade && visGrade !== "데이터 없음" ? visGrade : "--");
    const hasVisData = !!visGrade;

    const cards = [
      metricCard({ id: "wave",      title: "유의파고",    icon: "water",             circleClass: "circle-wave",      value: wH,       unit: wH !== "--" ? "m" : "",      grade: wHGrade }),
      metricCard({ id: "temp",      title: "수온",        icon: "device_thermostat", circleClass: "circle-temp",      value: waterTTxt, unit: waterTTxt !== "--" ? "°C" : "", grade: waterGrade }),
      metricCard({ id: "period",    title: "파주기",      icon: "tsunami",           circleClass: "circle-period",    value: wPTxt,     unit: wPTxt !== "--" ? "초" : "",    grade: wPGrade }),
      metricCard({ id: "current",   title: "조류 / 유속", icon: "swap_calls",        circleClass: "circle-current",   value: curSTxt,   unit: curSTxt !== "--" ? "m/s" : "", grade: curGrade }),
    ];

    if (!isMid) {
      cards.push(
        metricCard({ id: "wind",      title: "풍속",        icon: "air",               circleClass: "circle-wind",      value: windSTxt,  unit: windSTxt !== "--" ? "m/s" : "", grade: windGrade }),
        metricCard({ id: "direction", title: "풍향",        icon: "explore",           circleClass: "circle-direction", value: windDirTxt, unit: "",                            grade: windDirGrade })
      );
    }

    cards.push(
      metricCard({ id: "visibility", title: "예상 수중시야", icon: "visibility",     circleClass: "circle-vis",       value: visValue,  unit: "",                            grade: visGrade || "데이터 없음", clickable: hasVisData })
    );

    return cards.join("");
  }

  /* ──────────────────────────────────────────────────────────
     DOM 생성 (lazy)
  ────────────────────────────────────────────────────────── */
  function ensure() {
    if (_modal) return;
    _modal = document.createElement("div");
    _modal.id = "dailyForecastDetailModal";
    _modal.className = "today-condition-modal";
    _modal.innerHTML = `
      <div class="today-condition-sheet tc-sheet">
        <header class="tc-top-app-bar snorky-detail-header">
          <button class="tc-icon-btn" id="dfBack" aria-label="뒤로가기">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 class="tc-app-title" id="dfTitle">SNORKY 예보</h1>
          <div class="tc-top-app-bar-spacer" aria-hidden="true"></div>
        </header>
        <main class="df-content tc-body">
          <div class="df-title-section">
            <div>
              <h2>SNORKY 예보</h2>
              <p>날짜별 바다 컨디션을 비교해보세요</p>
            </div>
            <div class="df-title-date-range">
              <span class="material-symbols-outlined">calendar_month</span>
              <span id="dfDateRange">+1일 ~ +6일</span>
            </div>
          </div>
          <div class="df-days-section" aria-label="일자 선택">
            <div id="dfDays" class="df-days" role="tablist"></div>
          </div>
          <div id="dfDetail" class="df-detail-wrapper"></div>
        </main>

        <!-- Bottom Sheet -->
        <div id="dfBottomSheetOverlay" class="tc-bottom-sheet-overlay">
          <div class="tc-bottom-sheet">
            <div class="tc-sheet-handle"></div>
            <div class="tc-sheet-head">
              <h3 id="dfSheetTitle">
                <span id="dfSheetIcon" class="material-symbols-outlined">visibility</span>
                <span id="dfSheetTitleText">상세</span>
              </h3>
              <button id="dfSheetClose" class="tc-sheet-close" type="button" aria-label="닫기">×</button>
            </div>
            <div id="dfSheetBody" class="tc-sheet-content"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(_modal);

    _modal.querySelector("#dfBack").onclick = () => close(true);
    _modal.querySelector("#dfSheetClose").onclick = closeSheet;
    _modal.querySelector("#dfBottomSheetOverlay").addEventListener("click", function (e) {
      if (e.target === this) closeSheet();
    });
  }

  function closeSheet() {
    _modal?.querySelector("#dfBottomSheetOverlay")?.classList.remove("open");
  }

  /* ──────────────────────────────────────────────────────────
     날짜 그룹화 및 Day 카드 렌더
  ────────────────────────────────────────────────────────── */
  function render() {
    const kstNow   = new Date(Date.now() + 9 * 3600000);
    const todayStr = kstNow.toISOString().slice(0, 10);

    // SHORT: +1~+3, MID: +4~+6
    // 각 Row는 target_date 기준으로 그룹화
    const shortGroups = {};
    _shortRows.forEach(r => {
      const d = dateOf(r);
      if (d && d > todayStr) (shortGroups[d] = shortGroups[d] || []).push(r);
    });

    const midGroups = {};
    _midRows.forEach(r => {
      const d = dateOf(r);
      if (d && d > todayStr) (midGroups[d] = midGroups[d] || []).push(r);
    });

    // +1~+6 날짜 목록 (오늘 이후 최대 6일)
    const allDates = Array.from(
      new Set([...Object.keys(shortGroups), ...Object.keys(midGroups)])
    ).sort().slice(0, 6);

    // 날짜 없어도 최대 6일 placeholder
    for (let i = 1; i <= 6; i++) {
      const next = new Date(kstNow);
      next.setUTCDate(next.getUTCDate() + i);
      const ds = next.toISOString().slice(0, 10);
      if (!allDates.includes(ds)) allDates.push(ds);
    }
    allDates.sort();
    allDates.splice(6);

    const daysEl   = _modal.querySelector("#dfDays");
    const rangeEl  = _modal.querySelector("#dfDateRange");
    const detailEl = _modal.querySelector("#dfDetail");
    if (!daysEl || !detailEl) return;

    if (rangeEl && allDates.length >= 2) {
      const f = new Date(`${allDates[0]}T00:00:00+09:00`);
      const l = new Date(`${allDates[allDates.length - 1]}T00:00:00+09:00`);
      rangeEl.textContent = `${f.getMonth() + 1}/${f.getDate()} ~ ${l.getMonth() + 1}/${l.getDate()}`;
    }

    const selDate = (_selectedDate && allDates.includes(_selectedDate)) ? _selectedDate : allDates[0];
    _selectedDate = selDate;

    daysEl.innerHTML = allDates.map((d, i) => {
      const offset = i + 1; // +1~+6
      // +1~+3: SHORT, +4~+6: MID
      const rows = offset <= 3 ? (shortGroups[d] || []) : (midGroups[d] || []);
      const dt   = new Date(`${d}T00:00:00+09:00`);
      const p    = dayPill(rows);
      const rep  = rows[0] || {};
      const wi   = wIcon(rep);
      const isSel = d === selDate;

      return `
        <button class="df-day-card${isSel ? " selected" : ""} ${dayScoreCls(rows)}"
                data-date="${esc(d)}" data-offset="${offset}"
                role="tab" aria-selected="${isSel}">
          <span class="df-day-label">${dt.getMonth() + 1}/${dt.getDate()}(${DAY_NAMES[dt.getDay()]})</span>
          <span class="material-symbols-outlined df-day-weather-icon"
                style="color:${isSel ? "#fcd34d" : wi.color}">${wi.icon}</span>
          <div class="df-day-pill ${isSel ? "" : p.cls}">${esc(p.label)}</div>
        </button>`;
    }).join("");

    daysEl.querySelectorAll(".df-day-card").forEach(btn => {
      btn.onclick = () => {
        daysEl.querySelectorAll(".df-day-card").forEach(b => {
          b.classList.remove("selected");
          b.setAttribute("aria-selected", "false");
          const pEl = b.querySelector(".df-day-pill");
          if (pEl) {
            const off2 = Number(b.dataset.offset);
            const rows2 = off2 <= 3 ? (shortGroups[b.dataset.date] || []) : (midGroups[b.dataset.date] || []);
            const p2 = dayPill(rows2);
            pEl.className = `df-day-pill ${p2.cls}`;
            pEl.textContent = p2.label;
          }
        });
        btn.classList.add("selected");
        btn.setAttribute("aria-selected", "true");
        const pEl2 = btn.querySelector(".df-day-pill");
        if (pEl2) {
          pEl2.className = "df-day-pill";
          const offSelf = Number(btn.dataset.offset);
          const rowsSelf = offSelf <= 3 ? (shortGroups[btn.dataset.date] || []) : (midGroups[btn.dataset.date] || []);
          pEl2.textContent = dayPill(rowsSelf).label;
        }
        _selectedDate = btn.dataset.date;
        _selectedSlot = null;
        btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        const off = Number(btn.dataset.offset);
        const rows = off <= 3 ? (shortGroups[_selectedDate] || []) : (midGroups[_selectedDate] || []);
        renderDetail(_selectedDate, rows, off, off <= 3 ? "short" : "mid");
      };
    });

    const initOffset = allDates.indexOf(selDate) + 1;
    const initRows   = initOffset <= 3 ? (shortGroups[selDate] || []) : (midGroups[selDate] || []);
    _selectedSlot = null;
    renderDetail(selDate, initRows, initOffset, initOffset <= 3 ? "short" : "mid");

    // 초기 렌더 시 선택된 날짜 카드가 화면에 보이도록 스크롤 이동
    const selectedBtn = daysEl.querySelector(`.df-day-card[data-date="${selDate}"]`);
    if (selectedBtn) {
      setTimeout(() => {
        selectedBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }, 50);
    }
  }

  /* ──────────────────────────────────────────────────────────
     renderDetail — 단기/중기 분기
  ────────────────────────────────────────────────────────── */
  function renderDetail(date, rows, offset, mode) {
    const detailEl = _modal?.querySelector("#dfDetail");
    if (!detailEl) return;

    if (!rows.length) {
      detailEl.innerHTML = `
        <div class="df-empty-card">
          <span class="material-symbols-outlined">info</span>
          <p>+${offset}일 예보 데이터가 아직 등록되지 않았습니다.</p>
        </div>`;
      return;
    }

    const sorted = [...rows].sort((a, b) => kstHour(a) - kstHour(b));
    if (mode === "short") renderShortDetail(detailEl, sorted, date, offset);
    else                  renderMidDetail(detailEl, sorted, date, offset);
  }

  /* ──────────────────────────────────────────────────────────
     SHORT (+1~+3): 시간 미니카드(03~21시) + Hero 컨디션 카드 + 날씨 카드 + 바다 수치
  ────────────────────────────────────────────────────────── */
  function renderShortDetail(container, rows, date, offset) {
    // 유효 슬롯 필터: SHORT Row의 KST 시각이 03,06,09,12,15,18,21 중 하나
    const slots = rows.filter(r => SHORT_VALID_HOURS.has(kstHour(r)));
    // 슬롯 없으면 전체 row 사용 (데이터는 있으나 슬롯 매핑 실패한 경우 방어)
    const display = slots.length ? slots : rows;

    let defSlot = null;
    if (_selectedSlot && display.includes(_selectedSlot)) {
      defSlot = _selectedSlot;
    } else if (_targetTime) {
      const tHour = Number(String(_targetTime).split(":")[0]);
      if (Number.isFinite(tHour)) {
        defSlot = [...display].sort((a, b) => Math.abs(kstHour(a) - tHour) - Math.abs(kstHour(b) - tHour))[0];
      }
    }
    if (!defSlot) {
      defSlot = display.find(r => kstHour(r) === 12) || display[0];
    }
    _selectedSlot = defSlot;

    const slotsHtml = display.map(r => {
      const h   = kstHour(r);
      const tLbl = h !== 99 ? `${String(h).padStart(2, "0")}시` : "--시";
      const sc  = scoreNum(r);
      const p   = slotPill(r);
      const wi  = wIcon(r);
      const temp = val(r, ["temperature", "temp"]);
      const tempText = (temp !== null && temp !== undefined && temp !== "" && Number.isFinite(Number(temp))) ? `${Math.round(Number(temp))}` : "--";
      const precip = val(r, ["precipitation", "rain_amount"]);
      const rainAmount = (precip !== null && precip !== undefined && precip !== "" && Number.isFinite(Number(precip)))
        ? (Number(precip) === 0 ? "0mm" : `${fmt(precip, 1)}mm`) : "--mm";
      const prob = val(r, ["precipitation_probability", "rain_probability"]);
      const rainProb = (prob !== null && prob !== undefined && prob !== "" && Number.isFinite(Number(prob))) ? `${Math.round(Number(prob))}%` : "--%";
      const isSel = r === _selectedSlot;

      return `
        <button class="tc-hour-card df-time-card${isSel ? " active selected" : ""}" data-hour="${h}">
          <span class="tc-hour-time df-time-label">${esc(tLbl)}</span>
          <div class="tc-hour-mid df-time-mid">
            <span class="material-symbols-outlined df-time-weather-icon" style="color:${isSel ? "#fcd34d" : wi.color}; font-size:20px;">${wi.icon}</span>
            <span class="tc-hour-temp df-time-temp">${tempText}°</span>
          </div>
          <div class="tc-hour-rain df-time-rain" aria-label="강수예보">☔ ${rainAmount} · ${rainProb}</div>
          <div class="tc-hour-badge df-time-pill ${isSel ? "" : p.cls}">
            <span>${sc !== null ? sc : "--"}</span>
            <span class="tc-hour-badge-divider df-time-pill-divider"></span>
            <span>${esc(p.label)}</span>
          </div>
        </button>`;
    }).join("");

    const h0 = _selectedSlot ? kstHour(_selectedSlot) : null;
    const refTime = h0 !== null && h0 !== 99 ? `${String(h0).padStart(2, "0")}:00 기준` : "";

    container.innerHTML = `
      <div class="df-section-title">
        <h3>시간별 예보</h3>
      </div>
      <div class="df-time-section">
        <div class="df-time-slots-scroll">${slotsHtml}</div>
      </div>

      <!-- 선택 시간 컨디션 요약 카드 (Hero Score Card) -->
      <div class="df-hero-section" id="dfHeroSection">
        ${buildHeroCard(_selectedSlot)}
      </div>

      <div class="df-metrics-section">
        <div class="df-metrics-header">
          <h3>바다 수치</h3>
          <div id="dfMetricsRefBadge" class="df-metrics-ref-badge" role="button" tabindex="0">
            <span>기상 데이터 출처 및 기준시각</span>
            <span class="material-symbols-outlined">info</span>
          </div>
        </div>
        <div id="dfMetricsGrid" class="df-metrics-grid">
          ${buildMetricsGrid(_selectedSlot, false)}
          ${tideCardHtml()}
        </div>
      </div>`;

    // 조석 그래프 — 선택 날짜 기준
    const tideEvents = getTideEventsForDate(date);
    renderTideGraph(container.querySelector("#dfTideSvg"), tideEvents, false);
    if (!tideEvents && _point) {
      fetchTideEventsForDate(date, _point).then(events => {
        if (events && _selectedDate === date) {
          const svg = container.querySelector("#dfTideSvg");
          if (svg) renderTideGraph(svg, events, false);
        }
      });
    }
    bindTideAndVisibility(container, date, false);

    // 시간 카드 클릭
    container.querySelectorAll(".df-time-card").forEach((btn, idx) => {
      btn.onclick = () => {
        container.querySelectorAll(".df-time-card").forEach(b => {
          b.classList.remove("selected", "active");
        });
        btn.classList.add("selected", "active");
        btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        _selectedSlot = display[idx];
        updateWeatherAndMetrics(container, _selectedSlot, false, date);
      };
    });

    // 초기 선택된 시간 카드가 화면에 보이도록 스크롤 이동
    if (_selectedSlot) {
      const initCard = container.querySelector(`.df-time-card[data-hour="${kstHour(_selectedSlot)}"]`);
      if (initCard) {
        setTimeout(() => {
          initCard.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }, 50);
      }
    }
  }

  /* ──────────────────────────────────────────────────────────
     MID (+4~+6): 날씨 카드 + 오전/오후 카드 + 바다 수치
  ────────────────────────────────────────────────────────── */
  function getMidPopText(row, isAM = true) {
    if (!row) return "강수확률 --%";
    const raw = val(row, [
      "rain_probability",
      isAM ? "rnStAm" : "rnStPm",
      isAM ? "pop_am" : "pop_pm",
      "precipitation_probability",
      "pop",
      "rn_st",
      "rnSt"
    ]);
    if (raw !== null && raw !== undefined && raw !== "" && Number.isFinite(Number(raw))) {
      return `강수확률 ${Number(raw)}%`;
    }
    return "강수확률 --%";
  }

  function getMidDayTempSubtext(rows) {
    if (!rows || !rows.length) return "";
    const rep = rows[0] || {};
    const minT = val(rep, ["ta_min", "taMin", "min_temp"]);
    const maxT = val(rep, ["ta_max", "taMax", "max_temp"]);
    const minObj = rep.min_max_metrics?.temperature?.min;
    const maxObj = rep.min_max_metrics?.temperature?.max;
    const tMin = minT ?? minObj;
    const tMax = maxT ?? maxObj;

    const hasMin = tMin !== null && tMin !== undefined && tMin !== "" && Number.isFinite(Number(tMin));
    const hasMax = tMax !== null && tMax !== undefined && tMax !== "" && Number.isFinite(Number(tMax));

    if (hasMin && hasMax) {
      return `최저 ${Math.round(Number(tMin))}° · 최고 ${Math.round(Number(tMax))}°`;
    }
    if (hasMin) return `최저 ${Math.round(Number(tMin))}°`;
    if (hasMax) return `최고 ${Math.round(Number(tMax))}°`;
    return "";
  }

  function renderMidDetail(container, rows, date, offset) {
    // KST hour < 12 → 오전, >= 12 → 오후
    const amRows = rows.filter(r => kstHour(r) < 12);
    const pmRows = rows.filter(r => kstHour(r) >= 12);
    const repAM  = amRows[0] || null;
    const repPM  = pmRows[0] || null;

    if (!_selectedSlot || (!amRows.includes(_selectedSlot) && !pmRows.includes(_selectedSlot))) {
      if (_targetTime) {
        const tHour = Number(String(_targetTime).split(":")[0]);
        if (Number.isFinite(tHour)) {
          _selectedSlot = tHour < 12 ? (repAM || repPM) : (repPM || repAM);
        } else {
          _selectedSlot = repAM || repPM;
        }
      } else {
        _selectedSlot = repAM || repPM;
      }
    }
    const isAMSel = amRows.includes(_selectedSlot) || (!repPM && repAM);

    function midBtn(period, repRow, isSel) {
      const isAM = period === "am";
      const periodName = isAM ? "오전" : "오후";
      const wi = wIcon(repRow, isAM);
      const popText = getMidPopText(repRow, isAM);
      const p = slotPill(repRow);

      return `
        <button class="df-mid-card${isSel ? " selected" : ""}" data-period="${period}">
          <div class="df-mid-card-head">
            <span class="material-symbols-outlined df-mid-period-icon" style="color: ${isSel ? "#fcd34d" : wi.color}">${wi.icon}</span>
            <span class="df-mid-period-label">${periodName}</span>
          </div>
          <div class="df-mid-card-body">
            <div class="df-mid-pop-line">${esc(popText)}</div>
            <div class="df-mid-card-pill ${p.cls}">${esc(p.label)}</div>
          </div>
        </button>`;
    }

    const initRow = isAMSel ? repAM : repPM;
    const dayTempSub = getMidDayTempSubtext(rows);

    container.innerHTML = `
      <div class="df-section-title">
        <h3>시간별 컨디션</h3>
        ${dayTempSub ? `<span class="df-mid-section-sub">${esc(dayTempSub)}</span>` : ""}
      </div>
      <div class="df-mid-cards" id="dfMidCards">
        ${midBtn("am", repAM, isAMSel)}
        ${midBtn("pm", repPM, !isAMSel)}
      </div>

      <div class="df-metrics-section">
        <div class="df-metrics-header">
          <h3>바다 수치</h3>
          <div id="dfMetricsRefBadge" class="df-metrics-ref-badge" role="button" tabindex="0">
            <span>기상 데이터 출처 및 기준시각</span>
            <span class="material-symbols-outlined">info</span>
          </div>
        </div>
        <div id="dfMetricsGrid" class="df-metrics-grid">
          ${buildMetricsGrid(initRow, true)}
          ${tideCardHtml()}
        </div>
      </div>`;

    // 조석 그래프 — 선택 날짜 기준
    const tideEvents = getTideEventsForDate(date);
    renderTideGraph(container.querySelector("#dfTideSvg"), tideEvents, false);
    if (!tideEvents && _point) {
      fetchTideEventsForDate(date, _point).then(events => {
        if (events && _selectedDate === date) {
          const svg = container.querySelector("#dfTideSvg");
          if (svg) renderTideGraph(svg, events, false);
        }
      });
    }
    bindTideAndVisibility(container, date, true);

    // 오전/오후 카드 클릭
    container.querySelectorAll(".df-mid-card").forEach(btn => {
      btn.onclick = () => {
        container.querySelectorAll(".df-mid-card").forEach(b => {
          b.classList.remove("selected");
          const per = b.dataset.period;
          const r = per === "am" ? repAM : repPM;
          const wi = wIcon(r, per === "am");
          const iconEl = b.querySelector(".df-mid-period-icon");
          if (iconEl) iconEl.style.color = wi.color;
        });
        btn.classList.add("selected");
        const isAM = btn.dataset.period === "am";
        const iconEl = btn.querySelector(".df-mid-period-icon");
        if (iconEl) iconEl.style.color = "#fcd34d";

        _selectedSlot = isAM ? repAM : repPM;

        updateWeatherAndMetrics(container, _selectedSlot, true, date);
      };
    });
  }

  /* 날씨 카드 + Hero 컨디션 요약 카드 + 바다 수치 업데이트 (공통) */
  function updateWeatherAndMetrics(container, slot, isMid, date) {
    const heroSection = container.querySelector("#dfHeroSection");
    if (heroSection && !isMid) {
      heroSection.innerHTML = buildHeroCard(slot);
    }

    const wSection = container.querySelector("#dfWeatherSection");
    if (wSection && !isMid) {
      wSection.innerHTML = buildWeatherCard(slot, isMid);
    }

    const grid = container.querySelector("#dfMetricsGrid");
    if (grid) {
      grid.innerHTML = buildMetricsGrid(slot, isMid) + tideCardHtml();
      // 조석은 날짜 기준 (슬롯 변경 시에도 동일 날짜)
      const tideEvents = getTideEventsForDate(date);
      renderTideGraph(grid.querySelector("#dfTideSvg"), tideEvents, false);
      if (!tideEvents && _point) {
        fetchTideEventsForDate(date, _point).then(events => {
          if (events && _selectedDate === date) {
            const svg = grid.querySelector("#dfTideSvg");
            if (svg) renderTideGraph(svg, events, false);
          }
        });
      }
      bindTideAndVisibility({ querySelector: s => grid.querySelector(s), querySelectorAll: s => grid.querySelectorAll(s) }, date, isMid);
    }
  }

  /* 조석 더보기 + 수중시야 + 데이터 출처 클릭 바인딩 */
  function bindTideAndVisibility(scope, date, isMid = false) {
    scope.querySelector?.("#dfTideMoreBtn")?.addEventListener("click", e => {
      e.stopPropagation();
      openTideSheet(date);
    });
    scope.querySelectorAll?.("[data-df-info]")?.forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        if (btn.dataset.dfInfo === "visibility") openVisibilitySheet(_selectedSlot);
      });
    });
    const visCard = scope.querySelector?.('[data-df-metric="visibility"]');
    if (visCard) {
      visCard.addEventListener("click", e => {
        if (e.target.closest("[data-df-info]")) return;
        openVisibilitySheet(_selectedSlot);
      });
    }
    const refBadge = scope.querySelector?.(".df-metrics-ref-badge");
    if (refBadge) {
      refBadge.style.cursor = "pointer";
      refBadge.addEventListener("click", e => {
        e.stopPropagation();
        openSourceSheet(date, isMid);
      });
    }
  }

  /* ──────────────────────────────────────────────────────────
     Bottom Sheet: 예상 수중시야
  ────────────────────────────────────────────────────────── */
    function openVisibilitySheet(row) {
    if (!row) return;
    const visScore = val(row, ["visibility_score", "underwater_visibility_score", "underwater_visibility", "visibility"]);
    const visGrade = val(row, ["visibility_grade", "underwater_visibility_grade"])
      || (Number.isFinite(Number(visScore))
        ? (Number(visScore) >= 80 ? "좋음" : Number(visScore) >= 65 ? "양호" : Number(visScore) >= 45 ? "보통" : "나쁨")
        : "확인 필요");

    // 1. 최근 파도·강수: 영향 {없음/낮음/보통/큼} + 설명문
    const baseScore = Number(val(row, ["base_visibility_score", "base_score"]));
    const baseGrade = val(row, ["base_visibility_grade"])
      || (Number.isFinite(baseScore) ? (baseScore >= 80 ? "좋음" : baseScore >= 65 ? "양호" : baseScore >= 45 ? "보통" : "나쁨") : visGrade);

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
    const visual = val(row, ["visual_condition"]);
    const pType = Number(val(row, ["precipitation_type", "pty"]) ?? 0);
    const precip = Number(val(row, ["precipitation", "rn1"]) ?? 0);
    const sky = Number(val(row, ["sky_code", "sky"]) ?? 1);
    const penalty = Number(val(row, ["visual_condition_penalty"]) ?? 0);

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
    const h = kstHour(row);
    const lightState = visual?.lightState;
    const isNight = lightState === "NIGHT" || (h !== 99 && (h < 6 || h >= 19));
    const isSunsetOrDawn = lightState === "SUNSET_EFFECT" || lightState === "DAWN" || (h !== 99 && ((h >= 6 && h < 8) || (h >= 17 && h < 19)));

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

    const timeLabel = h !== 99 ? `${String(h).padStart(2, "0")}시` : "";

    const icon = _modal.querySelector("#dfSheetIcon");
    const titleText = _modal.querySelector("#dfSheetTitleText");
    const body = _modal.querySelector("#dfSheetBody");
    if (icon) icon.textContent = "visibility";
    if (titleText) titleText.textContent = `예상 수중시야 상세${timeLabel ? ` (${timeLabel})` : ""}`;
    if (body) {
      body.innerHTML = `
        <div class="tc-sheet-score-card">
          <div>
            <div class="tc-sheet-score-val">${esc(visGrade)}</div>
            <div class="tc-sheet-score-label">최종 예상 수중시야</div>
          </div>
          <span class="material-symbols-outlined" style="font-size:36px;color:#059669">scuba_diving</span>
        </div>
        <div class="tc-sheet-factors">
          <div class="tc-sheet-factor-item">
            <div class="tc-sheet-factor-head">
              <span class="tc-sheet-factor-title">최근 파도·강수</span>
              <span class="tc-sheet-factor-val">${esc(marineImpact)}</span>
            </div>
            <div class="tc-sheet-factor-desc">${esc(marineDesc)}</div>
          </div>

          <div class="tc-sheet-factor-item">
            <div class="tc-sheet-factor-head">
              <span class="tc-sheet-factor-title">현재 날씨</span>
              <span class="tc-sheet-factor-val">${esc(weatherImpact)}</span>
            </div>
            <div class="tc-sheet-factor-desc">${esc(weatherDesc)}</div>
          </div>

          <div class="tc-sheet-factor-item">
            <div class="tc-sheet-factor-head">
              <span class="tc-sheet-factor-title">자연광</span>
              <span class="tc-sheet-factor-val">${esc(lightStatus)}</span>
            </div>
            <div class="tc-sheet-factor-desc">${esc(lightDesc)}</div>
          </div>

          <div class="tc-sheet-factor-item">
            <div class="tc-sheet-factor-head">
              <span class="tc-sheet-factor-title">최종 예상 수중시야</span>
              <span class="tc-sheet-factor-val tc-sheet-factor-highlight">${esc(visGrade)}</span>
            </div>
          </div>
        </div>`;
    }
    _modal.querySelector("#dfBottomSheetOverlay")?.classList.add("open");
  }

  /* ──────────────────────────────────────────────────────────
     Bottom Sheet: 조석예보 (선택 날짜 기준)
  ────────────────────────────────────────────────────────── */
  function openTideSheet(date) {
    const icon = _modal.querySelector("#dfSheetIcon");
    const titleText = _modal.querySelector("#dfSheetTitleText");
    const body = _modal.querySelector("#dfSheetBody");
    if (icon) icon.textContent = "waves";
    if (titleText) titleText.textContent = "조석예보";
    if (!body) return;

    const forecastTimeText = date ? `${date} 00시 기준` : "--";

    body.innerHTML = `
      <div class="tc-tide-sheet-subinfo">국립해양조사원 · ${esc(forecastTimeText)}</div>
      <div class="tc-tide-modal-card">
        <div class="tc-tide-modal-graph" aria-label="조석 변화 확대 그래프">
          <svg id="dfTideModalSvg" viewBox="0 0 340 180" preserveAspectRatio="none"></svg>
        </div>
      </div>`;

    const modalSvg = body.querySelector("#dfTideModalSvg");
    const tideEvents = getTideEventsForDate(date);
    renderTideGraph(modalSvg, tideEvents, true);
    if (!tideEvents && _point) {
      fetchTideEventsForDate(date, _point).then(events => {
        if (events) {
          const freshSvg = body.querySelector("#dfTideModalSvg");
          if (freshSvg) renderTideGraph(freshSvg, events, true);
        }
      });
    }

    _modal.querySelector("#dfBottomSheetOverlay")?.classList.add("open");
  }

  /* ──────────────────────────────────────────────────────────
     Bottom Sheet: 데이터 출처 및 기준시각
  ────────────────────────────────────────────────────────── */
  function openSourceSheet(date, isMid = false) {
    const icon = _modal.querySelector("#dfSheetIcon");
    const titleText = _modal.querySelector("#dfSheetTitleText");
    const body = _modal.querySelector("#dfSheetBody");
    if (icon) icon.textContent = "info";
    if (titleText) titleText.textContent = "데이터 출처 및 기준시각";
    if (!body) return;

    const pointName = _point?.name || (Array.isArray(_point) ? _point[0] : "선택된 포인트");
    const slot = _selectedSlot || {};

    let sourcesHtml = "";
    if (isMid) {
      // +4~+6 MID
      const tmFc = String(val(slot, ["source_tm_fc", "tm_fc", "kma_tm_fc"]) || "");
      let kmaMidTimeText = "--";
      if (tmFc.length === 12) {
        kmaMidTimeText = `${tmFc.slice(0, 4)}-${tmFc.slice(4, 6)}-${tmFc.slice(6, 8)} ${tmFc.slice(8, 10)}:${tmFc.slice(10, 12)} 발표`;
      } else if (slot.evaluated_at) {
        kmaMidTimeText = `${String(slot.evaluated_at).slice(0, 10)} 06:00 발표`;
      }

      const marineFetched = val(slot, ["evaluated_at", "marine_fetched_at", "fetched_at"]);
      const marineTimeText = marineFetched ? `${String(marineFetched).slice(0, 16).replace("T", " ")} 기준` : (date ? `${date} 00:00 기준` : "--");
      const khoaTimeText = date ? `${date} 00시 기준` : "--";

      sourcesHtml = `
        <div class="tc-sheet-factor-item">
          <span class="tc-sheet-factor-title">기상청 중기예보</span>
          <span class="tc-sheet-factor-val">${esc(kmaMidTimeText)}</span>
        </div>
        <div class="tc-sheet-factor-item">
          <span class="tc-sheet-factor-title">Open-Meteo Marine</span>
          <span class="tc-sheet-factor-val">${esc(marineTimeText)}</span>
        </div>
        <div class="tc-sheet-factor-item">
          <span class="tc-sheet-factor-title">KHOA 조석예보</span>
          <span class="tc-sheet-factor-val">${esc(khoaTimeText)}</span>
        </div>
      `;
    } else {
      // +1~+3 SHORT
      const kmaFetched = val(slot, ["kma_fetched_at", "evaluated_at"]);
      const kmaTimeText = kmaFetched ? `${String(kmaFetched).slice(0, 10)} 05:00 발표` : (date ? `${date} 05:00 발표` : "--");

      const marineFetched = val(slot, ["evaluated_at", "fetched_at"]);
      const marineTimeText = marineFetched ? `${String(marineFetched).slice(0, 16).replace("T", " ")} 기준` : (date ? `${date} 00:00 기준` : "--");

      const kasiDateText = date ? `${date} 기준` : "--";
      const khoaTimeText = date ? `${date} 00시 기준` : "--";

      sourcesHtml = `
        <div class="tc-sheet-factor-item">
          <span class="tc-sheet-factor-title">기상청 단기예보</span>
          <span class="tc-sheet-factor-val">${esc(kmaTimeText)}</span>
        </div>
        <div class="tc-sheet-factor-item">
          <span class="tc-sheet-factor-title">Open-Meteo Marine</span>
          <span class="tc-sheet-factor-val">${esc(marineTimeText)}</span>
        </div>
        <div class="tc-sheet-factor-item">
          <span class="tc-sheet-factor-title">KASI 일출·일몰</span>
          <span class="tc-sheet-factor-val">${esc(kasiDateText)}</span>
        </div>
        <div class="tc-sheet-factor-item">
          <span class="tc-sheet-factor-title">KHOA 조석예보</span>
          <span class="tc-sheet-factor-val">${esc(khoaTimeText)}</span>
        </div>
      `;
    }

    body.innerHTML = `
      <div class="tc-sheet-factors" style="background:#ffffff;">
        <strong style="font-size:14px;color:#003e7a;margin-bottom:2px;">📍 ${esc(pointName)} 데이터 출처 및 기준시각</strong>
        <div style="font-size:13px;color:#475569;line-height:1.55;padding:8px 0 10px;border-bottom:1px dashed #e2e8f0;word-break:keep-all;">
          기상청·해양 수치예보 모델 및 공공 데이터를 기반으로 분석한 정보입니다.
        </div>
        ${sourcesHtml}
      </div>

      <div class="tc-sheet-desc-box">
        ℹ️ <b>안내사항</b>: 본 서비스의 해양 및 기상 수치는 기상청과 공공 해양 수치예보 모델을 기반으로 계산된 예보 기반 예측 데이터입니다. 국지적인 지형 및 조류에 따라 현장 상황이 다를 수 있으므로 입수 전 반드시 안전 수칙과 현장 표지를 확인하시기 바랍니다.
      </div>
    `;

    _modal.querySelector("#dfBottomSheetOverlay")?.classList.add("open");
  }

  /* ──────────────────────────────────────────────────────────
     open(point, targetDate, targetTime)
  ────────────────────────────────────────────────────────── */
  async function open(point, targetDate = null, targetTime = null) {
    ensure();
    _point = point || window.spot;
    if (!_point) return;

    _modal.querySelector("#dfTitle").textContent = _point.name || "SNORKY 예보";

    _modal.style.display = "flex";
    _modal.classList.add("open");
    document.body.style.overflow = "hidden";
    _analysisTransition?.cancel();
    const entryAnalysis = window.SNORKYConditionAnalysis?.start(
      _modal.querySelector(".today-condition-sheet")
    ) || null;
    _analysisTransition = entryAnalysis;

    const pm = document.getElementById("pointModal");
    if (pm?.classList.contains("open")) pm.style.visibility = "hidden";

    if (!_historyActive) {
      history.pushState({ ...history.state, snorkyDailyForecast: true }, "");
      _historyActive = true;
    }

    // 로딩 표시
    const daysEl = _modal.querySelector("#dfDays");
    const detailEl = _modal.querySelector("#dfDetail");
    if (daysEl) daysEl.innerHTML = '<div class="df-loading">예보 데이터 불러오는 중...</div>';
    if (detailEl) detailEl.innerHTML = "";

    // Supabase 준비 대기
    if (_point.isCustomSpot !== true && !window.snorkySupabase && !window.getSnorkySupabase) {
      await new Promise(resolve => {
        const t = setTimeout(resolve, 2000);
        window.addEventListener("snorky:supabase-ready", () => { clearTimeout(t); resolve(); }, { once: true });
      });
    }

    const reader = window.SNORKYEvaluationResults;
    const id = String(_point.supabaseId || _point.id || "");

    // SHORT, MID 로드 — Today/TODAY_HOURLY 호출 없음
    let loadFailed = false;
    try {
      const [short, mid] = await Promise.all([
        reader?.loadShortResultsForPoint ? reader.loadShortResultsForPoint(id) : Promise.resolve([]),
        reader?.loadMidResultsForPoint   ? reader.loadMidResultsForPoint(id)   : Promise.resolve([]),
      ]);
      _shortRows = Array.isArray(short) ? short : [];
      _midRows   = Array.isArray(mid)   ? mid   : [];
    } catch (err) {
      console.warn("[SNORKYDailyForecast] 데이터 로드 오류:", err);
      loadFailed = true;
      _shortRows = [];
      _midRows   = [];
    }

    // 조석 캐시 초기화 (새 포인트 열람마다 재조회)
    _tideCache = {};
    _selectedDate = targetDate || null;
    _selectedSlot = null;
    _targetTime = targetTime || null;

    render();
    if (loadFailed || (!_shortRows.length && !_midRows.length)) entryAnalysis?.fail();
    else entryAnalysis?.complete();

    // 선택 날짜 조석 비동기 로드 (로드 후 그래프 자동 업데이트)
    if (_selectedDate) {
      fetchTideEventsForDate(_selectedDate, _point).then(events => {
        if (events && _selectedDate) {
          const svg = _modal?.querySelector("#dfTideSvg");
          if (svg) renderTideGraph(svg, events, false);
        }
      });
    }
  }

  /* ──────────────────────────────────────────────────────────
     close(back)
  ────────────────────────────────────────────────────────── */
  function close(back) {
    if (!_modal) return;
    _analysisTransition?.cancel();
    _analysisTransition = null;
    _modal.classList.remove("open");
    _modal.style.display = "none";

    const pm = document.getElementById("pointModal");
    if (pm?.classList.contains("open")) pm.style.visibility = "visible";
    document.body.style.overflow = pm?.classList.contains("open") ? "hidden" : "";

    if (back && _historyActive) { _historyActive = false; history.back(); }
    else _historyActive = false;
  }

  window.addEventListener("popstate", () => {
    if (_modal && _modal.classList.contains("open")) close(false);
  });

  /* ──────────────────────────────────────────────────────────
     Public API
  ────────────────────────────────────────────────────────── */
  window.SNORKYDailyForecast = Object.freeze({
    open,
    close,
    isOpen: () => Boolean(_modal && _modal.classList.contains("open")),
  });
})();
