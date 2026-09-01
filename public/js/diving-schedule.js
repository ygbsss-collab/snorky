(function () {
  "use strict";

  const session = window.SNORKYAuthSession?.get?.();
  if (!session?.user?.id) {
    location.replace("./login.html");
    return;
  }

  const userId = String(session.user.id);
  const customSpotStorageKey = `snorky_custom_spots_v1:${userId}`;

  function getSbClient() {
    return window.getSnorkySupabase ? window.getSnorkySupabase() : window.snorkySupabase;
  }

  function getKstDate() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (9 * 3600000));
  }

  function getTodayKstStr() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date());
    } catch (_) {
      const kst = getKstDate();
      const year = kst.getFullYear();
      const month = String(kst.getMonth() + 1).padStart(2, "0");
      const date = String(kst.getDate()).padStart(2, "0");
      return `${year}-${month}-${date}`;
    }
  }

  const todayStr = getTodayKstStr();

  // State
  let currentDate = getKstDate();
  let currentYear = Number(todayStr.split("-")[0]);
  let currentMonth = Number(todayStr.split("-")[1]) - 1; // 0-indexed
  let selectedDateStr = todayStr;
  let monthlySchedules = new Map(); // dateStr -> Array<Schedule>
  let editingScheduleId = null;
  let selectedPointType = "official"; // 'official' | 'custom'

  let officialPoints = [];
  let customSpots = [];
  let pointsLoaded = false;

  // DOM Elements
  const calendarMonthTitle = document.getElementById("calendarMonthTitle");
  const calendarDaysGrid = document.getElementById("calendarDaysGrid");
  const prevMonthBtn = document.getElementById("prevMonthBtn");
  const nextMonthBtn = document.getElementById("nextMonthBtn");
  const todayNavBtn = document.getElementById("todayNavBtn");
  const addScheduleBtn = document.getElementById("addScheduleBtn");

  const dayScheduleTitle = document.getElementById("dayScheduleTitle");
  const dayScheduleList = document.getElementById("dayScheduleList");

  // Modal Elements
  const scheduleModal = document.getElementById("scheduleModal");
  const scheduleModalTitle = document.getElementById("scheduleModalTitle");
  const closeScheduleModalBtn = document.getElementById("closeScheduleModalBtn");
  const cancelScheduleModalBtn = document.getElementById("cancelScheduleModalBtn");
  const scheduleModalBackdrop = document.getElementById("scheduleModalBackdrop");
  const scheduleForm = document.getElementById("scheduleForm");
  const tabOfficial = document.getElementById("tabOfficial");
  const tabFavorite = document.getElementById("tabFavorite");
  const tabCustom = document.getElementById("tabCustom");
  const officialPointSec = document.getElementById("officialPointSec");
  const favoritePointSec = document.getElementById("favoritePointSec");
  const favoritePointResults = document.getElementById("favoritePointResults");
  const customPointSec = document.getElementById("customPointSec");
  const pointSearchInput = document.getElementById("pointSearchInput");
  const pointSearchBtn = document.getElementById("pointSearchBtn");
  const pointSearchResults = document.getElementById("pointSearchResults");
  const selectedOfficialPointIdInput = document.getElementById("selectedOfficialPointId");
  const selectedOfficialPointNameInput = document.getElementById("selectedOfficialPointName");
  const customSpotSelect = document.getElementById("customSpotSelect");
  const schedulePlannedTimeInput = document.getElementById("schedulePlannedTimeInput");
  const scheduleMemoInput = document.getElementById("scheduleMemoInput");
  const scheduleModalStatus = document.getElementById("scheduleModalStatus");
  const saveScheduleBtn = document.getElementById("saveScheduleBtn");

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[char]);
  }

  // Load Custom Spots from Local Storage
  function loadLocalCustomSpots() {
    try {
      const parsed = JSON.parse(localStorage.getItem(customSpotStorageKey) || "[]");
      customSpots = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      customSpots = [];
    }
  }

  // Load Official Points from Supabase
  async function loadOfficialPoints() {
    if (pointsLoaded && officialPoints.length) return;
    const sb = getSbClient();
    if (!sb) return;

    try {
      const [regRes, ptRes] = await Promise.all([
        sb.from("regions").select("id, name"),
        sb.from("points").select("id, legacy_id, region_id, name, lat, lng, warning_area_code, land_warning_area_code")
      ]);

      const regionMap = new Map();
      (regRes.data || []).forEach(r => regionMap.set(Number(r.id), r.name));

      officialPoints = (ptRes.data || []).map(p => ({
        id: String(p.id),
        legacy_id: p.legacy_id || String(p.id),
        name: p.name,
        regionName: regionMap.get(Number(p.region_id)) || "기타",
        lat: Number(p.lat),
        lng: Number(p.lng),
        warning_area_code: p.warning_area_code,
        land_warning_area_code: p.land_warning_area_code
      })).sort((a, b) => a.regionName.localeCompare(b.regionName, "ko-KR") || a.name.localeCompare(b.name, "ko-KR"));

      pointsLoaded = true;
      populateCustomSpotSelect();
    } catch (err) {
      console.warn("[SNORKY Diving Schedule] Failed to load official points:", err);
    }
  }

  function populateCustomSpotSelect() {
    loadLocalCustomSpots();
    let customHtml = '<option value="">나만의 스팟을 선택하세요</option>';
    if (customSpots.length === 0) {
      customHtml = '<option value="">등록된 나만의 스팟이 없습니다 (마이페이지 > 나만의 스팟에서 등록)</option>';
    } else {
      customSpots.forEach(spot => {
        customHtml += `<option value="${escapeHtml(spot.id)}" data-name="${escapeHtml(spot.name)}">${escapeHtml(spot.name)} (${escapeHtml(spot.region || "지역 미지정")})</option>`;
      });
    }
    customSpotSelect.innerHTML = customHtml;
  }

  // Official Points Search
  function searchOfficialPoints() {
    const keyword = (pointSearchInput?.value || "").trim().toLowerCase();
    if (!keyword) {
      pointSearchResults.innerHTML = '<div class="schedule-search-hint">검색어를 입력해 주세요. (예: 강릉, 안목)</div>';
      return;
    }

    const filtered = officialPoints.filter(pt =>
      pt.name.toLowerCase().includes(keyword) ||
      pt.regionName.toLowerCase().includes(keyword)
    );

    if (filtered.length === 0) {
      pointSearchResults.innerHTML = '<div class="schedule-search-hint">검색 결과가 없습니다.</div>';
      return;
    }

    renderPointSearchResults(filtered);
  }

  function renderPointSearchResults(list) {
    const currentSelectedId = selectedOfficialPointIdInput?.value || "";
    let html = "";
    list.forEach(pt => {
      const isSelected = String(pt.legacy_id) === String(currentSelectedId);
      html += `
        <button type="button" class="schedule-search-item ${isSelected ? "is-selected" : ""}" data-point-id="${escapeHtml(pt.legacy_id)}" data-point-name="${escapeHtml(pt.name)}">
          <span class="schedule-search-item-title">${escapeHtml(pt.name)}</span>
          <span class="schedule-search-item-region">${escapeHtml(pt.regionName)}</span>
        </button>
      `;
    });
    pointSearchResults.innerHTML = html;

    pointSearchResults.querySelectorAll(".schedule-search-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-point-id");
        const name = btn.getAttribute("data-point-name");
        selectedOfficialPointIdInput.value = id;
        selectedOfficialPointNameInput.value = name;
        pointSearchResults.querySelectorAll(".schedule-search-item").forEach(b => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
      });
    });
  }

  // Render Favorite Points
  function renderFavoritePoints() {
    let favList = [];
    try {
      const raw = JSON.parse(localStorage.getItem("snorky_favorites") || "[]");
      const favSet = new Set(Array.isArray(raw) ? raw.map(id => String(id).trim()).filter(Boolean) : []);
      favList = officialPoints.filter(pt =>
        favSet.has(String(pt.legacy_id)) ||
        favSet.has(String(pt.id)) ||
        (window.SNORKYEngagement?.isFavorite?.(pt) ?? false)
      );
    } catch (_) {
      favList = [];
    }

    if (!favoritePointResults) return;

    if (favList.length === 0) {
      favoritePointResults.innerHTML = '<div class="schedule-search-hint">등록된 즐겨찾기 포인트가 없습니다.</div>';
      return;
    }

    const currentSelectedId = selectedOfficialPointIdInput?.value || "";
    let html = "";
    favList.forEach(pt => {
      const isSelected = String(pt.legacy_id) === String(currentSelectedId);
      html += `
        <button type="button" class="schedule-search-item ${isSelected ? "is-selected" : ""}" data-point-id="${escapeHtml(pt.legacy_id)}" data-point-name="${escapeHtml(pt.name)}">
          <span class="schedule-search-item-title">♥ ${escapeHtml(pt.name)}</span>
          <span class="schedule-search-item-region">${escapeHtml(pt.regionName)}</span>
        </button>
      `;
    });
    favoritePointResults.innerHTML = html;

    favoritePointResults.querySelectorAll(".schedule-search-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-point-id");
        const name = btn.getAttribute("data-point-name");
        selectedOfficialPointIdInput.value = id;
        selectedOfficialPointNameInput.value = name;
        favoritePointResults.querySelectorAll(".schedule-search-item").forEach(b => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
      });
    });
  }

  // Load Schedules for Selected Month
  async function loadMonthSchedules() {
    const sb = getSbClient();
    if (!sb) return;

    const startStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    const endStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    try {
      const { data, error } = await sb
        .from("user_diving_schedules")
        .select("*")
        .eq("user_id", userId)
        .gte("schedule_date", startStr)
        .lte("schedule_date", endStr)
        .order("schedule_date", { ascending: true })
        .order("id", { ascending: true });

      if (error) {
        console.error("[SNORKY Diving Schedule Load Error]", error);
        return;
      }

      monthlySchedules.clear();
      (data || []).forEach(row => {
        const dStr = row.schedule_date;
        if (!monthlySchedules.has(dStr)) monthlySchedules.set(dStr, []);
        monthlySchedules.get(dStr).push(row);
      });

      renderCalendar();
      renderSelectedDaySchedules();
    } catch (err) {
      console.error("[SNORKY Diving Schedule Load Exception]", err);
    }
  }

  // Render Calendar Grid
  function renderCalendar() {
    calendarMonthTitle.textContent = `${currentYear}년 ${currentMonth + 1}월`;

    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // 0 (Sun) ~ 6 (Sat)
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthTotalDays = new Date(currentYear, currentMonth, 0).getDate();

    let gridHtml = "";

    // 1. Previous Month Leading Days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthTotalDays - i;
      gridHtml += `<div class="calendar-day-cell other-month" aria-hidden="true"><span class="calendar-day-num">${dayNum}</span></div>`;
    }

    // 2. Current Month Days
    for (let day = 1; day <= totalDays; day++) {
      const dStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayOfWeek = new Date(currentYear, currentMonth, day).getDay();
      const isSun = dayOfWeek === 0;
      const isSat = dayOfWeek === 6;
      const isToday = dStr === todayStr;
      const isSelected = dStr === selectedDateStr;

      const dayClass = [
        "calendar-day-cell",
        isSun ? "sun" : "",
        isSat ? "sat" : "",
        isToday ? "is-today" : "",
        isSelected ? "is-selected" : "",
      ].filter(Boolean).join(" ");

      const schedules = monthlySchedules.get(dStr) || [];
      let badgesHtml = "";
      if (schedules.length > 0) {
        badgesHtml = '<div class="calendar-badges">';
        schedules.slice(0, 2).forEach(item => {
          const typeClass = item.point_type === "custom" ? "custom" : "";
          badgesHtml += `<span class="calendar-badge-item ${typeClass}" title="${escapeHtml(item.point_name)}">${escapeHtml(item.point_name)}</span>`;
        });
        if (schedules.length > 2) {
          badgesHtml += `<span class="calendar-badge-more">+${schedules.length - 2}</span>`;
        }
        badgesHtml += '</div>';
      }

      gridHtml += `
        <div class="${dayClass}" data-date="${dStr}" tabindex="0" role="button" aria-label="${dStr} 스케줄">
          <span class="calendar-day-num">${day}</span>
          ${badgesHtml}
        </div>
      `;
    }

    // 3. Next Month Trailing Days
    const totalFilled = firstDayIndex + totalDays;
    const remaining = (7 - (totalFilled % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      gridHtml += `<div class="calendar-day-cell other-month" aria-hidden="true"><span class="calendar-day-num">${i}</span></div>`;
    }

    calendarDaysGrid.innerHTML = gridHtml;

    // Attach click listeners to day cells
    calendarDaysGrid.querySelectorAll(".calendar-day-cell[data-date]").forEach(cell => {
      cell.addEventListener("click", () => {
        const clickedDate = cell.getAttribute("data-date");
        if (clickedDate) {
          selectedDateStr = clickedDate;
          renderCalendar();
          renderSelectedDaySchedules();
        }
      });
    });
  }

  // Format Date for Title (e.g. "9월 12일 토요일")
  function formatSelectedDateTitle(dateStr) {
    const parts = dateStr.split("-");
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const dayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
    return `${Number(parts[1])}월 ${Number(parts[2])}일 ${dayNames[d.getDay()]}`;
  }

  // Calculate difference in days between target date and today
  function getDaysDiffFromToday(dateStr) {
    const [ty, tm, td] = dateStr.split("-").map(Number);
    const [by, bm, bd] = todayStr.split("-").map(Number);
    const targetUtc = Date.UTC(ty, tm - 1, td);
    const baseUtc = Date.UTC(by, bm - 1, bd);
    return Math.round((targetUtc - baseUtc) / (1000 * 60 * 60 * 24));
  }

  // Render Selected Day Schedules
  function renderSelectedDaySchedules() {
    dayScheduleTitle.textContent = `${formatSelectedDateTitle(selectedDateStr)} 스케줄`;
    const schedules = monthlySchedules.get(selectedDateStr) || [];

    if (schedules.length === 0) {
      dayScheduleList.innerHTML = `
        <div class="schedule-empty">
          <p>등록된 다이빙 스케줄이 없습니다.</p>
        </div>
      `;
      return;
    }

    let listHtml = "";
    schedules.forEach(item => {
      const isCustom = item.point_type === "custom";
      const typeTag = isCustom ? '<span class="schedule-type-tag custom">나만의 스팟</span>' : '<span class="schedule-type-tag">SNORKY 포인트</span>';

      listHtml += `
        <article class="schedule-card" data-id="${item.id}">
          <div class="schedule-card-top">
            <div class="schedule-point-info">
              ${typeTag}
              <strong class="schedule-point-name">${escapeHtml(item.point_name)}</strong>
            </div>
            <div class="schedule-card-actions">
              <button class="schedule-action-btn" type="button" data-edit-id="${item.id}" aria-label="수정">✎</button>
              <button class="schedule-action-btn delete" type="button" data-delete-id="${item.id}" aria-label="삭제">×</button>
            </div>
          </div>
          ${item.planned_time ? `
            <div class="schedule-time-badge">
              <span class="material-symbols-outlined">schedule</span>
              <span>입수 예정 ${escapeHtml(item.planned_time)}</span>
            </div>
          ` : ""}
          ${item.memo ? `<p class="schedule-memo">${escapeHtml(item.memo)}</p>` : ""}
          <div class="schedule-card-footer">
            <button class="schedule-share-btn" type="button" data-share-id="${item.id}">
              <span class="material-symbols-outlined">share</span>
              <span>버디에게 공유</span>
            </button>
            <button class="schedule-condition-btn" type="button" data-view-condition-id="${item.id}">
              컨디션 보기
            </button>
          </div>
        </article>
      `;
    });

    dayScheduleList.innerHTML = listHtml;

    // Attach button listeners
    dayScheduleList.querySelectorAll("[data-edit-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-edit-id"));
        const item = schedules.find(s => Number(s.id) === id);
        if (item) openScheduleModal(item);
      });
    });

    dayScheduleList.querySelectorAll("[data-delete-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-delete-id"));
        deleteSchedule(id);
      });
    });

    dayScheduleList.querySelectorAll("[data-share-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-share-id"));
        const item = schedules.find(s => Number(s.id) === id);
        if (item) shareWithBuddy(item);
      });
    });

    dayScheduleList.querySelectorAll("[data-view-condition-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-view-condition-id"));
        const item = schedules.find(s => Number(s.id) === id);
        if (item) openConditionDetail(item);
      });
    });
  }

  const KAKAO_JAVASCRIPT_KEY = "c29f1a71a53af406429520da0df21772";
  const PROD_SHARE_BASE_URL = "https://ygbsss-collab.github.io/snorky/diving-schedule-share.html";

  function createSecureToken() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID().replace(/-/g, "") + Math.random().toString(36).slice(2, 10);
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  function getProductionShareUrl(shareToken) {
    const token = shareToken || createSecureToken();
    return `${PROD_SHARE_BASE_URL}?t=${encodeURIComponent(token)}`;
  }

  function initKakaoSDK() {
    if (window.Kakao && !window.Kakao.isInitialized()) {
      try {
        window.Kakao.init(KAKAO_JAVASCRIPT_KEY);
      } catch (err) {
        console.warn("[Kakao SDK Init Error]", err);
      }
    }
  }

  // Share diving schedule with buddy (Unified format + Production Link)
  async function shareWithBuddy(schedule) {
    const sb = getSbClient();

    // 1. share_token 발급 또는 재사용
    if (!schedule.share_token) {
      const generatedToken = createSecureToken();
      schedule.share_token = generatedToken;
      if (sb && schedule.id) {
        try {
          await sb
            .from("user_diving_schedules")
            .update({ share_token: generatedToken })
            .eq("id", schedule.id);
        } catch (err) {
          console.warn("[SNORKY Share Token Generation Error]", err);
        }
      }
    }

    const shareUrl = getProductionShareUrl(schedule.share_token);
    const plannedTimeText = schedule.planned_time ? schedule.planned_time : "미정";
    const memoText = schedule.memo ? schedule.memo : "없음";

    // 요구된 표준 공유 텍스트 형식 (링크 필수 포함)
    const shareText = `[SNORKY 다이빙 스케줄]\n🤿 포인트: ${schedule.point_name}\n📅 날짜: ${schedule.schedule_date}\n⏰ 입수 예정: ${plannedTimeText}\n📝 메모: ${memoText}\n\n버디와 함께 일정 확인하기\n${shareUrl}`;

    // 2. 카카오톡 환경 카카오 공유 (SDK 사용 가능 시)
    initKakaoSDK();
    const isKakaoTalk = /KAKAOTALK/i.test(navigator.userAgent);
    if (isKakaoTalk && window.Kakao?.Share?.sendDefault) {
      try {
        const descText = `🤿 포인트: ${schedule.point_name}\n📅 날짜: ${schedule.schedule_date}\n⏰ 입수 예정: ${plannedTimeText}${schedule.memo ? `\n📝 메모: ${schedule.memo}` : ""}\n\n👉 아래 버튼을 눌러 스케줄을 확인하세요.`;
        const buttons = [
          {
            title: "스케줄 보기",
            link: {
              mobileWebUrl: shareUrl,
              webUrl: shareUrl,
            },
          },
        ];

        if (schedule.point_type !== "custom" && schedule.point_id) {
          buttons.push({
            title: "포인트 상세보기",
            link: {
              mobileWebUrl: `https://ygbsss-collab.github.io/snorky/index.html?point=${encodeURIComponent(schedule.point_id)}`,
              webUrl: `https://ygbsss-collab.github.io/snorky/index.html?point=${encodeURIComponent(schedule.point_id)}`,
            },
          });
        }

        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: "SNORKY 다이빙 스케줄",
            description: descText,
            imageUrl: "https://ygbsss-collab.github.io/snorky/public/images/snorky-symbol.png",
            link: {
              mobileWebUrl: shareUrl,
              webUrl: shareUrl,
            },
          },
          buttons,
        });
        return;
      } catch (kErr) {
        console.warn("[Kakao Share Fallback]", kErr);
      }
    }

    // 3. Web Share API (title, text, url 모두 전달하여 어떤 브라우저에서도 링크 포함 보장)
    if (navigator.share) {
      try {
        await navigator.share({
          title: "SNORKY 다이빙 스케줄",
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }

    // 4. 링크 복사 (전체 일정 문구 + URL 클립보드 복사)
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareText);
        alert("스케줄 정보와 링크를 복사했습니다.");
        return;
      } catch (_) {}
    }

    // 5. Fallback Prompt (전체 문구 표시)
    prompt("아래 스케줄 정보와 링크를 복사하여 전달하세요:", shareText);
  }

  // Open Condition Detail for Schedule (Cache First)
  async function openConditionDetail(schedule) {
    const diff = getDaysDiffFromToday(schedule.schedule_date);

    // 1. 지난 날짜: 조회 불가 및 즉시 차단
    if (diff < 0) {
      alert("지난 날짜의 컨디션은 조회할 수 없습니다.");
      return;
    }

    // 2. +7일 이상: 조회 불가 및 즉시 차단
    if (diff >= 7) {
      alert("아직 컨디션 조회가 되지 않는 날짜입니다.");
      return;
    }

    // 3. 오늘(0: TODAY) 및 +1~+6일(1~3: SHORT, 4~6: MID) 범위 (Cache First)
    if (schedule.point_type === "custom") {
      loadLocalCustomSpots();
      const spot = customSpots.find(s => String(s.id) === String(schedule.custom_spot_id));
      if (!spot) {
        alert("스팟을 찾을 수 없습니다.");
        return;
      }

      // Check if session storage eval exists
      const evalKey = `snorky_custom_eval_v1:${userId}:${spot.id}`;
      let cached = null;
      try {
        cached = JSON.parse(sessionStorage.getItem(evalKey) || "null");
      } catch (_) {}

      const pointForUi = {
        id: spot.id,
        name: spot.name,
        lat: spot.lat,
        lng: spot.lng,
        latitude: spot.lat,
        longitude: spot.lng,
        region: cached?.point?.region || spot.region,
        warning_area_code: cached?.point?.warning_area_code || null,
        land_warning_area_code: cached?.point?.land_warning_area_code || null,
        isCustomSpot: true,
      };

      if (cached && cached.expiresAt > Date.now() && Array.isArray(cached.results)) {
        window.SNORKYEvaluationResults?.registerDryRunResults?.(spot.id, cached.results, cached.expiresAt);
        if (diff === 0 && window.SNORKYTodayConditionDetail?.open) {
          await window.SNORKYTodayConditionDetail.open(pointForUi, schedule.planned_time ? { targetTime: schedule.planned_time } : {});
        } else if (diff >= 1 && diff <= 6 && window.SNORKYDailyForecast?.open) {
          await window.SNORKYDailyForecast.open(pointForUi, schedule.schedule_date, schedule.planned_time);
        } else {
          location.href = `./my-spots.html`;
        }
      } else {
        location.href = `./my-spots.html`;
      }
    } else {
      // Official Point
      await loadOfficialPoints();
      const pt = officialPoints.find(p => String(p.legacy_id) === String(schedule.point_id) || String(p.id) === String(schedule.point_id));
      if (!pt) {
        alert("포인트 정보를 찾을 수 없습니다.");
        return;
      }

      const pointForUi = {
        id: pt.legacy_id,
        legacy_id: pt.legacy_id,
        supabaseId: pt.id,
        name: pt.name,
        region: pt.regionName,
        lat: pt.lat,
        lng: pt.lng,
        warning_area_code: pt.warning_area_code,
        land_warning_area_code: pt.land_warning_area_code,
      };

      if (diff === 0 && window.SNORKYTodayConditionDetail?.open) {
        await window.SNORKYTodayConditionDetail.open(pointForUi, schedule.planned_time ? { targetTime: schedule.planned_time } : {});
      } else if (diff >= 1 && diff <= 6 && window.SNORKYDailyForecast?.open) {
        await window.SNORKYDailyForecast.open(pointForUi, schedule.schedule_date, schedule.planned_time);
      } else {
        location.href = `./index.html`;
      }
    }
  }

  // Open Schedule Modal (Add or Edit)
  async function openScheduleModal(item = null, defaultDate = null) {
    const targetDate = item ? item.schedule_date : (defaultDate || selectedDateStr || todayStr);

    // 지난 날짜 신규 등록 차단
    if (!item && targetDate < todayStr) {
      alert("지난 날짜에는 스케줄을 등록할 수 없습니다.");
      return;
    }

    await loadOfficialPoints();
    populateCustomSpotSelect();

    editingScheduleId = item ? item.id : null;
    scheduleModalTitle.textContent = item ? "스케줄 수정" : "스케줄 추가";
    scheduleModalStatus.textContent = "";
    scheduleModalStatus.className = "schedule-modal-status";

    scheduleDateInput.min = todayStr;
    scheduleDateInput.value = targetDate;
    schedulePlannedTimeInput.value = item?.planned_time || "";
    scheduleMemoInput.value = item?.memo || "";

    if (item) {
      selectedPointType = item.point_type || "official";
      if (selectedPointType === "custom") {
        customSpotSelect.value = item.custom_spot_id || "";
        pointSearchInput.value = "";
        selectedOfficialPointIdInput.value = "";
        selectedOfficialPointNameInput.value = "";
        pointSearchResults.innerHTML = '<div class="schedule-search-hint">포인트명 또는 지역명을 검색해 주세요.</div>';
      } else {
        selectedOfficialPointIdInput.value = item.point_id || "";
        selectedOfficialPointNameInput.value = item.point_name || "";
        pointSearchInput.value = item.point_name || "";
        customSpotSelect.value = "";
        // 기존 선택 포인트 검색 결과 표시
        const matching = officialPoints.filter(p => String(p.legacy_id) === String(item.point_id) || p.name === item.point_name);
        if (matching.length > 0) {
          renderPointSearchResults(matching);
        } else {
          searchOfficialPoints();
        }
      }
    } else {
      selectedPointType = "official";
      pointSearchInput.value = "";
      selectedOfficialPointIdInput.value = "";
      selectedOfficialPointNameInput.value = "";
      pointSearchResults.innerHTML = '<div class="schedule-search-hint">포인트명 또는 지역명을 검색해 주세요.</div>';
      customSpotSelect.value = "";
    }

    updatePointTypeTabs();
    scheduleModal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeScheduleModal() {
    scheduleModal.hidden = true;
    document.body.style.overflow = "";
    scheduleModalStatus.textContent = "";
    editingScheduleId = null;
  }

  function updatePointTypeTabs() {
    tabOfficial?.classList.toggle("active", selectedPointType === "official");
    tabFavorite?.classList.toggle("active", selectedPointType === "favorite");
    tabCustom?.classList.toggle("active", selectedPointType === "custom");

    if (officialPointSec) officialPointSec.hidden = selectedPointType !== "official";
    if (favoritePointSec) favoritePointSec.hidden = selectedPointType !== "favorite";
    if (customPointSec) customPointSec.hidden = selectedPointType !== "custom";

    if (selectedPointType === "favorite") {
      renderFavoritePoints();
    }
  }

  // Save Schedule (Create or Update)
  async function saveSchedule(e) {
    e.preventDefault();
    scheduleModalStatus.textContent = "";
    scheduleModalStatus.className = "schedule-modal-status";

    const dateVal = scheduleDateInput.value.trim();
    if (!dateVal) {
      scheduleModalStatus.textContent = "날짜를 선택해 주세요.";
      return;
    }

    if (dateVal < todayStr) {
      scheduleModalStatus.textContent = "지난 날짜에는 스케줄을 등록할 수 없습니다.";
      return;
    }

    let pointId = null;
    let customSpotId = null;
    let pointName = "";
    let savePointType = "official";

    if (selectedPointType === "official" || selectedPointType === "favorite") {
      savePointType = "official";
      pointId = selectedOfficialPointIdInput.value.trim();
      pointName = selectedOfficialPointNameInput.value.trim();
      if (!pointId || !pointName) {
        scheduleModalStatus.textContent = selectedPointType === "favorite"
          ? "즐겨찾기 포인트를 선택해 주세요."
          : "SNORKY 포인트를 검색 후 선택해 주세요.";
        return;
      }
    } else {
      savePointType = "custom";
      customSpotId = customSpotSelect.value;
      if (!customSpotId) {
        scheduleModalStatus.textContent = "나만의 스팟을 선택해 주세요.";
        return;
      }
      const selectedOpt = customSpotSelect.options[customSpotSelect.selectedIndex];
      pointName = selectedOpt?.getAttribute("data-name") || selectedOpt?.text || "나만의 스팟";
    }

    const plannedTimeVal = schedulePlannedTimeInput?.value?.trim() || null;
    const memoVal = scheduleMemoInput.value.trim();
    const sb = getSbClient();
    if (!sb) {
      scheduleModalStatus.textContent = "데이터베이스 연결에 실패했습니다.";
      return;
    }

    saveScheduleBtn.disabled = true;
    saveScheduleBtn.textContent = "저장 중...";

    try {
      if (editingScheduleId) {
        const { error } = await sb
          .from("user_diving_schedules")
          .update({
            schedule_date: dateVal,
            planned_time: plannedTimeVal,
            point_type: savePointType,
            point_id: pointId,
            custom_spot_id: customSpotId,
            point_name: pointName,
            memo: memoVal || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingScheduleId)
          .eq("user_id", userId);

        if (error) throw error;
      } else {
        const { error } = await sb
          .from("user_diving_schedules")
          .insert({
            user_id: userId,
            schedule_date: dateVal,
            planned_time: plannedTimeVal,
            point_type: savePointType,
            point_id: pointId,
            custom_spot_id: customSpotId,
            point_name: pointName,
            memo: memoVal || null,
            share_token: createSecureToken(),
          });

        if (error) throw error;
      }

      selectedDateStr = dateVal;
      // If date belongs to another month, switch calendar month
      const savedDate = new Date(dateVal);
      currentYear = savedDate.getFullYear();
      currentMonth = savedDate.getMonth();

      await loadMonthSchedules();
      closeScheduleModal();
    } catch (err) {
      console.error("[SNORKY Diving Schedule Save Error]", err);
      scheduleModalStatus.textContent = err.message || "스케줄 저장 중 오류가 발생했습니다.";
    } finally {
      saveScheduleBtn.disabled = false;
      saveScheduleBtn.textContent = "저장";
    }
  }

  // Delete Schedule
  async function deleteSchedule(id) {
    if (!confirm("해당 다이빙 스케줄을 삭제하시겠습니까?")) return;
    const sb = getSbClient();
    if (!sb) return;

    try {
      const { error } = await sb
        .from("user_diving_schedules")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (error) throw error;
      await loadMonthSchedules();
    } catch (err) {
      console.error("[SNORKY Diving Schedule Delete Error]", err);
      alert("스케줄 삭제 중 오류가 발생했습니다.");
    }
  }

  // Event Listeners
  prevMonthBtn?.addEventListener("click", () => {
    if (currentMonth === 0) {
      currentMonth = 11;
      currentYear -= 1;
    } else {
      currentMonth -= 1;
    }
    loadMonthSchedules();
  });

  nextMonthBtn?.addEventListener("click", () => {
    if (currentMonth === 11) {
      currentMonth = 0;
      currentYear += 1;
    } else {
      currentMonth += 1;
    }
    loadMonthSchedules();
  });

  todayNavBtn?.addEventListener("click", () => {
    const today = getKstDate();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    selectedDateStr = todayStr;
    loadMonthSchedules();
  });

  addScheduleBtn?.addEventListener("click", () => openScheduleModal(null, selectedDateStr));

  closeScheduleModalBtn?.addEventListener("click", closeScheduleModal);
  cancelScheduleModalBtn?.addEventListener("click", closeScheduleModal);
  scheduleModalBackdrop?.addEventListener("click", closeScheduleModal);

  tabOfficial?.addEventListener("click", () => {
    selectedPointType = "official";
    updatePointTypeTabs();
  });

  tabFavorite?.addEventListener("click", () => {
    selectedPointType = "favorite";
    updatePointTypeTabs();
  });

  tabCustom?.addEventListener("click", () => {
    selectedPointType = "custom";
    updatePointTypeTabs();
  });

  pointSearchBtn?.addEventListener("click", searchOfficialPoints);
  pointSearchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchOfficialPoints();
    }
  });

  scheduleForm?.addEventListener("submit", saveSchedule);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !scheduleModal.hidden) {
      closeScheduleModal();
    }
  });

  // Init
  window.addEventListener("snorky:supabase-ready", () => {
    loadMonthSchedules();
    loadOfficialPoints();
  });

  if (window.getSnorkySupabase || window.snorkySupabase) {
    loadMonthSchedules();
    loadOfficialPoints();
  }
})();
