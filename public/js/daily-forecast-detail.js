/**
 * SNORKY 3.0: 6-Day Condition Forecast Detail View
 * ──────────────────────────────────────────────────
 * Visual Design : Stitch Screen 55edd5aea1d34bebbd53cbb720177c21
 * Data / Logic  : SNORKY V1.5 (데이터 구조, 표시 규칙 우선)
 *
 * Screen Structure:
 *   [Header: arrow_back | 포인트명 | favorite]
 *   [Title: "6일 컨디션" + 날짜 범위]
 *   [Day Cards: 85×85 horizontal scroll (+1~+6)]
 *   [Selected Day Detail]
 *     Short (+1~+3): 시간 미니카드 (85×85 horizontal) + Bento 상세
 *     Mid (+4~+6)  : 오전/오후 와이드 카드 2개 + Bento 상세
 *
 * Data Rules:
 *   - 오늘(KST) 제외, +1~+6일만 표시
 *   - Short: 00/03/06/09/12/15/18/21시 슬롯
 *   - Mid: 오전 06~12 / 오후 12~18 (자연광 보정·파향 금지)
 *   - Bento 항목: 유의파고·파주기·풍속·기온·수온·강수량·강수확률·구름량·해류속도·수중시야
 *   - 파향·해류방향 표시 금지
 *   - 누락값 → '--'
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
  let _modal        = null;
  let _point        = null;
  let _historyActive = false;
  let _shortRows    = [];
  let _midRows      = [];
  let _selectedDate = null;  // YYYY-MM-DD
  let _selectedSlot = null;  // row object of selected time/mid slot

  const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

  /* ──────────────────────────────────────────────────────────
     Utilities
  ────────────────────────────────────────────────────────── */
  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  /** 복수 키에서 row → metrics → min_max_metrics → display_ranges 순으로 값 추출 */
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

  function fmt(v, d = 1) {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(d) : "--";
  }

  function fmtInt(v) {
    const n = Number(v);
    return Number.isFinite(n) ? String(Math.round(n)) : "--";
  }

  /** YYYY-MM-DD (KST) 추출 */
  function dateOf(r) {
    const raw = String(val(r, ["target_date", "date", "forecast_date"]) || "");
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const ts = String(val(r, ["period_start", "timestamp"]) || "");
    if (ts) {
      const dt = new Date(ts);
      if (!isNaN(dt.getTime())) {
        const kst = new Date(dt.getTime() + (9 * 3600 - dt.getTimezoneOffset() * 60) * 1000);
        return kst.toISOString().slice(0, 10);
      }
    }
    return "";
  }

  /** KST 시각(0~23) */
  function kstHour(r) {
    const ts = String(val(r, ["period_start", "forecast_time", "timestamp", "time"]) || "");
    if (!ts) return 99;
    if (/^\d{1,2}$/.test(ts)) return Number(ts);
    if (ts.includes("T") || ts.includes("Z") || ts.includes("+")) {
      const dt = new Date(ts);
      if (!isNaN(dt.getTime())) {
        const kst = new Date(dt.getTime() + (9 * 3600 - dt.getTimezoneOffset() * 60) * 1000);
        return kst.getHours();
      }
    }
    return (ts.match(/T?(\d{2}):/) || [])[1] !== undefined
      ? Number((ts.match(/T?(\d{2}):/))[1]) : 99;
  }

  function scoreNum(r) {
    const n = Number(val(r, ["condition_score", "score"]));
    return Number.isFinite(n) ? n : null;
  }

  function avgScore(rows) {
    const nums = rows.map(r => scoreNum(r)).filter(s => s !== null);
    return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
  }

  /* Score CSS class */
  function scoreCls(sc) {
    if (sc === null || !Number.isFinite(sc)) return "score-none";
    if (sc >= 80) return "score-good";
    if (sc >= 50) return "score-normal";
    if (sc >= 30) return "score-caution";
    return "score-bad";
  }

  /* Status text from score */
  function statusText(sc) {
    if (sc === null || !Number.isFinite(sc)) return "데이터 없음";
    if (sc >= 80) return "매우좋음";
    if (sc >= 65) return "좋음";
    if (sc >= 50) return "보통";
    if (sc >= 30) return "주의";
    return "비추천";
  }

  /* Pill CSS class + label */
  function pill(txt) {
    const t = String(txt || "").trim();
    if (!t || t === "데이터 없음") return { cls: "pill-neutral", label: "데이터 없음" };
    if (t.includes("매우좋음") || t.includes("매우 좋음") || t.includes("최상")) return { cls: "pill-good", label: "매우좋음" };
    if (t.includes("좋음") || t.includes("최적") || t.includes("추천")) return { cls: "pill-good", label: "좋음" };
    if (t.includes("보통") || t.includes("적정")) return { cls: "pill-normal", label: "보통" };
    if (t.includes("주의") || t.includes("차가움") || t.includes("흐림")) return { cls: "pill-caution", label: "주의" };
    if (t.includes("입수금지") || t.includes("입수 금지")) return { cls: "pill-bad", label: "입수금지" };
    if (t.includes("나쁨") || t.includes("비추천") || t.includes("위험") || t.includes("제한")) return { cls: "pill-bad", label: "비추천" };
    // 미분류 확인 필요 상태 — 점수 기반 fallback이 없으면 중립 표시
    if (t.includes("확인") || t.includes("미확인") || t.includes("unknown") || t.includes("Unknown")) return { cls: "pill-neutral", label: "확인 필요" };
    return { cls: "pill-neutral", label: t.length > 6 ? t.slice(0, 6) + "…" : t };
  }

  /* Bento pill CSS class */
  function bentoGrade(label) {
    const t = String(label || "").trim();
    if (t.includes("좋음") || t.includes("최상") || t.includes("추천")) return "bpill-good";
    if (t.includes("보통")) return "bpill-normal";
    if (t.includes("주의")) return "bpill-caution";
    if (t.includes("나쁨") || t.includes("비추천") || t.includes("금지")) return "bpill-bad";
    return "bpill-neutral";
  }

  /* ──────────────────────────────────────────────────────────
     Weather icon
  ────────────────────────────────────────────────────────── */
  function wIcon(row) {
    const pty = Number(val(row, ["precipitation_type", "precipitation_type_code", "pty"]) ?? 0);
    const sky = Number(val(row, ["sky_code", "sky"]));
    const precip = Number(val(row, ["precipitation", "rain_amount"]));
    const ws = String(val(row, ["weather", "condition_status", "conditionStatus"]) || "");

    if (pty === 1 || ws.includes("비"))        return { icon: "rainy",             color: "#60a5fa", label: "비" };
    if (pty === 2 || ws.includes("비/눈"))     return { icon: "weather_mix",       color: "#60a5fa", label: "비/눈" };
    if (pty === 3 || ws.includes("눈"))        return { icon: "ac_unit",           color: "#93c5fd", label: "눈" };
    if (pty === 4 || ws.includes("소나기"))    return { icon: "thunderstorm",      color: "#60a5fa", label: "소나기" };
    if (Number.isFinite(precip) && precip > 0.5) return { icon: "rainy",          color: "#60a5fa", label: "비" };
    if (sky === 4 || ws.includes("흐림"))      return { icon: "cloud",             color: "#94a3b8", label: "흐림" };
    if (sky === 3 || ws.includes("구름"))      return { icon: "partly_cloudy_day", color: "#38bdf8", label: "구름많음" };
    if (sky === 1 || ws.includes("맑음"))      return { icon: "sunny",             color: "#f59e0b", label: "맑음" };
    const clouds = Number(val(row, ["cloud_cover", "clouds"]));
    if (Number.isFinite(clouds) && clouds >= 80) return { icon: "cloud",           color: "#94a3b8", label: "흐림" };
    if (Number.isFinite(clouds) && clouds >= 40) return { icon: "partly_cloudy_day", color: "#38bdf8", label: "구름많음" };
    return { icon: "sunny", color: "#f59e0b", label: "맑음" };
  }

  /* Time-of-day icon (for short slots by hour) */
  function timeIcon(h) {
    if (h >= 21 || h < 5)  return { icon: "dark_mode",    color: "#64748b" };
    if (h < 7)             return { icon: "wb_twilight",   color: "#f59e0b" };
    if (h < 11)            return { icon: "light_mode",    color: "#006684" };
    if (h < 15)            return { icon: "sunny",         color: "#fcd34d" };
    if (h < 18)            return { icon: "sunny",         color: "#94a3b8" };
    return                        { icon: "wb_twilight",   color: "#94a3b8" };
  }

  /* Wave height range for mid */
  function waveRange(r) {
    const mm = r?.min_max_metrics?.wave_height || r?.display_ranges?.wave_height;
    if (mm && typeof mm === "object") {
      const mn = Number(mm.min), mx = Number(mm.max), me = Number(mm.mean);
      if (Number.isFinite(mn) && Number.isFinite(mx))
        return mn === mx ? fmt(mn, 1) : `${fmt(mn, 1)}~${fmt(mx, 1)}`;
      if (Number.isFinite(me)) return fmt(me, 1);
    }
    const wmin = val(r, ["wave_height_min"]);
    const wmax = val(r, ["wave_height_max"]);
    if (Number.isFinite(Number(wmin)) && Number.isFinite(Number(wmax)) && Number(wmin) !== Number(wmax))
      return `${fmt(wmin, 1)}~${fmt(wmax, 1)}`;
    return fmt(val(r, ["wave_height", "significant_wave_height"]), 1);
  }

  /* ──────────────────────────────────────────────────────────
     Bento item builder
  ────────────────────────────────────────────────────────── */
  function bentoItem({ icon, bgCls, clCls, label, value, unit, gradePill }) {
    const pc = bentoGrade(gradePill);
    return `
      <div class="df-bento-card">
        <div class="df-bento-icon-wrap ${bgCls}">
          <span class="material-symbols-outlined ${clCls}">${icon}</span>
        </div>
        <span class="df-bento-label">${esc(label)}</span>
        <div>
          <span class="df-bento-value">${esc(String(value))}</span>
          ${unit ? `<span class="df-bento-unit">${esc(unit)}</span>` : ""}
        </div>
        ${gradePill ? `<div class="df-bento-pill ${pc}">${esc(gradePill)}</div>` : ""}
      </div>`;
  }

  /* Build Bento grid HTML from a single slot row */
  function buildBento(row, isMid) {
    if (!row) return '<div class="df-empty" style="margin:0 20px">선택된 슬롯 데이터가 없습니다.</div>';

    const sc = scoreNum(row);
    const items = [];

    // 1. 유의파고
    const wH = isMid ? waveRange(row) : fmt(val(row, ["wave_height", "significant_wave_height"]), 1);
    items.push(bentoItem({ icon: "water", bgCls: "bento-bg-sky", clCls: "bento-cl-sky",
      label: "유의파고", value: wH, unit: "m",
      gradePill: val(row, ["wave_height_status"]) || (wH !== "--" ? (Number(wH.replace(/~.+/, "")) <= 0.5 ? "좋음" : Number(wH.replace(/~.+/, "")) <= 1.0 ? "보통" : "주의") : null) }));

    // 2. 파주기
    const wP = fmt(val(row, ["wave_period", "wave_period_seconds"]), 1);
    items.push(bentoItem({ icon: "tsunami", bgCls: "bento-bg-blue", clCls: "bento-cl-blue",
      label: "파주기", value: wP, unit: "초",
      gradePill: val(row, ["wave_period_status"]) || (wP !== "--" ? (Number(wP) >= 6 ? "좋음" : Number(wP) >= 4 ? "보통" : "주의") : null) }));

    // 3. 풍속 (short only — mid may not have)
    const windS = fmt(val(row, ["wind_speed"]), 1);
    if (!isMid || windS !== "--") {
      items.push(bentoItem({ icon: "air", bgCls: "bento-bg-purple", clCls: "bento-cl-purple",
        label: "풍속", value: windS, unit: "m/s",
        gradePill: val(row, ["wind_speed_status"]) || (windS !== "--" ? (Number(windS) <= 5 ? "좋음" : Number(windS) <= 10 ? "보통" : "주의") : null) }));
    }

    // 4. 기온 (short only)
    if (!isMid) {
      const temp = fmt(val(row, ["temperature", "temp"]), 0);
      const tempN = Number(temp);
      const tempGrade = val(row, ["temperature_status"]) ||
        (Number.isFinite(tempN)
          ? (tempN >= 18 && tempN <= 32 ? "좋음" : (tempN >= 14 && tempN <= 36 ? "보통" : "주의"))
          : null);
      items.push(bentoItem({ icon: "device_thermostat", bgCls: "bento-bg-red", clCls: "bento-cl-red",
        label: "기온", value: temp, unit: "°C",
        gradePill: tempGrade }));
    }

    // 5. 수온
    const waterT = fmt(val(row, ["water_temperature", "sea_temperature"]), 1);
    items.push(bentoItem({ icon: "device_thermostat", bgCls: "bento-bg-teal", clCls: "bento-cl-teal",
      label: "수온", value: waterT, unit: "°C",
      gradePill: val(row, ["water_temperature_status"]) || (waterT !== "--" ? (Number(waterT) >= 20 ? "좋음" : Number(waterT) >= 17 ? "보통" : "주의") : null) }));

    // 6. 강수량 (short only)
    if (!isMid) {
      const rain = fmt(val(row, ["precipitation", "rain_amount"]), 1);
      items.push(bentoItem({ icon: "water_drop", bgCls: "bento-bg-indigo", clCls: "bento-cl-indigo",
        label: "강수량", value: rain, unit: "mm",
        gradePill: val(row, ["precipitation_status"]) }));
    }

    // 7. 강수확률
    const rainP = fmtInt(val(row, ["precipitation_probability", "rain_probability"]));
    items.push(bentoItem({ icon: "umbrella", bgCls: "bento-bg-blue", clCls: "bento-cl-blue",
      label: "강수확률", value: rainP, unit: "%",
      gradePill: val(row, ["rain_probability_status"]) || (rainP !== "--" ? (Number(rainP) <= 20 ? "좋음" : Number(rainP) <= 40 ? "보통" : "주의") : null) }));

    // 8. 구름량
    const clouds = fmtInt(val(row, ["cloud_cover", "clouds"]));
    items.push(bentoItem({ icon: "cloud", bgCls: "bento-bg-slate", clCls: "bento-cl-slate",
      label: "구름량", value: clouds, unit: "%",
      gradePill: val(row, ["cloud_cover_status"]) }));

    // 9. 해류속도
    const curS = fmt(val(row, ["current_speed", "sea_current_speed"]), 2);
    items.push(bentoItem({ icon: "swap_calls", bgCls: "bento-bg-orange", clCls: "bento-cl-orange",
      label: "해류속도", value: curS, unit: "m/s",
      gradePill: val(row, ["current_speed_status"]) || (curS !== "--" ? (Number(curS) <= 0.3 ? "좋음" : Number(curS) <= 0.7 ? "보통" : "주의") : null) }));

    // 10. 수중시야 (if present)
    const vis = val(row, ["underwater_visibility", "visibility", "water_visibility"]);
    if (vis !== null) {
      const visStr = fmt(vis, 0);
      items.push(bentoItem({ icon: "visibility", bgCls: "bento-bg-pink", clCls: "bento-cl-pink",
        label: "수중시야", value: visStr, unit: "m",
        gradePill: val(row, ["visibility_status"]) || (visStr !== "--" ? (Number(visStr) >= 10 ? "좋음" : Number(visStr) >= 5 ? "보통" : "주의") : null) }));
    }

    return `<div class="df-bento-grid">${items.join("")}</div>`;
  }

  /* ──────────────────────────────────────────────────────────
     DOM creation (lazy)
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
          <h1 class="tc-app-title" id="dfTitle">6일 예보</h1>
          <button class="tc-icon-btn tc-favorite-btn" id="dfFav" aria-label="즐겨찾기">
            <span class="material-symbols-outlined">favorite</span>
          </button>
        </header>
        <main class="df-content tc-body">
          <!-- Title -->
          <div class="df-title-section">
            <div>
              <h2>6일 컨디션</h2>
              <p>날짜별 바다 컨디션을 비교해보세요</p>
            </div>
            <div class="df-title-date-range">
              <span class="material-symbols-outlined">calendar_month</span>
              <span id="dfDateRange">+1일 ~ +6일</span>
            </div>
          </div>
          <!-- Day selector -->
          <div class="df-days-section" aria-label="일자 선택">
            <div id="dfDays" class="df-days" role="tablist"></div>
          </div>
          <!-- Detail (slots + bento) -->
          <div id="dfDetail" class="df-detail-wrapper"></div>
        </main>
      </div>
    `;
    document.body.appendChild(_modal);

    _modal.querySelector("#dfBack").onclick = () => close(true);
    _modal.querySelector("#dfFav").onclick = () => {
      if (_point) {
        window.SNORKYEngagement?.toggleFavorite?.(_point);
        _updateFav();
      }
    };
  }

  function _updateFav() {
    const btn = _modal && _modal.querySelector("#dfFav .material-symbols-outlined");
    if (!btn) return;
    const on = _point && window.SNORKYEngagement?.isFavorite?.(_point);
    btn.textContent = "favorite";
    btn.style.setProperty("font-variation-settings", on ? "'FILL' 1" : "'FILL' 0");
    btn.style.color = on ? "#ef4444" : "";
  }

  /* ──────────────────────────────────────────────────────────
     render() — date tab cards
  ────────────────────────────────────────────────────────── */
  function render() {
    const kstNow  = new Date(Date.now() + 9 * 3600000);
    const todayStr = kstNow.toISOString().slice(0, 10);

    // Group rows by date (exclude today)
    const groups = {};
    [..._shortRows, ..._midRows].forEach(r => {
      const d = dateOf(r);
      if (d && d > todayStr) (groups[d] = groups[d] || []).push(r);
    });

    // Always fill +1~+6 even if no data
    for (let i = 1; i <= 6; i++) {
      const next = new Date(kstNow);
      next.setUTCDate(next.getUTCDate() + i);
      const ds = next.toISOString().slice(0, 10);
      if (!groups[ds]) groups[ds] = [];
    }

    const dates = Object.keys(groups).sort().slice(0, 6);
    const daysEl  = _modal.querySelector("#dfDays");
    const rangeEl = _modal.querySelector("#dfDateRange");
    const detailEl = _modal.querySelector("#dfDetail");
    if (!daysEl || !detailEl) return;

    if (!dates.length) {
      daysEl.innerHTML = '<div class="df-empty">+1~+6일 예보 데이터가 없습니다.</div>';
      return;
    }

    // Date range badge
    if (rangeEl && dates.length >= 2) {
      const f = new Date(`${dates[0]}T00:00:00+09:00`);
      const l = new Date(`${dates[dates.length - 1]}T00:00:00+09:00`);
      rangeEl.textContent = `${f.getMonth() + 1}/${f.getDate()} ~ ${l.getMonth() + 1}/${l.getDate()}`;
    }

    const selDate = (_selectedDate && dates.includes(_selectedDate)) ? _selectedDate : dates[0];
    _selectedDate = selDate;

    daysEl.innerHTML = dates.map((d, i) => {
      const rows   = groups[d] || [];
      const dt     = new Date(`${d}T00:00:00+09:00`);
      const avg    = avgScore(rows);
      const scClass = scoreCls(avg);
      const rep    = rows[0] || {};
      const stTxt  = val(rep, ["condition_status", "conditionStatus"]) || statusText(avg);
      const p      = pill(stTxt);
      const wi     = wIcon(rep);
      const isSel  = d === selDate;

      return `
        <button class="df-day-card${isSel ? " selected" : ""} ${scClass}"
                data-date="${esc(d)}" data-idx="${i}"
                role="tab" aria-selected="${isSel}">
          <div class="df-day-label">+${i + 1}일 · ${dt.getMonth() + 1}/${dt.getDate()}(${DAY_NAMES[dt.getDay()]})</div>
          <div class="df-day-center">
            <span class="df-day-score-big">${avg !== null ? avg : "--"}</span>
            <span class="material-symbols-outlined df-day-weather-sm" style="color:${isSel ? "#fcd34d" : wi.color}">${wi.icon}</span>
          </div>
          <div class="df-day-pill ${isSel ? "" : p.cls}">${esc(p.label)}</div>
        </button>`;
    }).join("");

    daysEl.querySelectorAll(".df-day-card").forEach(btn => {
      btn.onclick = () => {
        daysEl.querySelectorAll(".df-day-card").forEach(b => {
          b.classList.remove("selected");
          b.setAttribute("aria-selected", "false");
          // restore pill color
          const pEl = b.querySelector(".df-day-pill");
          if (pEl) {
            const sc = avgScore(groups[b.dataset.date] || []);
            const rep2 = (groups[b.dataset.date] || [])[0] || {};
            const st2 = val(rep2, ["condition_status", "conditionStatus"]) || statusText(sc);
            const p2 = pill(st2);
            pEl.className = `df-day-pill ${p2.cls}`;
          }
        });
        btn.classList.add("selected");
        btn.setAttribute("aria-selected", "true");
        // selected pill style
        const pEl = btn.querySelector(".df-day-pill");
        if (pEl) pEl.className = "df-day-pill";
        _selectedDate = btn.dataset.date;
        _selectedSlot = null;
        btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        renderDetail(_selectedDate, groups[_selectedDate] || [], Number(btn.dataset.idx) + 1);
      };
    });

    _selectedSlot = null;
    renderDetail(selDate, groups[selDate] || [], dates.indexOf(selDate) + 1);
  }

  /* ──────────────────────────────────────────────────────────
     renderDetail() — slots + bento for selected date
  ────────────────────────────────────────────────────────── */
  function renderDetail(d, rows, offset) {
    const detailEl = _modal && _modal.querySelector("#dfDetail");
    if (!detailEl) return;

    const isMid = offset >= 4 || _midRows.some(r => dateOf(r) === d);
    const sorted = [...rows].sort((a, b) => kstHour(a) - kstHour(b));

    if (!rows.length) {
      detailEl.innerHTML = `
        <div class="df-section-divider"></div>
        <div class="df-empty-card">
          <span class="material-symbols-outlined">info</span>
          <p>해당 일자의 예보 데이터가 아직 등록되지 않았습니다.</p>
        </div>`;
      return;
    }

    if (!isMid) {
      renderShortDetail(detailEl, sorted, d, offset);
    } else {
      renderMidDetail(detailEl, sorted, d, offset);
    }
  }

  /* ──────────────────────────────────────────────────────────
     Short detail (+1~+3): horizontal time cards + Bento
  ────────────────────────────────────────────────────────── */
  function renderShortDetail(container, rows, d, offset) {
    // Filter to valid short hours
    const VALID_HOURS = new Set([0, 3, 6, 9, 12, 15, 18, 21]);
    const slots = rows.filter(r => VALID_HOURS.has(kstHour(r)));
    const displayRows = slots.length ? slots : rows; // fallback: show all if no standard hours match

    // Default selected slot: first one (or noon if available)
    const defSlot = _selectedSlot && displayRows.includes(_selectedSlot)
      ? _selectedSlot
      : (displayRows.find(r => kstHour(r) === 12) || displayRows[0]);
    _selectedSlot = defSlot;

    // Time card HTML
    const timeCardsHtml = displayRows.map(r => {
      const h   = kstHour(r);
      const tLabel = h !== 99 ? `${String(h).padStart(2, "0")}:00` : "--:--";
      const sc  = scoreNum(r);
      const stT = val(r, ["condition_status", "conditionStatus"]) || statusText(sc);
      const p   = pill(stT);
      const ti  = timeIcon(h);
      const waveH = fmt(val(r, ["wave_height", "significant_wave_height"]), 1);
      const isSel = r === _selectedSlot;

      return `
        <button class="df-time-card${isSel ? " selected" : ""}" data-hour="${h}">
          <div class="df-time-label">${esc(tLabel)}</div>
          <div class="df-time-center">
            <span class="material-symbols-outlined df-time-weather-icon" style="color:${isSel ? "#fcd34d" : ti.color}">${ti.icon}</span>
            <span class="df-time-aux">${waveH !== "--" ? waveH + "m" : (sc !== null ? sc + "점" : "--")}</span>
          </div>
          <div class="df-time-pill ${isSel ? "" : p.cls}">
            <span>${sc !== null ? sc : "--"}</span>
            <span class="df-time-pill-divider" style="background:${isSel ? "#fff" : p.cls.includes("good") ? "#047857" : p.cls.includes("normal") ? "#1d4ed8" : p.cls.includes("caution") ? "#b45309" : "#b91c1c"}"></span>
            <span>${esc(p.label)}</span>
          </div>
        </button>`;
    }).join("");

    // Bento for selected slot
    const selH = _selectedSlot ? kstHour(_selectedSlot) : null;
    const bentoSubLabel = selH !== null && selH !== 99
      ? `${String(selH).padStart(2, "0")}:00 기준`
      : "";

    container.innerHTML = `
      <div class="df-section-divider"></div>
      <div class="df-section-title">
        <h3>시간별 예보</h3>
        <span class="df-section-title-sub">+${offset}일 · 3시간 단위</span>
      </div>
      <div class="df-time-slots-scroll" id="dfTimeSlots">${timeCardsHtml}</div>
      <div class="df-section-divider"></div>
      <div class="df-bento-section">
        <div class="df-bento-heading">
          상세 수치
          <span class="df-bento-heading-sub">${esc(bentoSubLabel)}</span>
        </div>
        <div id="dfBentoArea">${buildBento(_selectedSlot, false)}</div>
      </div>`;

    // Bind time card clicks
    container.querySelectorAll(".df-time-card").forEach((btn, idx) => {
      btn.onclick = () => {
        container.querySelectorAll(".df-time-card").forEach(b => {
          b.classList.remove("selected");
        });
        btn.classList.add("selected");
        btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        _selectedSlot = displayRows[idx];
        // Update Bento and heading
        const bentoArea = container.querySelector("#dfBentoArea");
        if (bentoArea) bentoArea.innerHTML = buildBento(_selectedSlot, false);
        const heading = container.querySelector(".df-bento-heading");
        if (heading) {
          const hh = kstHour(_selectedSlot);
          heading.innerHTML = `상세 수치 <span class="df-bento-heading-sub">${hh !== 99 ? String(hh).padStart(2, "0") + ":00 기준" : ""}</span>`;
        }
      };
    });
  }

  /* ──────────────────────────────────────────────────────────
     Mid detail (+4~+6): AM/PM section cards + Bento
  ────────────────────────────────────────────────────────── */
  function renderMidDetail(container, rows, d, offset) {
    // Split AM (h<12) / PM (h>=12)
    const amRows = rows.filter(r => kstHour(r) < 12);
    const pmRows = rows.filter(r => kstHour(r) >= 12);

    const repAM = amRows[0] || null;
    const repPM = pmRows[0] || null;

    const scAM = avgScore(amRows);
    const scPM = avgScore(pmRows);
    const stAM = (repAM && val(repAM, ["condition_status", "conditionStatus"])) || statusText(scAM);
    const stPM = (repPM && val(repPM, ["condition_status", "conditionStatus"])) || statusText(scPM);
    const pAM  = pill(stAM);
    const pPM  = pill(stPM);

    // Default selected: AM if available, else PM
    if (!_selectedSlot || (!amRows.includes(_selectedSlot) && !pmRows.includes(_selectedSlot))) {
      _selectedSlot = repAM || repPM;
    }
    const isAMSel = amRows.includes(_selectedSlot) || (!_selectedSlot && repAM);

    function midCardHtml(period, repRow, sc, p, isSel) {
      const isAM = period === "am";
      const icon = isAM ? "wb_sunny" : "wb_twilight";
      const label = isAM ? "오전 06~12" : "오후 12~18";
      const wi = repRow ? wIcon(repRow) : null;
      return `
        <button class="df-mid-card${isSel ? " selected" : ""}" data-period="${period}">
          <div class="df-mid-card-head">
            <span class="material-symbols-outlined df-mid-period-icon">${icon}</span>
            <span class="df-mid-period-label">${label}</span>
            ${wi ? `<span class="material-symbols-outlined" style="font-size:16px;margin-left:auto;color:${isSel ? "rgba(175,204,255,.8)" : wi.color}">${wi.icon}</span>` : ""}
          </div>
          <div class="df-mid-card-body">
            <span class="df-mid-score">${sc !== null ? sc : "--"}</span>
            <span class="df-mid-card-pill ${isSel ? "" : p.cls}">${esc(p.label)}</span>
          </div>
        </button>`;
    }

    const amHtml = midCardHtml("am", repAM, scAM, pAM, isAMSel);
    const pmHtml = midCardHtml("pm", repPM, scPM, pPM, !isAMSel);

    const initBentoRow = isAMSel ? repAM : repPM;
    const initPeriod   = isAMSel ? "오전 06~12" : "오후 12~18";

    container.innerHTML = `
      <div class="df-section-divider"></div>
      <div class="df-section-title">
        <h3>구간별 예보</h3>
        <span class="df-section-title-sub">+${offset}일 · 중기 예보</span>
      </div>
      <div class="df-mid-cards" id="dfMidCards">
        ${amHtml}
        ${pmHtml}
      </div>
      <div class="df-section-divider"></div>
      <div class="df-bento-section">
        <div class="df-bento-heading">
          상세 수치
          <span class="df-bento-heading-sub" id="dfMidBentoSub">${esc(initPeriod)}</span>
        </div>
        <div id="dfBentoArea">${buildBento(initBentoRow, true)}</div>
      </div>`;

    // Bind mid card clicks
    container.querySelectorAll(".df-mid-card").forEach(btn => {
      btn.onclick = () => {
        container.querySelectorAll(".df-mid-card").forEach(b => {
          b.classList.remove("selected");
          // restore pill
          const pEl = b.querySelector(".df-mid-card-pill");
          if (pEl) {
            const per = b.dataset.period;
            const p2 = per === "am" ? pAM : pPM;
            pEl.className = `df-mid-card-pill ${p2.cls}`;
            pEl.textContent = p2.label;
          }
        });
        btn.classList.add("selected");
        // clear selected pill color
        const pEl = btn.querySelector(".df-mid-card-pill");
        if (pEl) pEl.className = "df-mid-card-pill";

        const isAM = btn.dataset.period === "am";
        _selectedSlot = isAM ? repAM : repPM;
        const bentoRow = _selectedSlot;
        const periodLabel = isAM ? "오전 06~12" : "오후 12~18";

        const bentoArea = container.querySelector("#dfBentoArea");
        if (bentoArea) bentoArea.innerHTML = buildBento(bentoRow, true);
        const sub = container.querySelector("#dfMidBentoSub");
        if (sub) sub.textContent = periodLabel;
      };
    });
  }

  /* ──────────────────────────────────────────────────────────
     open(point)
  ────────────────────────────────────────────────────────── */
  async function open(p) {
    ensure();
    _point = p || window.spot;
    if (!_point) return;

    _modal.querySelector("#dfTitle").textContent = _point.name || "6일 예보";
    _updateFav();

    _modal.style.display = "flex";
    _modal.classList.add("open");
    document.body.style.overflow = "hidden";

    const pm = document.getElementById("pointModal");
    if (pm?.classList.contains("open")) pm.style.visibility = "hidden";

    if (!_historyActive) {
      history.pushState({ ...history.state, snorkyDailyForecast: true }, "");
      _historyActive = true;
    }

    // Loading state
    const daysEl   = _modal.querySelector("#dfDays");
    const detailEl = _modal.querySelector("#dfDetail");
    if (daysEl)   daysEl.innerHTML   = '<div class="df-loading">예보 데이터를 불러오는 중입니다...</div>';
    if (detailEl) detailEl.innerHTML = "";

    const reader = window.SNORKYEvaluationResults;
    const id = String(_point.supabaseId || _point.id || "");

    try {
      if (!window.supabase?.createClient && !window.snorkySupabase) {
        await new Promise(resolve => {
          const t = setTimeout(resolve, 2000);
          window.addEventListener("snorky:supabase-ready", () => { clearTimeout(t); resolve(); }, { once: true });
        });
      }
      const [short, mid] = await Promise.all([
        reader?.loadShortResultsForPoint ? reader.loadShortResultsForPoint(id) : Promise.resolve([]),
        reader?.loadMidResultsForPoint   ? reader.loadMidResultsForPoint(id)   : Promise.resolve([]),
      ]);
      _shortRows = Array.isArray(short) ? short : [];
      _midRows   = Array.isArray(mid)   ? mid   : [];
    } catch (err) {
      console.warn("[SNORKYDailyForecast] 데이터 로드 오류:", err);
      _shortRows = [];
      _midRows   = [];
    }

    render();
  }

  /* ──────────────────────────────────────────────────────────
     close(back)
  ────────────────────────────────────────────────────────── */
  function close(back) {
    if (!_modal) return;
    _modal.classList.remove("open");
    _modal.style.display = "none";

    const pm = document.getElementById("pointModal");
    if (pm?.classList.contains("open")) {
      pm.style.visibility = "visible";
    }

    document.body.style.overflow = pm?.classList.contains("open") ? "hidden" : "";

    if (back && _historyActive) {
      _historyActive = false;
      history.back();
    } else {
      _historyActive = false;
    }
  }

  /* ──────────────────────────────────────────────────────────
     Auto-open via ?testDaily=ID
  ────────────────────────────────────────────────────────── */
  function checkAutoOpen() {
    try {
      const params = new URLSearchParams(window.location.search);
      const testId = params.get("testDaily");
      if (!testId) return;
      setTimeout(() => {
        open({ id: Number(testId), supabaseId: Number(testId), name: "테스트 포인트" });
        if (params.get("tab") === "mid") {
          setTimeout(() => {
            const cards = _modal && _modal.querySelectorAll(".df-day-card");
            if (cards && cards.length >= 4) cards[3].click();
          }, 700);
        }
      }, 800);
    } catch (_) { /* noop */ }
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", checkAutoOpen);
  } else {
    checkAutoOpen();
  }

  /* ──────────────────────────────────────────────────────────
     Public API
  ────────────────────────────────────────────────────────── */
  window.SNORKYDailyForecast = Object.freeze({
    open,
    close,
    isOpen: () => Boolean(_modal && _modal.classList.contains("open")),
  });
})();
