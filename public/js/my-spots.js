(function () {
  "use strict";

  const KAKAO_MAP_KEY = "c29f1a71a53af406429520da0df21772";
  const EVALUATION_TTL_MS = 60 * 60 * 1000;
  const EVALUATION_CACHE_VERSION = 2;
  const MIN_ANALYSIS_VISIBLE_MS = 3_000;
  const CONDITION_FETCH_ERROR = "컨디션 데이터를 불러오지 못했습니다. 다시 시도해 주세요.";
  const ANALYSIS_STEPS = [
    "선택한 바다 위치를 확인하고 있어요",
    "기상·해양 데이터를 불러오고 있어요",
    "최근 파도와 기상 흐름을 분석하고 있어요",
    "스노키가 입수 컨디션을 종합하고 있어요",
    "분석을 완료했어요",
  ];
  const LONG_ANALYSIS_MESSAGE = "처음 확인하는 위치라 조금 더 분석하고 있어요";
  const DEFAULT_CENTER = { lat: 37.7519, lng: 128.8761 };
  const session = window.SNORKYAuthSession?.get?.();
  if (!session?.user?.id) {
    location.replace("./login.html");
    return;
  }

  const userId = String(session.user.id);
  const storageKey = `snorky_custom_spots_v1:${userId}`;
  const listEl = document.getElementById("customSpotList");
  const editorEl = document.getElementById("customSpotEditor");
  const formEl = document.getElementById("customSpotForm");
  const nameEl = document.getElementById("customSpotName");
  const searchEl = document.getElementById("customPlaceSearch");
  const resultsEl = document.getElementById("customPlaceResults");
  const guideEl = document.getElementById("customMapGuide");
  const errorEl = document.getElementById("customSpotError");
  const saveBtn = document.getElementById("saveCustomSpotBtn");

  let spots = readSpots();
  let editingId = null;
  let map = null;
  let marker = null;
  let places = null;
  let geocoder = null;
  let kakaoReady = null;
  let finalCoordinates = null;
  let activeEvaluationAnalysis = null;
  const evaluationInFlight = new Map();

  function startEvaluationAnalysis() {
    activeEvaluationAnalysis?.cancel();

    const host = document.querySelector(".custom-spots-app") || document.body;
    const baseController = window.SNORKYConditionAnalysis?.start?.(host) || null;
    const overlay = [...host.children].reverse().find(element => element.classList?.contains("snorky-analysis-overlay")) || null;
    const status = overlay?.querySelector(".snorky-analysis-status") || null;
    const caption = overlay?.querySelector(".snorky-analysis-caption") || null;
    const progress = overlay?.querySelector(".snorky-analysis-progress") || null;
    const timers = new Set();
    let currentMessage = ANALYSIS_STEPS[0];
    let stopped = false;

    if (caption) caption.hidden = true;
    // 실제 서버 진행률을 수신하지 않으므로 시간 기반 진행 점은 표시하지 않는다.
    if (progress) progress.hidden = true;
    if (status) status.textContent = currentMessage;
    host.setAttribute("aria-busy", "true");

    // 공통 오버레이의 기본 문구 변경 타이머가 있어도 나만의 스팟 문구를 유지한다.
    const observer = status ? new MutationObserver(() => {
      if (!stopped && status.textContent !== currentMessage) status.textContent = currentMessage;
    }) : null;
    observer?.observe(status, { childList: true, characterData: true, subtree: true });

    function schedule(callback, delay) {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (!stopped) callback();
      }, delay);
      timers.add(timer);
    }

    function setMessage(message) {
      currentMessage = message;
      if (status) status.textContent = message;
    }

    function cleanup() {
      timers.forEach(window.clearTimeout);
      timers.clear();
      observer?.disconnect();
      host.removeAttribute("aria-busy");
      if (activeEvaluationAnalysis === controller) activeEvaluationAnalysis = null;
    }

    function requestStarted() {
      if (stopped) return;
      setMessage(ANALYSIS_STEPS[1]);
      schedule(() => setMessage(ANALYSIS_STEPS[2]), 1_800);
      schedule(() => setMessage(ANALYSIS_STEPS[3]), 4_200);
      schedule(() => setMessage(LONG_ANALYSIS_MESSAGE), 8_000);
    }

    function complete() {
      if (stopped) return;
      stopped = true;
      setMessage(ANALYSIS_STEPS[4]);
      overlay?.classList.add("is-complete");
      cleanup();
      // 완료 문구를 현재 프레임에 반영하되 결과 화면 진입은 지연하지 않는다.
      window.requestAnimationFrame(() => baseController?.cancel());
    }

    function fail() {
      if (stopped) return;
      stopped = true;
      cleanup();
      baseController?.cancel();
    }

    function cancel() {
      if (stopped) return;
      stopped = true;
      cleanup();
      baseController?.cancel();
    }

    const controller = Object.freeze({ requestStarted, complete, fail, cancel });
    activeEvaluationAnalysis = controller;
    return controller;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[char]);
  }

  function readSpots() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(parsed) ? parsed.filter(item => item && Number.isSafeInteger(Number(item.id))) : [];
    } catch (_) {
      return [];
    }
  }

  function persistSpots() {
    localStorage.setItem(storageKey, JSON.stringify(spots));
  }

  function evaluationKey(spotId) {
    return `snorky_custom_eval_v1:${userId}:${spotId}`;
  }

  function readEvaluation(spot) {
    try {
      const value = JSON.parse(sessionStorage.getItem(evaluationKey(spot.id)) || "null");
      if (!value || value.cacheVersion !== EVALUATION_CACHE_VERSION || Number(value.expiresAt) <= Date.now()) {
        sessionStorage.removeItem(evaluationKey(spot.id));
        return null;
      }
      if (Number(value.lat) !== Number(spot.lat) || Number(value.lng) !== Number(spot.lng)) return null;
      if (!Array.isArray(value.results)) return null;
      window.SNORKYEvaluationResults?.registerDryRunResults?.(spot.id, value.results, value.expiresAt);
      return value;
    } catch (_) {
      return null;
    }
  }

  function writeEvaluation(spot, payload) {
    const entry = {
      cacheVersion: EVALUATION_CACHE_VERSION,
      createdAt: Date.now(),
      expiresAt: Date.now() + EVALUATION_TTL_MS,
      lat: spot.lat,
      lng: spot.lng,
      counts: payload.counts,
      point: payload.point,
      results: payload.results,
    };
    sessionStorage.setItem(evaluationKey(spot.id), JSON.stringify(entry));
    window.SNORKYEvaluationResults?.registerDryRunResults?.(spot.id, entry.results, entry.expiresAt);
    return entry;
  }

  function clearEvaluation(spotId) {
    sessionStorage.removeItem(evaluationKey(spotId));
    window.SNORKYEvaluationResults?.clearDryRunResults?.(spotId);
  }

  function renderList() {
    if (!spots.length) {
      listEl.innerHTML = '<div class="custom-spot-empty"><strong>저장한 스팟이 없습니다.</strong><p>장소를 검색한 뒤 지도에서 정확한 좌표를 직접 선택해 보세요.</p></div>';
      return;
    }

    listEl.innerHTML = spots.map(spot => {
      return `<article class="custom-spot-card" data-spot-id="${spot.id}">
        <div class="custom-spot-card-head">
          <div><h2>${escapeHtml(spot.name)}</h2><p class="custom-spot-region">${escapeHtml(spot.region || "지역 확인 필요")}</p></div>
          <div class="custom-card-menu"><button type="button" data-edit-spot="${spot.id}" aria-label="수정">✎</button><button type="button" data-delete-spot="${spot.id}" aria-label="삭제">×</button></div>
        </div>
        <div class="custom-spot-actions">
          <button class="custom-today-btn" type="button" data-today-spot="${spot.id}">오늘 컨디션 보기</button>
          <button class="custom-sixday-btn" type="button" data-sixday-spot="${spot.id}">컨디션 예보</button>
        </div>
      </article>`;
    }).join("");

    listEl.querySelectorAll("[data-edit-spot]").forEach(button => button.addEventListener("click", () => openEditor(Number(button.dataset.editSpot))));
    listEl.querySelectorAll("[data-delete-spot]").forEach(button => button.addEventListener("click", () => deleteSpot(Number(button.dataset.deleteSpot))));
    listEl.querySelectorAll("[data-today-spot]").forEach(button => button.addEventListener("click", () => openCondition(Number(button.dataset.todaySpot), "today")));
    listEl.querySelectorAll("[data-sixday-spot]").forEach(button => button.addEventListener("click", () => openCondition(Number(button.dataset.sixdaySpot), "sixday")));
  }

  function loadKakao() {
    if (kakaoReady) return kakaoReady;
    kakaoReady = new Promise((resolve, reject) => {
      const finish = () => {
        if (!window.kakao?.maps) return reject(new Error("카카오 지도 객체를 불러오지 못했습니다."));
        window.kakao.maps.load(() => {
          if (!kakao.maps.services?.Places || !kakao.maps.services?.Geocoder) return reject(new Error("카카오 장소 검색 서비스를 불러오지 못했습니다."));
          resolve();
        });
      };
      const existing = document.querySelector("script[data-custom-kakao-map]");
      if (existing) {
        existing.addEventListener("load", finish, { once: true });
        existing.addEventListener("error", () => reject(new Error("카카오 지도를 불러오지 못했습니다.")), { once: true });
        if (window.kakao?.maps) finish();
        return;
      }
      const script = document.createElement("script");
      script.dataset.customKakaoMap = "true";
      script.async = true;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_MAP_KEY)}&autoload=false&libraries=services`;
      script.onload = finish;
      script.onerror = () => reject(new Error("카카오 지도를 불러오지 못했습니다."));
      document.head.appendChild(script);
    });
    return kakaoReady;
  }

  async function initializeMap() {
    await loadKakao();
    const initial = finalCoordinates || DEFAULT_CENTER;
    const center = new kakao.maps.LatLng(initial.lat, initial.lng);
    if (!map) {
      map = new kakao.maps.Map(document.getElementById("customSpotMap"), { center, level: finalCoordinates ? 3 : 8 });
      map.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT);
      map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
      kakao.maps.event.addListener(map, "click", event => setFinalCoordinates(event.latLng.getLat(), event.latLng.getLng(), true));
      places = new kakao.maps.services.Places();
      geocoder = new kakao.maps.services.Geocoder();
    } else {
      map.relayout();
      map.setCenter(center);
      map.setLevel(finalCoordinates ? 3 : 8);
    }
    if (finalCoordinates) setFinalCoordinates(finalCoordinates.lat, finalCoordinates.lng, true);
    else if (marker) marker.setMap(null);
  }

  function setFinalCoordinates(lat, lng, moveMap) {
    lat = Number(lat);
    lng = Number(lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    finalCoordinates = { lat, lng };
    guideEl.textContent = "최종 위치가 선택되었습니다. 마커를 드래그하거나 지도를 다시 클릭해 수정할 수 있습니다.";
    guideEl.classList.add("selected");
    if (!map || !window.kakao?.maps) return;
    const position = new kakao.maps.LatLng(lat, lng);
    if (!marker) {
      marker = new kakao.maps.Marker({ map, position, draggable: true, zIndex: 20 });
      kakao.maps.event.addListener(marker, "dragend", () => {
        const next = marker.getPosition();
        setFinalCoordinates(next.getLat(), next.getLng(), false);
      });
    } else {
      marker.setMap(map);
      marker.setPosition(position);
    }
    if (moveMap) map.panTo(position);
  }

  const MAX_CUSTOM_SPOTS = 10;

  async function openEditor(spotId) {
    const existing = spots.find(item => Number(item.id) === Number(spotId)) || null;
    if (!existing && spots.length >= MAX_CUSTOM_SPOTS) {
      window.alert("나만의 스팟은 최대 10개까지 저장할 수 있습니다.");
      return;
    }
    editingId = existing?.id || null;
    finalCoordinates = existing ? { lat: Number(existing.lat), lng: Number(existing.lng) } : null;
    nameEl.value = existing?.name || "";
    searchEl.value = "";
    resultsEl.innerHTML = "";
    errorEl.textContent = "";
    guideEl.textContent = existing
      ? "현재 위치입니다. 마커를 드래그하거나 지도를 다시 클릭해 수정할 수 있습니다."
      : "지도를 클릭하면 마커가 생성됩니다. 마커를 드래그하거나 다시 클릭해 조정할 수 있습니다.";
    guideEl.classList.toggle("selected", Boolean(existing));
    document.getElementById("customEditorTitle").textContent = existing ? "스팟 수정" : "새 스팟 저장";
    editorEl.hidden = false;
    document.body.style.overflow = "hidden";
    try {
      await initializeMap();
      nameEl.focus();
    } catch (error) {
      errorEl.textContent = error.message || "지도를 불러오지 못했습니다.";
    }
  }

  function closeEditor() {
    editorEl.hidden = true;
    document.body.style.overflow = "";
    errorEl.textContent = "";
  }

  function searchPlaces() {
    const keyword = searchEl.value.trim();
    errorEl.textContent = "";
    if (!keyword) {
      errorEl.textContent = "장소명 또는 주소를 입력해 주세요.";
      return;
    }
    if (!places) {
      errorEl.textContent = "장소 검색 서비스를 불러오는 중입니다.";
      return;
    }
    resultsEl.innerHTML = '<div class="custom-search-message">검색 중입니다...</div>';
    places.keywordSearch(keyword, (results, status) => {
      if (status === kakao.maps.services.Status.ZERO_RESULT) {
        resultsEl.innerHTML = '<div class="custom-search-message">검색 결과가 없습니다.</div>';
        return;
      }
      if (status !== kakao.maps.services.Status.OK) {
        resultsEl.innerHTML = '<div class="custom-search-message">장소 검색 중 오류가 발생했습니다.</div>';
        return;
      }
      resultsEl.innerHTML = results.slice(0, 15).map((place, index) => `<button class="custom-search-result" type="button" data-place-index="${index}"><span><strong>${escapeHtml(place.place_name)}</strong><small>${escapeHtml(place.road_address_name || place.address_name || "주소 정보 없음")}</small></span><em>지도 이동</em></button>`).join("");
      resultsEl.querySelectorAll("[data-place-index]").forEach(button => button.addEventListener("click", () => {
        const place = results[Number(button.dataset.placeIndex)];
        const lat = Number(place?.y);
        const lng = Number(place?.x);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        map.setLevel(4);
        map.panTo(new kakao.maps.LatLng(lat, lng));
        guideEl.textContent = "검색 위치로 이동했습니다. 최종 저장 위치는 지도에서 직접 클릭해 확정하세요.";
        guideEl.classList.remove("selected");
        resultsEl.innerHTML = "";
      }));
    });
  }

  function reverseGeocode(lat, lng) {
    return new Promise((resolve, reject) => {
      if (!geocoder) return reject(new Error("카카오 역지오코딩을 사용할 수 없습니다."));
      geocoder.coord2RegionCode(lng, lat, (results, status) => {
        if (status !== kakao.maps.services.Status.OK || !Array.isArray(results) || !results.length) {
          reject(new Error("선택한 좌표의 행정구역을 확인하지 못했습니다."));
          return;
        }
        const region = results.find(item => item.region_type === "H") || results[0];
        const region2DepthName = String(region?.region_2depth_name || "").trim();
        if (!region2DepthName) return reject(new Error("선택한 좌표의 시·군·구를 확인하지 못했습니다."));
        resolve({
          lat,
          lng,
          region2DepthName,
          addressName: String(region?.address_name || "").trim(),
          cachedAt: new Date().toISOString(),
        });
      });
    });
  }

  function createSpotId() {
    const used = new Set(spots.map(item => Number(item.id)));
    let id;
    do id = 1_000_000_000 + crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000_000;
    while (used.has(id));
    return id;
  }

  function customPointForUi(spot, entry) {
    return {
      id: spot.id,
      name: spot.name,
      lat: spot.lat,
      lng: spot.lng,
      latitude: spot.lat,
      longitude: spot.lng,
      region: entry?.point?.region || spot.region,
      warning_area_code: entry?.point?.warning_area_code || null,
      land_warning_area_code: entry?.point?.land_warning_area_code || null,
      isCustomSpot: true,
    };
  }

  async function requestEvaluation(spot) {
    const cached = readEvaluation(spot);
    if (cached) return cached;
    const inFlightKey = `${spot.id}:${spot.lat}:${spot.lng}`;
    if (evaluationInFlight.has(inFlightKey)) return evaluationInFlight.get(inFlightKey);

    const task = (async () => {
      const config = window.SNORKY_SUPABASE_CONFIG;
      if (!config?.url || !config?.publishableKey) throw new Error("평가 서버 설정을 확인해 주세요.");
      const endpoint = `${config.url.replace(/\/$/, "")}/functions/v1/point-evaluation-refresh`;
      let response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            apikey: config.publishableKey,
            Authorization: `Bearer ${config.publishableKey}`,
            "Content-Type": "application/json",
            "x-snorky-user-id": userId,
          },
          body: JSON.stringify({
            user_id: userId,
            dry_run: true,
            custom_point: {
              id: spot.id,
              name: spot.name,
              lat: spot.lat,
              lng: spot.lng,
              region_2depth_name: spot.geocode.region2DepthName,
            },
          }),
        });
      } catch (networkError) {
        console.error("[SNORKY Custom Spot API]", {
          endpoint,
          status: null,
          error: networkError?.message || String(networkError),
        });
        throw new Error(CONDITION_FETCH_ERROR);
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !Array.isArray(payload.results)) {
        console.error("[SNORKY Custom Spot API]", {
          endpoint,
          status: response.status,
          error: payload.message || payload.error || response.statusText,
        });
        throw new Error(CONDITION_FETCH_ERROR);
      }
      const counts = payload.counts || {};
      if (counts.today !== 1 || counts.today_hourly !== 7 || counts.short !== 21 || counts.mid !== 6) {
        throw new Error(`평가 슬롯이 완전하지 않습니다. SHORT ${counts.short || 0}/21 · MID ${counts.mid || 0}/6`);
      }
      const entry = writeEvaluation(spot, payload);
      spot.region = payload.point?.region || spot.region || "지역 확인 필요";
      spot.updatedAt = new Date().toISOString();
      persistSpots();
      return entry;
    })().finally(() => evaluationInFlight.delete(inFlightKey));
    evaluationInFlight.set(inFlightKey, task);
    return task;
  }

  async function requestEvaluationWithAnalysis(spot, readiness = null) {
    const analysis = startEvaluationAnalysis();
    // requestEvaluation은 첫 await 전에 fetch를 시작하므로 최소 노출 타이머와 API가 함께 실행된다.
    const minimumVisible = new Promise(resolve => window.setTimeout(resolve, MIN_ANALYSIS_VISIBLE_MS));
    const evaluationResult = Promise.all([
      requestEvaluation(spot),
      readiness ? Promise.resolve(readiness) : Promise.resolve(null),
    ]).then(
      ([entry]) => ({ ok: true, entry }),
      error => ({ ok: false, error })
    );
    analysis.requestStarted();

    const [settled] = await Promise.all([evaluationResult, minimumVisible]);
    if (settled.ok) {
      analysis.complete();
      return settled.entry;
    }

    analysis.fail();
    throw settled.error;
  }

  async function openEvaluationResult(point, mode) {
    const sharedAnalysis = window.SNORKYConditionAnalysis;
    const analysisSuppressed = sharedAnalysis?.start
      ? Object.freeze({ ...sharedAnalysis, start: () => null })
      : null;

    // API 대기 중 공통 오버레이를 이미 표시했으므로 상세 화면의 중복 오버레이만 이 진입에서 생략한다.
    if (analysisSuppressed) window.SNORKYConditionAnalysis = analysisSuppressed;
    try {
      if (mode === "sixday") await window.SNORKYDailyForecast?.open?.(point);
      else await window.SNORKYTodayConditionDetail?.open?.(point);
    } finally {
      if (analysisSuppressed && window.SNORKYConditionAnalysis === analysisSuppressed) {
        window.SNORKYConditionAnalysis = sharedAnalysis;
      }
    }
  }

  async function saveSpot(event) {
    event.preventDefault();
    const name = nameEl.value.trim();
    const lat = Number(finalCoordinates?.lat);
    const lng = Number(finalCoordinates?.lng);
    const existing = spots.find(item => Number(item.id) === Number(editingId));

    errorEl.textContent = "";
    if (!name) return void (errorEl.textContent = "스팟 이름을 입력해 주세요.");
    if (!finalCoordinates || !Number.isFinite(lat) || !Number.isFinite(lng)) return void (errorEl.textContent = "지도에서 최종 위치를 직접 선택해 주세요.");
    if (lat < 32 || lat > 39.8 || lng < 124 || lng > 132) return void (errorEl.textContent = "대한민국 예보 지원 좌표를 확인해 주세요.");

    // 10개 제한 검증 (신규 등록 시)
    if (!existing && spots.length >= MAX_CUSTOM_SPOTS) {
      return void (errorEl.textContent = "나만의 스팟은 최대 10개까지 저장할 수 있습니다.");
    }

    // 동일 좌표 중복 저장 방지
    const isDuplicateCoord = spots.some(item =>
      Number(item.id) !== Number(editingId) &&
      Math.abs(Number(item.lat) - lat) < 0.0001 &&
      Math.abs(Number(item.lng) - lng) < 0.0001
    );
    if (isDuplicateCoord) {
      return void (errorEl.textContent = "이미 동일한 위치에 저장된 스팟이 있습니다.");
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "저장 중...";
    try {
      const sameCoordinate = existing
        && Number(existing.geocode?.lat) === lat
        && Number(existing.geocode?.lng) === lng
        && existing.geocode?.region2DepthName;
      // 좌표별 최초 저장 시에만 Kakao 역지오코딩 1회, 이후 이름 수정/재평가는 저장값 재사용.
      const geocode = sameCoordinate ? existing.geocode : await reverseGeocode(lat, lng);
      const spot = {
        id: existing?.id || createSpotId(),
        name,
        lat,
        lng,
        region: sameCoordinate ? (existing?.region || geocode.region2DepthName) : geocode.region2DepthName,
        geocode,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (existing) spots = spots.map(item => item.id === existing.id ? spot : item);
      else spots.unshift(spot);
      persistSpots();
      if (!sameCoordinate) clearEvaluation(spot.id);
      closeEditor();
      renderList();
    } catch (error) {
      errorEl.textContent = error.message || "스팟을 저장하지 못했습니다.";
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "저장";
    }
  }

  async function openCondition(spotId, mode) {
    const spot = spots.find(item => Number(item.id) === Number(spotId));
    if (!spot) return;
    try {
      const safetyReady = mode === "today" ? window.SNORKYMarineSafety?.ready : null;
      const entry = await requestEvaluationWithAnalysis(spot, safetyReady);
      renderList();
      const point = customPointForUi(spot, entry);
      await openEvaluationResult(point, mode);
    } catch (error) {
      window.alert(CONDITION_FETCH_ERROR);
    }
  }

  function deleteSpot(spotId) {
    const target = spots.find(item => Number(item.id) === Number(spotId));
    if (!target || !confirm(`'${target.name}' 스팟을 삭제하시겠습니까?`)) return;
    spots = spots.filter(item => Number(item.id) !== Number(spotId));
    persistSpots();
    clearEvaluation(spotId);
    renderList();
  }

  document.getElementById("newCustomSpotBtn")?.addEventListener("click", () => openEditor(null));
  document.getElementById("closeCustomEditorBtn")?.addEventListener("click", closeEditor);
  document.getElementById("cancelCustomSpotBtn")?.addEventListener("click", closeEditor);
  document.getElementById("customPlaceSearchBtn")?.addEventListener("click", searchPlaces);
  searchEl?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchPlaces();
    }
  });
  formEl?.addEventListener("submit", saveSpot);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !editorEl.hidden) closeEditor();
  });

  renderList();
})();
