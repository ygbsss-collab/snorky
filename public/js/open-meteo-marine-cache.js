(function(){
"use strict";
const requests=new Map(), TIMEOUT_MS=6000;

/**
 * pointId가 정수 PK이면 그대로 반환.
 * 아닌 경우 SNORKY_ACTIVE_POINTS에서 포인트명 또는 id 기준으로 Supabase PK를 찾는다.
 * 좌표 매칭은 보조 수단으로만 사용한다.
 *
 * @param {*} pointId  spot.supabaseId | spot.id | 배열 이름 등
 * @param {string} pointName  spot.name (매칭 우선순위에 사용)
 * @param {number} latitude
 * @param {number} longitude
 * @returns {number|null} Supabase points.id 정수 PK 또는 null
 */
function resolveSupabasePointId(pointId, pointName, latitude, longitude) {
  // 1순위: 이미 정수 PK이면 바로 반환
  const asInt = Number(pointId);
  if (Number.isInteger(asInt) && asInt >= 1) return asInt;

  const allPoints = (Array.isArray(window.SNORKY_ACTIVE_POINTS) && window.SNORKY_ACTIVE_POINTS.length)
    ? window.SNORKY_ACTIVE_POINTS
    : [];

  // 2순위: 포인트명 정확 일치
  if (pointName) {
    const byName = allPoints.find(p =>
      Number.isInteger(Number(p.supabaseId)) && Number(p.supabaseId) >= 1 &&
      (p.name === pointName || (Array.isArray(p) && p[0] === pointName))
    );
    if (byName) return Number(byName.supabaseId);
  }

  // 3순위: legacy/local id 문자열 일치
  if (pointId != null && String(pointId).trim()) {
    const byLegacy = allPoints.find(p =>
      Number.isInteger(Number(p.supabaseId)) && Number(p.supabaseId) >= 1 && (
        String(p.id) === String(pointId) ||
        String(p.legacy_id) === String(pointId)
      )
    );
    if (byLegacy) return Number(byLegacy.supabaseId);
  }

  // 4순위: 좌표 보조 매칭 (정밀도 낮음 — 이미 명시적 매칭이 실패한 경우만)
  if (Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))) {
    const latNum = Number(latitude), lngNum = Number(longitude);
    const byCoord = allPoints.find(p => {
      if (!Number.isInteger(Number(p.supabaseId)) || Number(p.supabaseId) < 1) return false;
      const pLat = Number(p.lat ?? p[1]), pLng = Number(p.lng ?? p[2]);
      return Math.abs(pLat - latNum) < 0.002 && Math.abs(pLng - lngNum) < 0.002;
    });
    if (byCoord) return Number(byCoord.supabaseId);
  }

  return null;
}

async function request(pointId, pointName, latitude, longitude){
  const config = window.SNORKY_SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey) return null;

  const validPointId = resolveSupabasePointId(pointId, pointName, latitude, longitude);
  if (!validPointId) {
    console.warn("[SNORKY Marine Cache] Supabase pointId 미확인, 캐시 조회 생략", {
      pointId, pointName, latitude, longitude,
      activePointsCount: window.SNORKY_ACTIVE_POINTS?.length ?? 0
    });
    return null;
  }

  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/open-meteo-marine-cache`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${config.publishableKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ pointId: validPointId, latitude, longitude })
    });
    if (!response.ok) {
      console.warn("[SNORKY Marine Cache] HTTP " + response.status, { pointId: validPointId });
      return null;
    }
    const payload = await response.json();
    if (payload.status !== "READY" || payload.stale || !Array.isArray(payload.hourly?.time) || !payload.hourly.time.length) {
      return null;
    }
    return {
      hourly: payload.hourly,
      timezone: "Asia/Seoul",
      source: "supabase_open_meteo_marine_cache",
      fetchedAt: payload.fetchedAt
    };
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.warn("[SNORKY MARINE CACHE] fetch failed", error?.message || String(error));
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {*} pointId   spot.supabaseId 또는 spot.id
 * @param {string} pointName  spot.name (매칭에 사용)
 * @param {number} latitude
 * @param {number} longitude
 */
function fetchCache(pointId, pointName, latitude, longitude){
  const validPointId = resolveSupabasePointId(pointId, pointName, latitude, longitude);
  const key = `${validPointId ?? pointId ?? "coord"}:${Number(latitude).toFixed(4)}:${Number(longitude).toFixed(4)}`;
  if (!requests.has(key)) {
    const promise = request(pointId, pointName, latitude, longitude).then(result => {
      if (!result) { requests.delete(key); return null; }
      return result;
    }).catch(() => { requests.delete(key); return null; });
    requests.set(key, promise);
  }
  return requests.get(key);
}

window.SNORKYOpenMeteoMarineCache = Object.freeze({
  fetch: fetchCache,
  clear: () => requests.clear()
});
})();
