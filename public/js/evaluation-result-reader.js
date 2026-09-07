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
  const onDemandRefreshInFlight = new Map();

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

  function getKstDateByOffset(dayOffset) {
    const date = new Date(`${getKstDateString()}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(dayOffset || 0));
    return date.toISOString().slice(0, 10);
  }

  function filterRowsByDateRange(rows, startDate, endDate) {
    return (Array.isArray(rows) ? rows : []).filter(row => {
      const targetDate = String(row?.target_date || "").slice(0, 10);
      return targetDate >= startDate && targetDate <= endDate;
    });
  }

  const REQUIRED_MARINE_METRIC_KEYS = [
    "wave_height",
    "sea_temperature",
  ];

  const REQUIRED_WIND_METRIC_KEYS = [
    "wind_speed",
    "wind_direction_degree",
  ];

  function hasFiniteMetrics(metrics, keys) {
    return keys.every(key => Number.isFinite(metrics[key]));
  }

  function hasMetricKeys(metrics, keys) {
    return keys.every(key => Object.prototype.hasOwnProperty.call(metrics, key));
  }

  function hasCurrentMetrics(row) {
    const metrics = row?.metrics;
    if (!metrics || typeof metrics !== "object") return false;

    const mode = String(row?.mode || "");
    if (mode === "TODAY" || mode === "TODAY_HOURLY") {
      return hasMetricKeys(metrics, [
        ...REQUIRED_MARINE_METRIC_KEYS,
        ...REQUIRED_WIND_METRIC_KEYS,
      ]);
    }
    if (!hasFiniteMetrics(metrics, REQUIRED_MARINE_METRIC_KEYS)) return false;
    if (mode === "SHORT") {
      const targetDate = String(row?.target_date || "").slice(0, 10);
      return targetDate >= getKstDateByOffset(1)
        && targetDate <= getKstDateByOffset(3);
    }
    return mode === "MID";
  }

  function filterCurrentMetricRows(rows) {
    return (Array.isArray(rows) ? rows : []).filter(hasCurrentMetrics);
  }

  function getSbClient() {
    return window.getSnorkySupabase ? window.getSnorkySupabase() : window.snorkySupabase;
  }

  async function triggerOnDemandRefresh(pointId) {
    const numericPointId = Number(pointId);
    if (!Number.isSafeInteger(numericPointId) || numericPointId <= 0) return false;
    const key = String(numericPointId);
    const running = onDemandRefreshInFlight.get(key);
    if (running) return running;

    const task = (async () => {
      const sb = typeof window.getSnorkySupabase === "function" ? window.getSnorkySupabase() : null;
      if (!sb?.functions?.invoke) return false;
      const { data, error } = await sb.functions.invoke(
        "point-evaluation-refresh",
        { body: { point_id: numericPointId } }
      );
      if (error || data?.ok === false) {
        throw error || new Error(data?.error || "ON_DEMAND_REFRESH_FAILED");
      }
      return true;
    })().catch((error) => {
      console.warn(`[SNORKY Result Reader] On-Demand refresh failed for point ${numericPointId}:`, error?.message || error);
      return false;
    }).finally(() => {
      onDemandRefreshInFlight.delete(key);
    });

    onDemandRefreshInFlight.set(key, task);
    return task;
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

  function parseQueryOptions(forceRefresh, options) {
    let force = false;
    let opt = {};
    if (typeof forceRefresh === "object" && forceRefresh !== null) {
      opt = forceRefresh;
      force = Boolean(opt.forceRefresh);
    } else {
      force = Boolean(forceRefresh);
      if (typeof options === "object" && options !== null) {
        opt = options;
      }
    }
    const allowOnDemand = typeof opt.allowOnDemand === "boolean" ? opt.allowOnDemand : true;
    return { forceRefresh: force, allowOnDemand, options: opt };
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
  async function loadTodayResults(forceRefresh = false, pointId = null, options = {}) {
    let force = false;
    let targetPid = null;
    let opt = {};

    if (typeof forceRefresh === "object" && forceRefresh !== null) {
      opt = forceRefresh;
      force = Boolean(opt.forceRefresh);
      targetPid = opt.pointId ?? null;
    } else {
      force = Boolean(forceRefresh);
      if (typeof pointId === "object" && pointId !== null) {
        opt = pointId;
        targetPid = opt.pointId ?? null;
      } else {
        targetPid = pointId;
        if (typeof options === "object" && options !== null) {
          opt = options;
        }
      }
    }
    const allowOnDemand = typeof opt.allowOnDemand === "boolean" ? opt.allowOnDemand : true;
    const now = Date.now();
    const requestedPointId = targetPid === null || targetPid === undefined ? "" : String(targetPid);
    const rawDryRowsForPoint = requestedPointId ? getDryRunRows(requestedPointId, "TODAY") : null;
    const dryRowsForPoint = rawDryRowsForPoint ? filterCurrentMetricRows(rawDryRowsForPoint) : null;
    if (!force && todayCache && now - todayCacheTime < CACHE_TTL_MS) {
      if (dryRowsForPoint?.length) {
        const map = new Map(todayCache);
        map.set(requestedPointId, dryRowsForPoint[0]);
        return map;
      }
      if (!requestedPointId || todayCache.has(requestedPointId)) return todayCache;
    }

    const sb = getSbClient();
    if (!sb) {
      console.warn("[SNORKY Result Reader] Supabase client not available");
      return new Map();
    }

    const todayDate = getKstDateString();
    try {
      const queryToday = () => sb
        .from("point_evaluation_results")
        .select("*")
        .eq("mode", "TODAY")
        .eq("target_date", todayDate)
        .order("evaluated_at", { ascending: false });
      const firstResult = await queryToday();
      let data = filterCurrentMetricRows(firstResult.data || []);
      const error = firstResult.error;

      if (error) {
        console.warn("[SNORKY Result Reader] Failed to load TODAY results:", error.message);
        return todayCache || new Map();
      }

      const requestedRowExists = requestedPointId && data.some(row => String(row.point_id) === requestedPointId);
      if (allowOnDemand && requestedPointId && !rawDryRowsForPoint && !requestedRowExists && await triggerOnDemandRefresh(requestedPointId)) {
        const retryResult = await queryToday();
        if (retryResult.error) {
          console.warn("[SNORKY Result Reader] Failed to reload TODAY results:", retryResult.error.message);
        } else {
          data = filterCurrentMetricRows(retryResult.data || []);
        }
      }

      const map = new Map();
      data.forEach(row => {
        const pid = String(row.point_id);
        if (!map.has(pid)) map.set(pid, row);
      });

      for (const [pid] of dryRunResults) {
        const customToday = filterCurrentMetricRows(getDryRunRows(pid, "TODAY"));
        if (customToday?.length) map.set(pid, customToday[0]);
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
   * Loads SHORT results (+1~+3 days, 21 slots) for a specific point.
   */
  async function loadShortResultsForPoint(pointId, forceRefresh = false, options = {}) {
    const { forceRefresh: force, allowOnDemand } = parseQueryOptions(forceRefresh, options);
    const dryRows = getDryRunRows(pointId, "SHORT");
    const startDate = getKstDateByOffset(1);
    const endDate = getKstDateByOffset(3);
    if (dryRows) return filterCurrentMetricRows(filterRowsByDateRange(dryRows, startDate, endDate));
    const cacheKey = `SHORT_${pointId}_${startDate}_${endDate}`;
    const now = Date.now();
    const cached = pointSlotsCache.get(cacheKey);
    if (!force && cached && now - cached.time < CACHE_TTL_MS) {
      return cached.data;
    }

    const sb = getSbClient();
    if (!sb) return [];

    try {
      const queryShort = () => sb
        .from("point_evaluation_results")
        .select("*")
        .eq("point_id", Number(pointId))
        .eq("mode", "SHORT")
        .gte("target_date", startDate)
        .lte("target_date", endDate)
        .order("target_date", { ascending: true })
        .order("period_start", { ascending: true });
      const firstResult = await queryShort();
      let data = filterCurrentMetricRows(firstResult.data || []);
      const error = firstResult.error;

      if (error) {
        console.warn(`[SNORKY Result Reader] Failed to load SHORT for point ${pointId}:`, error.message);
        return [];
      }

      if (allowOnDemand && data.length !== 21 && await triggerOnDemandRefresh(pointId)) {
        const retryResult = await queryShort();
        if (retryResult.error) {
          console.warn(`[SNORKY Result Reader] Failed to reload SHORT for point ${pointId}:`, retryResult.error.message);
        } else {
          data = filterCurrentMetricRows(retryResult.data || []);
        }
      }

      pointSlotsCache.set(cacheKey, { data, time: Date.now() });
      return data;
    } catch (err) {
      console.warn(`[SNORKY Result Reader] Error in loadShortResultsForPoint:`, err);
      return [];
    }
  }

  /**
   * Loads MID results (+4~+6 days, 6 slots: AM/PM) for a specific point.
   */
  async function loadMidResultsForPoint(pointId, forceRefresh = false, options = {}) {
    const { forceRefresh: force, allowOnDemand } = parseQueryOptions(forceRefresh, options);
    const dryRows = getDryRunRows(pointId, "MID");
    const startDate = getKstDateByOffset(4);
    const endDate = getKstDateByOffset(6);
    if (dryRows) return filterRowsByDateRange(dryRows, startDate, endDate);
    const cacheKey = `MID_${pointId}_${startDate}_${endDate}`;
    const now = Date.now();
    const cached = pointSlotsCache.get(cacheKey);
    if (!force && cached && now - cached.time < CACHE_TTL_MS) {
      return cached.data;
    }

    const sb = getSbClient();
    if (!sb) return [];

    try {
      const queryMid = () => sb
        .from("point_evaluation_results")
        .select("*")
        .eq("point_id", Number(pointId))
        .eq("mode", "MID")
        .gte("target_date", startDate)
        .lte("target_date", endDate)
        .order("target_date", { ascending: true })
        .order("period_start", { ascending: true });
      const firstResult = await queryMid();
      let data = firstResult.data || [];
      const error = firstResult.error;

      if (error) {
        console.warn(`[SNORKY Result Reader] Failed to load MID for point ${pointId}:`, error.message);
        return [];
      }

      if (allowOnDemand && !data.length && await triggerOnDemandRefresh(pointId)) {
        const retryResult = await queryMid();
        if (retryResult.error) {
          console.warn(`[SNORKY Result Reader] Failed to reload MID for point ${pointId}:`, retryResult.error.message);
        } else {
          data = retryResult.data || [];
        }
      }

      pointSlotsCache.set(cacheKey, { data, time: Date.now() });
      return data;
    } catch (err) {
      console.warn(`[SNORKY Result Reader] Error in loadMidResultsForPoint:`, err);
      return [];
    }
  }

  /**
   * Loads the canonical 35-result aggregate for a given point:
   * TODAY (1) + TODAY_HOURLY (7) + SHORT (21) + MID (6).
   */
  async function loadAllSlotsForPoint(pointId, forceRefresh = false, options = {}) {
    const { forceRefresh: force, options: opt } = parseQueryOptions(forceRefresh, options);
    const [todayMap, todayHourlySlots, shortSlots, midSlots] = await Promise.all([
      loadTodayResults(force, pointId, opt),
      loadTodayHourly(pointId, force, opt),
      loadShortResultsForPoint(pointId, force, opt),
      loadMidResultsForPoint(pointId, force, opt),
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
  async function loadTodayHourly(pointId, forceRefresh = false, options = {}) {
    const { forceRefresh: force, allowOnDemand } = parseQueryOptions(forceRefresh, options);
    const dryRows = getDryRunRows(pointId, "TODAY_HOURLY");
    if (dryRows) return filterCurrentMetricRows(dryRows);
    const todayDate = getKstDateString();
    const cacheKey = `TODAY_HOURLY_${pointId}_${todayDate}`;
    const now = Date.now();
    const cached = pointSlotsCache.get(cacheKey);
    if (!force && cached && now - cached.time < CACHE_TTL_MS) {
      return cached.data;
    }

    const sb = getSbClient();
    if (!sb) return [];

    try {
      const queryTodayHourly = () => sb
        .from("point_evaluation_results")
        .select("*")
        .eq("point_id", Number(pointId))
        .eq("mode", "TODAY_HOURLY")
        .eq("target_date", todayDate)
        .order("period_start", { ascending: true });
      const firstResult = await queryTodayHourly();
      let data = filterCurrentMetricRows(firstResult.data || []);
      const error = firstResult.error;

      if (error) {
        console.warn(`[SNORKY Result Reader] Failed to load TODAY_HOURLY for point ${pointId}:`, error.message);
        return [];
      }

      if (allowOnDemand && data.length !== 7 && await triggerOnDemandRefresh(pointId)) {
        const retryResult = await queryTodayHourly();
        if (retryResult.error) {
          console.warn(`[SNORKY Result Reader] Failed to reload TODAY_HOURLY for point ${pointId}:`, retryResult.error.message);
        } else {
          data = filterCurrentMetricRows(retryResult.data || []);
        }
      }

      pointSlotsCache.set(cacheKey, { data, time: Date.now() });
      return data;
    } catch (err) {
      console.warn(`[SNORKY Result Reader] Error in loadTodayHourly:`, err);
      return [];
    }
  }

  window.SNORKYEvaluationResults = Object.freeze({
    getKstDateString,
    triggerOnDemandRefresh,
    loadTodayResults,
    loadTodayHourly,
    getResultHour,
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
