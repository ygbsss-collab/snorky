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
  const dryRunResults = new Map();

  function registerDryRunResults(pointId, rows, expiresAt) {
    const id = String(pointId || "");
    const expiry = Number(expiresAt);
    const source = Array.isArray(rows) ? rows : [];
    if (!id || !source.length || !Number.isFinite(expiry) || expiry <= Date.now()) return false;
    dryRunResults.set(id, { rows: source, expiresAt: expiry });
    return true;
  }

  function getDryRunRows(pointId, mode) {
    const id = String(pointId || "");
    const cached = dryRunResults.get(id);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      dryRunResults.delete(id);
      return null;
    }
    return cached.rows.filter(row => row && row.mode === mode);
  }

  function clearDryRunResults(pointId) {
    dryRunResults.delete(String(pointId || ""));
  }

  function getDryRunToday(pointId) {
    const rows = getDryRunRows(pointId, "TODAY");
    return rows?.[0] || null;
  }

  function getKstDateString() {
    const kst = new Date(new Date().getTime() + 9 * 3600000);
    return kst.toISOString().slice(0, 10);
  }

  function getSbClient() {
    return window.getSnorkySupabase ? window.getSnorkySupabase() : window.snorkySupabase;
  }

  function getResultHour(row) {
    if (row?.hour !== null && row?.hour !== "" && Number.isFinite(Number(row?.hour))) return Number(row.hour);

    const periodStart = row?.period_start || row?.forecast_time;
    if (!periodStart) return null;

    const text = String(periodStart);
    if (text.includes("+09:00")) {
      const match = text.match(/T(\d{2}):/);
      return match ? Number(match[1]) : null;
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getTime() + 9 * 3600000).getUTCHours();
  }

  function selectCurrentTodayHourlySlot(rows, referenceTime = new Date()) {
    if (!Array.isArray(rows) || !rows.length) return null;

    const candidates = rows
      .map(row => ({ row, hour: getResultHour(row) }))
      .filter(item => Number.isFinite(item.hour));
    if (!candidates.length) return rows[0] || null;

    const nowHour = referenceTime.getHours() + referenceTime.getMinutes() / 60;
    const latestPast = [...candidates].filter(item => item.hour < nowHour).sort((a, b) => b.hour - a.hour)[0];
    const nearestFuture = [...candidates].filter(item => item.hour >= nowHour).sort((a, b) => a.hour - b.hour)[0];
    const selected = !latestPast ? nearestFuture : !nearestFuture ? latestPast
      : nowHour - latestPast.hour <= nearestFuture.hour - nowHour ? latestPast : nearestFuture;
    return selected?.row || candidates[0].row;
  }

  function getWarningDisplayLabel(warning) {
    if (!warning) return null;
    const type = String(warning.warningName || "").replace(/\s+/g, "").trim();
    const level = String(warning.levelName || "").replace(/\s+/g, "").trim();
    if (!type && !level) return null;
    if (level && type.includes(level)) return type;
    if (/주의보$|경보$|특보$/.test(type)) return type;
    return `${type || "해상"}${level || "특보"}`;
  }

  function getSafetyReasonDisplayLabel(reason) {
    const text = String(reason || "").trim();
    if (!text) return null;
    const warningMatch = text.replace(/\s+/g, "").match(/(태풍(?:주의보|경보)|풍랑(?:주의보|경보)|폭풍해일(?:주의보|경보)|지진해일(?:주의보|경보)|호우(?:주의보|경보)|강풍(?:주의보|경보)|해일(?:주의보|경보))/);
    if (warningMatch) return warningMatch[1];
    if (/유의파고|파고/.test(text)) return "유의파고 위험";
    if (/조류|유속/.test(text)) return "강한 조류";
    if (/풍속|강풍|바람/.test(text)) return "강한 바람";
    if (/낙뢰/.test(text)) return "낙뢰 위험";
    if (/호우|폭우/.test(text)) return "호우 위험";
    return "기타 안전 위험";
  }

  function safetyDisplayPriority(label) {
    const priorities = {
      "태풍경보": 1,
      "태풍주의보": 2,
      "풍랑경보": 3,
      "풍랑주의보": 4,
      "호우경보": 6,
      "호우주의보": 7,
      "강풍경보": 8,
      "강풍주의보": 9,
    };
    if (priorities[label]) return priorities[label];
    if (String(label).startsWith("폭풍해일") || String(label).startsWith("지진해일")) return 5;
    return 99;
  }

  function formatSafetyBlockSummary(warningOrWarnings, reasons = []) {
    const labels = [];
    const warnings = Array.isArray(warningOrWarnings) ? warningOrWarnings : [warningOrWarnings].filter(Boolean);
    warnings.forEach(warning => {
      const warningLabel = getWarningDisplayLabel(warning);
      if (warningLabel && !labels.includes(warningLabel)) labels.push(warningLabel);
    });

    (Array.isArray(reasons) ? reasons : []).forEach(reason => {
      const label = getSafetyReasonDisplayLabel(reason);
      if (label && !labels.includes(label)) labels.push(label);
    });

    if (!labels.length) labels.push("기타 안전 위험");
    labels.sort((a, b) => safetyDisplayPriority(a) - safetyDisplayPriority(b));
    return `입수 금지 · ${labels[0]}${labels.length > 1 ? ` 외 ${labels.length - 1}건` : ""}`;
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

      for (const [pointId] of dryRunResults) {
        const customToday = getDryRunRows(pointId, "TODAY");
        if (customToday?.length) map.set(pointId, customToday[0]);
      }

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
    const dryRows = getDryRunRows(pointId, "SHORT");
    if (dryRows) return dryRows;
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
    const dryRows = getDryRunRows(pointId, "MID");
    if (dryRows) return dryRows;
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
    const dryRows = getDryRunRows(pointId, "TODAY_HOURLY");
    if (dryRows) return dryRows;
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
    selectCurrentTodayHourlySlot,
    formatSafetyBlockSummary,
    loadShortResultsForPoint,
    loadMidResultsForPoint,
    loadAllSlotsForPoint,
    loadBestCandidates,
    registerDryRunResults,
    clearDryRunResults,
    getDryRunToday,
  });
})();
