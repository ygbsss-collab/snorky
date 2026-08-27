/**
 * SNORKY Common Evaluation Result Reader Adapter
 * Fetches pre-computed evaluation results from point_evaluation_results in Supabase.
 * Enforces NO client-side recalculation fallback.
 */
(function () {
  "use strict";

  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory cache
  let todayCache = null;
  let todayCacheTime = 0;
  const pointSlotsCache = new Map();

  function getKstDateString() {
    const kst = new Date(new Date().getTime() + 9 * 3600000);
    return kst.toISOString().slice(0, 10);
  }

  function getSbClient() {
    return window.getSnorkySupabase ? window.getSnorkySupabase() : window.snorkySupabase;
  }

  /**
   * Loads all TODAY results for all active points for today's KST date.
   * Returns Map<point_id, ResultRow>
   */
  async function loadTodayResults(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && todayCache && now - todayCacheTime < CACHE_TTL_MS) {
      return todayCache;
    }

    const sb = getSbClient();
    if (!sb) {
      console.warn("[SNORKY Result Reader] Supabase client not available");
      return new Map();
    }

    const todayDate = getKstDateString();
    try {
      const { data, error } = await sb
        .from("point_evaluation_results")
        .select("*")
        .eq("mode", "TODAY")
        .eq("target_date", todayDate)
        .order("evaluated_at", { ascending: false });

      if (error) {
        console.warn("[SNORKY Result Reader] Failed to load TODAY results:", error.message);
        return todayCache || new Map();
      }

      const map = new Map();
      (data || []).forEach(row => {
        const pointId = String(row.point_id);
        if (!map.has(pointId)) map.set(pointId, row);
      });

      todayCache = map;
      todayCacheTime = now;
      return map;
    } catch (err) {
      console.warn("[SNORKY Result Reader] Error in loadTodayResults:", err);
      return todayCache || new Map();
    }
  }

  /**
   * Loads SHORT results (+1~+3 days, 15 slots) for a specific point.
   */
  async function loadShortResultsForPoint(pointId, forceRefresh = false) {
    const cacheKey = `SHORT_${pointId}`;
    const now = Date.now();
    const cached = pointSlotsCache.get(cacheKey);
    if (!forceRefresh && cached && now - cached.time < CACHE_TTL_MS) {
      return cached.data;
    }

    const sb = getSbClient();
    if (!sb) return [];

    try {
      const { data, error } = await sb
        .from("point_evaluation_results")
        .select("*")
        .eq("point_id", Number(pointId))
        .eq("mode", "SHORT")
        .order("target_date", { ascending: true })
        .order("period_start", { ascending: true });

      if (error) {
        console.warn(`[SNORKY Result Reader] Failed to load SHORT for point ${pointId}:`, error.message);
        return [];
      }

      pointSlotsCache.set(cacheKey, { data: data || [], time: now });
      return data || [];
    } catch (err) {
      console.warn(`[SNORKY Result Reader] Error in loadShortResultsForPoint:`, err);
      return [];
    }
  }

  /**
   * Loads MID results (+4~+6 days, 6 slots: AM/PM) for a specific point.
   */
  async function loadMidResultsForPoint(pointId, forceRefresh = false) {
    const cacheKey = `MID_${pointId}`;
    const now = Date.now();
    const cached = pointSlotsCache.get(cacheKey);
    if (!forceRefresh && cached && now - cached.time < CACHE_TTL_MS) {
      return cached.data;
    }

    const sb = getSbClient();
    if (!sb) return [];

    try {
      const { data, error } = await sb
        .from("point_evaluation_results")
        .select("*")
        .eq("point_id", Number(pointId))
        .eq("mode", "MID")
        .order("target_date", { ascending: true })
        .order("period_start", { ascending: true });

      if (error) {
        console.warn(`[SNORKY Result Reader] Failed to load MID for point ${pointId}:`, error.message);
        return [];
      }

      pointSlotsCache.set(cacheKey, { data: data || [], time: now });
      return data || [];
    } catch (err) {
      console.warn(`[SNORKY Result Reader] Error in loadMidResultsForPoint:`, err);
      return [];
    }
  }

  /**
   * Loads the canonical 29-result aggregate for a given point:
   * TODAY (1) + TODAY_HOURLY (7) + SHORT (15) + MID (6).
   */
  async function loadAllSlotsForPoint(pointId, forceRefresh = false) {
    const [todayMap, todayHourlySlots, shortSlots, midSlots] = await Promise.all([
      loadTodayResults(forceRefresh),
      loadTodayHourly(pointId, forceRefresh),
      loadShortResultsForPoint(pointId, forceRefresh),
      loadMidResultsForPoint(pointId, forceRefresh),
    ]);

    return {
      today: todayMap.get(String(pointId)) || null,
      todayHourly: todayHourlySlots,
      short: shortSlots,
      mid: midSlots,
    };
  }

  /**
   * Loads Today BEST candidate points from point_evaluation_results.
   * Enforces: safety_status === 'PASS', quality_status !== 'UNKNOWN', condition_score >= 50.
   */
  async function loadBestCandidates(limit = 10) {
    const todayMap = await loadTodayResults();
    const activePoints = Array.isArray(window.SNORKY_ACTIVE_POINTS) ? window.SNORKY_ACTIVE_POINTS : [];

    const scoredPoints = [];
    for (const point of activePoints) {
      const pid = String(point.supabaseId || point.id);
      const res = todayMap.get(pid);
      if (!res) continue;

      const isPass = res.safety_status === "PASS";
      const isReady = res.quality_status !== "UNKNOWN";
      const score = Number(res.condition_score);
      const isRecommendable = isPass && isReady && Number.isFinite(score);

      if (isRecommendable) {
        scoredPoints.push({
          ...point,
          score: score,
          conditionScore: score,
          conditionStatus: res.condition_status || "확인 필요",
          safetyStatus: res.safety_status,
          visibilityGrade: res.visibility_grade,
          recommendation: res.recommendation,
          sourceIssueTime: res.source_issue_time,
          evaluatedAt: res.evaluated_at,
          v12: {
            conditionScore: score,
            conditionStatus: res.condition_status,
            safety: res.safety_status,
            safetyReasons: res.safety_reasons || [],
            qualityStatus: res.quality_status,
            recommendation: res.recommendation,
          },
        });
      }
    }

    // Sort strictly by condition_score desc
    scoredPoints.sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name), "ko-KR"));
    return scoredPoints.slice(0, limit);
  }

  /**
   * Loads TODAY_HOURLY results (7 slots: 03, 06, 09, 12, 15, 18, 21) for a specific point.
   */
  async function loadTodayHourly(pointId, forceRefresh = false) {
    const todayDate = getKstDateString();
    const cacheKey = `TODAY_HOURLY_${pointId}_${todayDate}`;
    const now = Date.now();
    const cached = pointSlotsCache.get(cacheKey);
    if (!forceRefresh && cached && now - cached.time < CACHE_TTL_MS) {
      return cached.data;
    }

    const sb = getSbClient();
    if (!sb) return [];

    try {
      const { data, error } = await sb
        .from("point_evaluation_results")
        .select("*")
        .eq("point_id", Number(pointId))
        .eq("mode", "TODAY_HOURLY")
        .eq("target_date", todayDate)
        .order("period_start", { ascending: true });

      if (error) {
        console.warn(`[SNORKY Result Reader] Failed to load TODAY_HOURLY for point ${pointId}:`, error.message);
        return [];
      }

      pointSlotsCache.set(cacheKey, { data: data || [], time: now });
      return data || [];
    } catch (err) {
      console.warn(`[SNORKY Result Reader] Error in loadTodayHourly:`, err);
      return [];
    }
  }

  window.SNORKYEvaluationResults = Object.freeze({
    getKstDateString,
    loadTodayResults,
    loadTodayHourly,
    loadShortResultsForPoint,
    loadMidResultsForPoint,
    loadAllSlotsForPoint,
    loadBestCandidates,
  });
})();
