import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { SnorkyPoint } from "./kma-grid.ts";
import { toKmaGrid } from "./kma-grid.ts";
import { loadRn1History } from "../kma-rn1-cache/index.ts";
import { loadKasiSunTimes } from "../kasi-sun-times-cache/index.ts";
import { loadMidWeatherForPoint } from "../kma-mid-weather-cache/index.ts";
import {
  evaluateToday,
  evaluateShort,
  evaluateMid,
  type ServerEvaluationResult,
} from "./evaluation-engine.ts";
import {
  upsertEvaluationResults,
  type EvaluationResultDbRow,
} from "./evaluation-storage.ts";
import type {
  TodayEvaluationInputDTO,
  ShortEvaluationInputDTO,
  MidEvaluationInputDTO,
  SourceIssueTimeDTO,
  MarineHistoryItem,
  Rn1HistoryItem,
  KasiSunTimesInput,
} from "./evaluation-dto.ts";

export interface OrchestrationResult {
  point_id: string | number;
  point_name: string;
  today_count: number;
  today_hourly_count: number;
  short_count: number;
  mid_count: number;
  total_upserted: number;
  results: ServerEvaluationResult[];
  error?: string | null;
  timings?: OrchestrationTimings;
}

export interface OrchestrationTimings {
  point_input_ms?: number;
  kma_short_cache_ms: number;
  kma_mid_cache_ms: number;
  marine_cache_ms: number;
  kasi_ms: number;
  safety_cache_ms: number;
  rn1_cache_ms?: number;
  cache_total_ms: number;
  today_ms: number;
  today_hourly_ms: number;
  short_ms: number;
  mid_ms: number;
  storage_ms: number;
  total_ms: number;
  cache_status?: Record<string, "HIT" | "MISS" | "UNAVAILABLE" | "PROVIDED">;
}

export interface OrchestrationOptions {
  evaluatedAt?: string;
  dryRun?: boolean; // If true, evaluates without calling DB UPSERT
  modes?: Array<"TODAY" | "TODAY_HOURLY" | "SHORT" | "MID">;
  /** 나만의 스팟은 자연광을 실제 사용하는 Today~+3까지만 KASI를 조회한다. */
  kasiMaxDayOffset?: number;
}

function getKstDateString(date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 3600000);
  return kst.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  const kst = new Date(d.getTime() + 9 * 3600000);
  return kst.toISOString().slice(0, 10);
}

function formatSlotTime(dateStr: string, hour: number): string {
  const h = String(hour).padStart(2, "0");
  return `${dateStr}T${h}:00:00+09:00`;
}

function elapsedMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

export function getKmaMidRegionCodes(point: SnorkyPoint): { landRegId: string | null; tempRegId: string | null } {
  if (point.is_custom_point) {
    const landRegId = String(point.mid_land_reg_id || "").trim();
    const tempRegId = String(point.mid_temp_reg_id || "").trim();
    return {
      landRegId: /^11[A-Z]\d{5}$/.test(landRegId) ? landRegId : null,
      tempRegId: /^11[A-Z]\d{5}$/.test(tempRegId) ? tempRegId : null,
    };
  }

  const regId = Number(point.region_id);
  const name = String(point.name || "");
  const regName = String(point.region || "");

  // 1: 강릉
  if (regId === 1 || regName.includes("강릉") || name.includes("강릉") || name.includes("영진") || name.includes("안목") || name.includes("사천")) {
    return { landRegId: "11D20000", tempRegId: "11D20501" };
  }
  // 2: 고성
  if (regId === 2 || regName.includes("고성") || name.includes("고성") || name.includes("문암") || name.includes("봉수") || name.includes("아야진") || name.includes("천진") || name.includes("백도") || name.includes("거진")) {
    return { landRegId: "11D20000", tempRegId: "11D20401" };
  }
  // 3: 속초/양양
  if (regId === 3 || regName.includes("속초") || regName.includes("양양") || name.includes("속초") || name.includes("양양") || name.includes("하조대") || name.includes("남애") || name.includes("인구") || name.includes("동산")) {
    return { landRegId: "11D20000", tempRegId: "11D20401" };
  }
  // 4: 동해/삼척
  if (regId === 4 || regName.includes("동해") || regName.includes("삼척") || name.includes("동해") || name.includes("삼척") || name.includes("장호") || name.includes("갈남") || name.includes("임원") || name.includes("용화")) {
    return { landRegId: "11D20000", tempRegId: "11D20601" };
  }
  // 5: 울진
  if (regId === 5 || regName.includes("울진") || name.includes("울진") || name.includes("나곡") || name.includes("후포") || name.includes("덕신") || name.includes("산포")) {
    return { landRegId: "11H10000", tempRegId: "11H10101" };
  }
  // 6: 영덕
  if (regId === 6 || regName.includes("영덕") || name.includes("영덕") || name.includes("축산") || name.includes("경정") || name.includes("대탄") || name.includes("오보") || name.includes("창포")) {
    return { landRegId: "11H10000", tempRegId: "11H10301" };
  }
  // 7: 포항/경주/울산
  if (regId === 7 || regName.includes("포항") || regName.includes("울산") || name.includes("호미곶") || name.includes("주전") || name.includes("일산") || name.includes("정자")) {
    return { landRegId: "11H10000", tempRegId: "11H10201" };
  }
  return { landRegId: "11D20000", tempRegId: "11D20501" };
}

async function queryMarineDbCache(client: SupabaseClient, cacheKey: string) {
  try {
    const latest = await client
      .from("open_meteo_marine_cache")
      .select("issued_at, fetched_at, status")
      .eq("cache_key", cacheKey)
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latest.data?.issued_at) return null;

    const rowsRes = await client
      .from("open_meteo_marine_cache")
      .select("forecast_at, normalized_data")
      .eq("cache_key", cacheKey)
      .eq("issued_at", latest.data.issued_at)
      .order("forecast_at", { ascending: true });

    if (!rowsRes.data || !rowsRes.data.length) return null;

    const hourly: Record<string, any[]> = {
      time: [],
      wave_height: [],
      wave_period: [],
      ocean_current_velocity: [],
      sea_surface_temperature: [],
    };

    for (const r of rowsRes.data) {
      const norm = r.normalized_data || {};
      hourly.time.push(norm.forecastAt || r.forecast_at);
      hourly.wave_height.push(norm.wave_height ?? null);
      hourly.wave_period.push(norm.wave_period ?? null);
      hourly.ocean_current_velocity.push(norm.ocean_current_velocity ?? null);
      hourly.sea_surface_temperature.push(norm.sea_surface_temperature ?? null);
    }

    return {
      fetched_at: latest.data.fetched_at,
      issued_at: latest.data.issued_at,
      status: latest.data.status,
      hourly,
    };
  } catch (_) {
    return null;
  }
}

async function queryKmaWeatherDbCache(client: SupabaseClient, gridKey: string) {
  try {
    const res = await client
      .from("kma_weather_cache")
      .select("forecast_data, base_date, base_time, fetched_at, status")
      .eq("grid_key", gridKey)
      .order("base_date", { ascending: false })
      .order("base_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    return res.data || null;
  } catch (_) {
    return null;
  }
}

/**
 * Cache Loader: Loads fresh caches from Supabase for a given point.
 * If Cache MISS, performs on-demand single fetch bootstrap.
 */
export async function loadPointCaches(client: SupabaseClient, point: SnorkyPoint) {
  const lat = Number(point.lat ?? point.latitude);
  const lng = Number(point.lng ?? point.longitude);
  const pointId = Number(point.id);
  const todayKst = getKstDateString();
  const { nx, ny } = toKmaGrid(lat, lng);
  const cacheKey = `${lat.toFixed(4)}:${lng.toFixed(4)}`;
  const gridKey = `${nx}:${ny}`;
  const { landRegId, tempRegId } = getKmaMidRegionCodes(point);

  const envGetter = (globalThis as any).Deno?.env?.get ? (globalThis as any).Deno.env.get.bind((globalThis as any).Deno.env) : (k: string) => process.env[k];
  const supabaseUrl = envGetter("SUPABASE_URL") || "";
  const serviceKey = envGetter("SUPABASE_SERVICE_ROLE_KEY") || envGetter("SUPABASE_ANON_KEY") || "";
  const kmaKey = envGetter("KMA_API_KEY") || envGetter("DATA_GO_KR_API_KEY") || "";
  const cacheTimings: Partial<OrchestrationTimings> | null = point.is_custom_point ? {} : null;
  const timedCache = async <T>(key: keyof OrchestrationTimings, loader: () => Promise<T>): Promise<T> => {
    if (!cacheTimings) return loader();
    const startedAt = performance.now();
    try {
      return await loader();
    } finally {
      const previous = typeof cacheTimings[key] === "number" ? Number(cacheTimings[key]) : 0;
      (cacheTimings as Record<string, unknown>)[key] = previous + elapsedMs(startedAt);
    }
  };

  // 1. Parallel Cache Query
  const [
    marineRes,
    kmaWeatherRes,
    kmaSafetyRes,
    rn1Res,
    midWeatherRes,
  ] = await Promise.all([
    timedCache("marine_cache_ms", () => queryMarineDbCache(client, cacheKey)),
    timedCache("kma_short_cache_ms", () => queryKmaWeatherDbCache(client, gridKey)),
    timedCache("safety_cache_ms", async () => await client
      .from("kma_safety_cache")
      .select("normalized_warnings, warning_index, fetched_at, status")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle()),
    timedCache("rn1_cache_ms", () => loadRn1History(client, nx, ny, `${todayKst}T18:00:00+09:00`, 48)),
    landRegId && tempRegId
      ? timedCache("kma_mid_cache_ms", () => loadMidWeatherForPoint(client, landRegId, tempRegId, todayKst))
      : Promise.resolve(null),
  ]);

  let marineCache = marineRes;
  let kmaWeatherCache = kmaWeatherRes;
  let rn1History = rn1Res || [];
  let midWeather = midWeatherRes;
  const cacheStatus = point.is_custom_point ? {
    marine: marineCache?.hourly?.time?.length ? "HIT" : "MISS",
    kma_short: kmaWeatherCache?.forecast_data?.hourly?.length ? "HIT" : "MISS",
    kma_mid: !landRegId || !tempRegId
      ? "UNAVAILABLE"
      : Object.keys(midWeather?.slots || {}).length >= 3 ? "HIT" : "MISS",
    safety: kmaSafetyRes.data ? "HIT" : "MISS",
    rn1: rn1History.length ? "HIT" : "MISS",
  } as Record<string, "HIT" | "MISS" | "UNAVAILABLE" | "PROVIDED"> : undefined;

  // 2. On-Demand Bootstrap for MISS caches
  const bootstrapTasks: Promise<void>[] = [];

  // Marine MISS -> single on-demand fetch
  if (!marineCache?.hourly?.time?.length && supabaseUrl) {
    bootstrapTasks.push(timedCache("marine_cache_ms", async () => {
      try {
        await fetch(`${supabaseUrl}/functions/v1/open-meteo-marine-cache?pointId=${pointId}&latitude=${lat}&longitude=${lng}`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
        });
        marineCache = await queryMarineDbCache(client, cacheKey);
      } catch (_) {}
    }));
  }

  // KMA 단기 MISS -> single on-demand fetch
  if (!kmaWeatherCache?.forecast_data?.hourly?.length && supabaseUrl) {
    bootstrapTasks.push(timedCache("kma_short_cache_ms", async () => {
      try {
        await fetch(`${supabaseUrl}/functions/v1/kma-weather-cache?nx=${nx}&ny=${ny}`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
        });
        kmaWeatherCache = await queryKmaWeatherDbCache(client, gridKey);
      } catch (_) {}
    }));
  }

  // KMA 중기 MISS -> single on-demand fetch using exact landRegId & tempRegId
  const midSlotCount = Object.keys(midWeather?.slots || {}).length;
  if (landRegId && tempRegId && midSlotCount < 3 && supabaseUrl) {
    bootstrapTasks.push(timedCache("kma_mid_cache_ms", async () => {
      try {
        const nowKst = new Date(Date.now() + 9 * 3600000);
        const dateCompact = nowKst.toISOString().slice(0, 10).replace(/-/g, "");
        const tmFc06 = `${dateCompact}0600`;
        await Promise.all([
          fetch(`${supabaseUrl}/functions/v1/kma-mid-weather-cache`, {
            method: "POST",
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
            body: JSON.stringify({ source: "KMA_MID_LAND", reg_id: landRegId, tm_fc: tmFc06 })
          }),
          fetch(`${supabaseUrl}/functions/v1/kma-mid-weather-cache`, {
            method: "POST",
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
            body: JSON.stringify({ source: "KMA_MID_TA", reg_id: tempRegId, tm_fc: tmFc06 })
          }),
        ]);
        midWeather = await loadMidWeatherForPoint(client, landRegId, tempRegId, todayKst);
      } catch (_) {}
    }));
  }

  // RN1 MISS -> fetch current single observation only (no 48h synthetic generation)
  if (!rn1History.length && supabaseUrl) {
    bootstrapTasks.push(timedCache("rn1_cache_ms", async () => {
      try {
        await fetch(`${supabaseUrl}/functions/v1/kma-rn1-cache?nx=${nx}&ny=${ny}`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
        });
        rn1History = await loadRn1History(client, nx, ny, `${todayKst}T18:00:00+09:00`, 48);
      } catch (_) {}
    }));
  }

  if (bootstrapTasks.length > 0) {
    await Promise.all(bootstrapTasks);
  }

  return {
    marineCache,
    kmaWeatherCache,
    kmaSafetyCache: kmaSafetyRes.data || null,
    rn1History,
    midWeather,
    grid: { nx, ny },
    landRegId,
    tempRegId,
    timings: cacheTimings ? {
      ...cacheTimings,
      cache_status: cacheStatus,
    } : undefined,
  };
}

/**
 * Server Evaluation Orchestrator:
 * Executes Cache Fetch -> DTO Build -> Evaluation (TODAY, TODAY_HOURLY, SHORT, MID) -> Result UPSERT.
 */
export async function evaluateAndStorePoint(
  client: SupabaseClient,
  point: SnorkyPoint,
  cachedData?: {
    marineCache?: any;
    kmaWeatherCache?: any;
    kmaSafetyCache?: any;
  },
  options: OrchestrationOptions = {}
): Promise<OrchestrationResult> {
  const orchestrationStartedAt = performance.now();
  const timings: OrchestrationTimings | undefined = point.is_custom_point ? {
    kma_short_cache_ms: 0,
    kma_mid_cache_ms: 0,
    marine_cache_ms: 0,
    kasi_ms: 0,
    safety_cache_ms: 0,
    rn1_cache_ms: 0,
    cache_total_ms: 0,
    today_ms: 0,
    today_hourly_ms: 0,
    short_ms: 0,
    mid_ms: 0,
    storage_ms: 0,
    total_ms: 0,
  } : undefined;
  const evaluatedAt = options.evaluatedAt || new Date().toISOString();
  const todayKst = getKstDateString();
  const lat = Number(point.lat ?? point.latitude);
  const lng = Number(point.lng ?? point.longitude);

  const envGetter = (globalThis as any).Deno?.env?.get ? (globalThis as any).Deno.env.get.bind((globalThis as any).Deno.env) : (k: string) => process.env[k];
  const kasiKey = envGetter("KASI_API_KEY") || envGetter("DATA_GO_KR_API_KEY") || "";

  // Strict KASI SunTimes pre-load (NO calculated formula fallback)
  const sunTimesMap = new Map<string, KasiSunTimesInput>();
  const kasiMaxDayOffset = Number.isInteger(options.kasiMaxDayOffset)
    ? Math.max(0, Math.min(6, Number(options.kasiMaxDayOffset)))
    : 6;
  const kasiStartedAt = performance.now();
  if (point.is_custom_point) {
    const sunTimes = await Promise.all(
      Array.from({ length: kasiMaxDayOffset + 1 }, async (_, dayOffset) => {
        const date = addDays(todayKst, dayOffset);
        const value = await loadKasiSunTimes(client, lat, lng, date, kasiKey, { fetchTimeoutMs: 7_000 });
        return { date, value };
      })
    );
    sunTimes.forEach(({ date, value }) => sunTimesMap.set(date, value));
  } else {
    for (let d = 0; d <= kasiMaxDayOffset; d++) {
      const dt = addDays(todayKst, d);
      const st = await loadKasiSunTimes(client, lat, lng, dt, kasiKey);
      sunTimesMap.set(dt, st);
    }
  }
  if (timings) timings.kasi_ms = elapsedMs(kasiStartedAt);

  // 1. Caches
  const cachesStartedAt = performance.now();
  const caches = cachedData || (await loadPointCaches(client, point));
  if (timings) {
    const cacheTimings = (caches as any)?.timings || {};
    timings.kma_short_cache_ms = Number(cacheTimings.kma_short_cache_ms) || 0;
    timings.kma_mid_cache_ms = Number(cacheTimings.kma_mid_cache_ms) || 0;
    timings.marine_cache_ms = Number(cacheTimings.marine_cache_ms) || 0;
    timings.safety_cache_ms = Number(cacheTimings.safety_cache_ms) || 0;
    timings.rn1_cache_ms = Number(cacheTimings.rn1_cache_ms) || 0;
    timings.cache_total_ms = elapsedMs(cachesStartedAt);
    timings.cache_status = cachedData
      ? { marine: "PROVIDED", kma_short: "PROVIDED", kma_mid: "PROVIDED", safety: "PROVIDED", rn1: "PROVIDED" }
      : cacheTimings.cache_status;
  }
  const marine = caches.marineCache;
  const kmaWeather = caches.kmaWeatherCache;
  const kmaSafety = caches.kmaSafetyCache;

  // Source issue tracing
  const sourceIssueTime: SourceIssueTimeDTO = {
    marine_issued_at: marine?.fetched_at || null,
    kma_base_time: kmaWeather?.base_time || null,
    kma_safety_fetched_at: kmaSafety?.fetched_at || null,
    rn1_observed_at: caches.rn1History?.[0] ? `${todayKst}T12:00:00+09:00` : null,
    mid_land_base_time: caches.midWeather?.landTmFc || null,
    mid_temp_base_time: caches.midWeather?.tempTmFc || null,
    kasi_sun_times_date: todayKst,
    kasi_sun_times_fetched_at: evaluatedAt,
  };

  const marineTimes: string[] = Array.isArray(marine?.hourly?.time) ? marine.hourly.time : [];
  const waveHeights: number[] = Array.isArray(marine?.hourly?.wave_height) ? marine.hourly.wave_height : [];
  const wavePeriods: number[] = Array.isArray(marine?.hourly?.wave_period) ? marine.hourly.wave_period : [];
  const currentVelocities: number[] = Array.isArray(marine?.hourly?.ocean_current_velocity) ? marine.hourly.ocean_current_velocity : [];
  const seaTemperatures: number[] = Array.isArray(marine?.hourly?.sea_surface_temperature) ? marine.hourly.sea_surface_temperature : [];

  const marineIndexMap = new Map<string, number>();
  marineTimes.forEach((t, i) => {
    // Normalizes to KST slot key "YYYY-MM-DDTHH"
    let key = "";
    if (typeof t === "string") {
      const raw = t.replace(" ", "T");
      if (raw.includes("+09:00")) {
        key = raw.slice(0, 13);
      } else if (raw.includes("Z") || raw.includes("+00:00") || raw.endsWith("+00")) {
        const dt = new Date(raw);
        if (!isNaN(dt.getTime())) {
          const kst = new Date(dt.getTime() + 9 * 3600000);
          key = kst.toISOString().slice(0, 13);
        }
      } else if (raw.length >= 13) {
        key = raw.slice(0, 13);
      }
    }
    if (key && !marineIndexMap.has(key)) {
      marineIndexMap.set(key, i);
    }
  });

  const kmaHourlyList: any[] = Array.isArray(kmaWeather?.forecast_data?.hourly)
    ? kmaWeather.forecast_data.hourly
    : [];
  const kmaIndexMap = new Map<string, any>();
  kmaHourlyList.forEach(h => {
    if (h?.datetime) {
      const raw = String(h.datetime).replace(" ", "T");
      let key = raw.slice(0, 13);
      if (raw.includes("Z") || raw.includes("+00:00")) {
        const dt = new Date(raw);
        if (!isNaN(dt.getTime())) {
          const kst = new Date(dt.getTime() + 9 * 3600000);
          key = kst.toISOString().slice(0, 13);
        }
      }
      if (key && !kmaIndexMap.has(key)) {
        kmaIndexMap.set(key, h);
      }
    }
  });

  // Safety Status for Point (TODAY only)
  const hasConfirmedSeaCode = /^S\d{7}$/.test(String(point.warning_area_code || "").trim());
  let todaySafetyStatus: "PASS" | "BLOCK" | "UNKNOWN" =
    point.is_custom_point && !hasConfirmedSeaCode ? "UNKNOWN" : "PASS";
  const todayActiveWarnings: string[] = [];
  const safetyWarnings = kmaSafety?.normalized_warnings || kmaSafety?.warnings || [];
  if (Array.isArray(safetyWarnings)) {
    const pointAreas = [point.warning_area_code, point.land_warning_area_code]
      .map(code => String(code || "").trim())
      .filter(code => /^[LS]\d{7}$/.test(code));
    const matchedWarnings = new Map<string, any>();
    for (const w of safetyWarnings) {
      const warningRegId = String(w?.regId || "").trim();
      const warningRegUp = String(w?.regUp || "").trim();
      const matchedArea = pointAreas.find(code => warningRegId === code || warningRegUp === code);
      if (!w?.active || !matchedArea) continue;
      if (matchedArea.startsWith("L") && !["호우", "강풍", "태풍"].includes(String(w.warningName || ""))) continue;
      const dedupeKey = `${w.warningName || ""}:${w.levelName || ""}`;
      if (!matchedWarnings.has(dedupeKey)) matchedWarnings.set(dedupeKey, w);
    }
    const priority = (w: any) => {
      const key = `${w?.warningName || ""}${w?.levelName || ""}`;
      const ranks: Record<string, number> = { 태풍경보: 1, 태풍주의보: 2, 풍랑경보: 3, 풍랑주의보: 4, 호우경보: 6, 호우주의보: 7, 강풍경보: 8, 강풍주의보: 9 };
      if (ranks[key]) return ranks[key];
      return w?.warningName === "폭풍해일" || w?.warningName === "지진해일" ? 5 : 99;
    };
    const activeWarnings = [...matchedWarnings.values()].sort((a, b) => priority(a) - priority(b));
    if (activeWarnings.length) todaySafetyStatus = "BLOCK";
    activeWarnings.forEach(w => todayActiveWarnings.push(`${w.areaName ?? ""} ${w.warningName ?? ""}${w.levelName ?? ""} 발효 중`.trim()));
  }

  const parseKmaPrecipitationMm = (item: any): number | null => {
    if (!item || item.precipitation === undefined || item.precipitation === null) return null;
    const p = item.precipitation;
    if (typeof p === "number") return Number.isFinite(p) ? p : null;
    if (typeof p === "object" && p !== null) {
      if (p.mm !== undefined && p.mm !== null && Number.isFinite(Number(p.mm))) return Number(p.mm);
      const raw = String(p.raw || "").trim();
      if (raw === "강수없음" || raw === "0" || raw === "0.0" || raw === "0mm") return 0;
      const match = raw.match(/^([0-9]+(?:\.[0-9]+)?)/);
      if (match) return Number(match[1]);
      return null;
    }
    const rawStr = String(p).trim();
    if (rawStr === "강수없음" || rawStr === "0" || rawStr === "0.0" || rawStr === "0mm") return 0;
    const match = rawStr.match(/^([0-9]+(?:\.[0-9]+)?)/);
    if (match) return Number(match[1]);
    return null;
  };

  const allResults: ServerEvaluationResult[] = [];
  const activeModes = options.modes || ["TODAY", "TODAY_HOURLY", "SHORT", "MID"];
  let todayCount = 0;
  let todayHourlyCount = 0;
  let shortCount = 0;
  let midCount = 0;

  // Build Marine History up to 48h from Marine Cache
  const evalDate = evaluatedAt ? new Date(evaluatedAt) : new Date();
  const currentHourKst = new Date(evalDate.getTime() + 9 * 3600000).getUTCHours();
  const todayTargetHour = Math.min(18, Math.max(6, currentHourKst));
  const todaySlotKey = `${todayKst}T${String(todayTargetHour).padStart(2, "0")}`;
  const mIdx = marineIndexMap.get(todaySlotKey);

  const marineHistory: MarineHistoryItem[] = [];
  if (mIdx !== undefined && mIdx > 0) {
    for (let h = 1; h <= Math.min(48, mIdx); h++) {
      const pastIdx = mIdx - h;
      marineHistory.push({
        hoursAgo: h,
        wave_height: waveHeights[pastIdx] ?? null,
        wave_period: wavePeriods[pastIdx] ?? null,
        ocean_current_velocity: currentVelocities[pastIdx] ?? null,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // A. TODAY Evaluation (당일 대표 1시간 슬롯 또는 현재 슬롯)
  // ─────────────────────────────────────────────────────────────
  const todayStartedAt = performance.now();
  if (activeModes.includes("TODAY")) {
    const todaySunDto: KasiSunTimesInput = sunTimesMap.get(todayKst) || {
      date: todayKst,
      sunrise: null,
      sunset: null,
      source: "KASI",
    };

    const todayForecastTime = formatSlotTime(todayKst, todayTargetHour);
    const todayPeriodStart = `${todayKst}T${String(todayTargetHour).padStart(2, "0")}:00:00+09:00`;
    const todayPeriodEnd = `${todayKst}T${String(todayTargetHour + 1).padStart(2, "0")}:00:00+09:00`;

    const kmaItem = kmaIndexMap.get(todaySlotKey);

    const todayMarineHourly = mIdx !== undefined ? {
      wave_height: waveHeights[mIdx],
      wave_period: wavePeriods[mIdx] ?? null,
      ocean_current_velocity: currentVelocities[mIdx],
      sea_surface_temperature: seaTemperatures[mIdx] ?? null,
    } : {
      wave_height: (null as unknown) as number,
      ocean_current_velocity: (null as unknown) as number,
    };

    const todayPrecipVal = parseKmaPrecipitationMm(kmaItem);
    const todaySkyCode = kmaItem?.sky?.code ?? kmaItem?.skyCode ?? (typeof kmaItem?.sky === "number" ? kmaItem.sky : null);
    const todayPtyCode = kmaItem?.precipitationType?.code ?? kmaItem?.pty ?? (typeof kmaItem?.precipitationType === "number" ? kmaItem.precipitationType : null);

    const todayKmaHourly = {
      temperature: kmaItem?.temperature ?? null,
      wind_speed: kmaItem?.windSpeed ?? null,
      wind_direction_degree: kmaItem?.windDirection ?? kmaItem?.windDirectionDegree ?? null,
      precipitation: todayPrecipVal,
      precipitation_probability: kmaItem?.precipitationProbability ?? null,
      cloud_cover: kmaItem?.cloudCover ?? null,
      sky_code: todaySkyCode !== null && todaySkyCode !== undefined ? String(todaySkyCode) : null,
      precipitation_type: todayPtyCode !== null && todayPtyCode !== undefined ? Number(todayPtyCode) : null,
    };

  const todayDto: TodayEvaluationInputDTO = {
    mode: "TODAY",
    point,
    target_date: todayKst,
    forecast_time: todayForecastTime,
    period_start: todayPeriodStart,
    period_end: todayPeriodEnd,
    evaluated_at: evaluatedAt,
    marine_hourly: todayMarineHourly,
    kma_hourly: todayKmaHourly,
    rn1_live: null, // RN1 is populated if live observer pipeline is active
    kma_warning_safety: {
      status: todaySafetyStatus,
      active_warnings: todayActiveWarnings,
      warning_area_code: point.warning_area_code,
      land_warning_area_code: point.land_warning_area_code,
    },
    sun_times: todaySunDto,
    marine_history: marineHistory,
    rn1_history: caches.rn1History || [],
  };

  const todayResult = evaluateToday(todayDto);
  todayResult.evaluated_at = evaluatedAt;
  todayResult.point_updated_at = point.updated_at || null;
  allResults.push(todayResult);
  todayCount = 1;
}

  // ─────────────────────────────────────────────────────────────
  // A-2. TODAY_HOURLY Evaluation (당일 7개 주요 시간별 슬롯: 03, 06, 09, 12, 15, 18, 21시)
  // ─────────────────────────────────────────────────────────────
  if (timings) timings.today_ms = elapsedMs(todayStartedAt);
  const todayHourlyStartedAt = performance.now();
  if (activeModes.includes("TODAY_HOURLY")) {
    const todayHourlyKeyHours = [3, 6, 9, 12, 15, 18, 21];

    for (let sIdx = 0; sIdx < todayHourlyKeyHours.length; sIdx++) {
      const h = todayHourlyKeyHours[sIdx];
      const slotKey = `${todayKst}T${String(h).padStart(2, "0")}`;
      const forecastTime = formatSlotTime(todayKst, h);
      const pStart = `${todayKst}T${String(h).padStart(2, "0")}:00:00+09:00`;
      const pEnd = `${todayKst}T${String(Math.min(24, h + 3)).padStart(2, "0")}:00:00+09:00`;

      const mHourIdx = marineIndexMap.get(slotKey);
      const kmaHourItem = kmaIndexMap.get(slotKey);

      const mHourly = mHourIdx !== undefined ? {
        wave_height: waveHeights[mHourIdx],
        wave_period: wavePeriods[mHourIdx] ?? null,
        ocean_current_velocity: currentVelocities[mHourIdx],
        sea_surface_temperature: seaTemperatures[mHourIdx] ?? null,
      } : {
        wave_height: (null as unknown) as number,
        ocean_current_velocity: (null as unknown) as number,
      };

    const hPrecipVal = parseKmaPrecipitationMm(kmaHourItem);
    const hSkyCode = kmaHourItem?.sky?.code ?? kmaHourItem?.skyCode ?? (typeof kmaHourItem?.sky === "number" ? kmaHourItem.sky : null);
    const hPtyCode = kmaHourItem?.precipitationType?.code ?? kmaHourItem?.pty ?? (typeof kmaHourItem?.precipitationType === "number" ? kmaHourItem.precipitationType : null);

    const kmaHourly = {
      temperature: kmaHourItem?.temperature ?? null,
      wind_speed: kmaHourItem?.windSpeed ?? null,
      wind_direction_degree: kmaHourItem?.windDirection ?? kmaHourItem?.windDirectionDegree ?? null,
      precipitation: hPrecipVal,
      precipitation_probability: kmaHourItem?.precipitationProbability ?? null,
      cloud_cover: kmaHourItem?.cloudCover ?? null,
      sky_code: hSkyCode !== null && hSkyCode !== undefined ? String(hSkyCode) : null,
      precipitation_type: hPtyCode !== null && hPtyCode !== undefined ? Number(hPtyCode) : null,
    };

    const hourlyDto: TodayEvaluationInputDTO = {
      mode: "TODAY",
      point,
      target_date: todayKst,
      forecast_time: forecastTime,
      period_start: pStart,
      period_end: pEnd,
      evaluated_at: evaluatedAt,
      marine_hourly: mHourly,
      kma_hourly: kmaHourly,
      rn1_live: null,
      kma_warning_safety: {
        status: todaySafetyStatus,
        active_warnings: todayActiveWarnings,
        warning_area_code: point.warning_area_code,
        land_warning_area_code: point.land_warning_area_code,
      },
      sun_times: sunTimesMap.get(todayKst) || { date: todayKst, sunrise: null, sunset: null, source: "KASI" },
      marine_history: marineHistory,
      rn1_history: caches.rn1History || [],
    };

    const hourlyRes = evaluateToday(hourlyDto);
    hourlyRes.mode = "TODAY_HOURLY";
    hourlyRes.slot_index = sIdx;
    hourlyRes.period_start = pStart;
    hourlyRes.period_end = pEnd;
    hourlyRes.forecast_time = forecastTime;
    hourlyRes.evaluated_at = evaluatedAt;
    hourlyRes.point_updated_at = point.updated_at || null;

    allResults.push(hourlyRes);
    todayHourlyCount++;
  }
}

  // ─────────────────────────────────────────────────────────────
  // B. SHORT Evaluation (+1~+3일, 3시간 슬롯: 03, 06, 09, 12, 15, 18, 21)
  // [CRITICAL] 당일 실시간 특보 혼합 금지 (safety_status: 'PASS')
  // ─────────────────────────────────────────────────────────────
  if (timings) timings.today_hourly_ms = elapsedMs(todayHourlyStartedAt);
  const shortStartedAt = performance.now();
  if (activeModes.includes("SHORT")) {
    const shortSlotHours = [3, 6, 9, 12, 15, 18, 21];

    for (let d = 1; d <= 3; d++) {
      const shortDate = addDays(todayKst, d);
      const shortSunDto: KasiSunTimesInput = sunTimesMap.get(shortDate) || {
        date: shortDate,
        sunrise: null,
        sunset: null,
        source: "KASI",
      };

      for (let sIdx = 0; sIdx < shortSlotHours.length; sIdx++) {
        const h = shortSlotHours[sIdx];
        const slotKey = `${shortDate}T${String(h).padStart(2, "0")}`;
        const forecastTime = formatSlotTime(shortDate, h);
        const pStart = `${shortDate}T${String(h).padStart(2, "0")}:00:00+09:00`;
        const pEnd = `${shortDate}T${String(Math.min(24, h + 3)).padStart(2, "0")}:00:00+09:00`;

        const mHourIdx = marineIndexMap.get(slotKey);
        const kmaHourItem = kmaIndexMap.get(slotKey);

        const mHourly = mHourIdx !== undefined ? {
          wave_height: waveHeights[mHourIdx],
          wave_period: wavePeriods[mHourIdx] ?? null,
          ocean_current_velocity: currentVelocities[mHourIdx],
          sea_surface_temperature: seaTemperatures[mHourIdx] ?? null,
        } : {
          wave_height: (null as unknown) as number,
          ocean_current_velocity: (null as unknown) as number,
        };

        const hPrecipVal = parseKmaPrecipitationMm(kmaHourItem);
        const hSkyCode = kmaHourItem?.sky?.code ?? kmaHourItem?.skyCode ?? (typeof kmaHourItem?.sky === "number" ? kmaHourItem.sky : null);
        const hPtyCode = kmaHourItem?.precipitationType?.code ?? kmaHourItem?.pty ?? (typeof kmaHourItem?.precipitationType === "number" ? kmaHourItem.precipitationType : null);

        const kmaHourly = {
          temperature: kmaHourItem?.temperature ?? null,
          wind_speed: kmaHourItem?.windSpeed ?? null,
          wind_direction_degree: kmaHourItem?.windDirection ?? kmaHourItem?.windDirectionDegree ?? null,
          precipitation: hPrecipVal,
          precipitation_probability: kmaHourItem?.precipitationProbability ?? null,
          cloud_cover: kmaHourItem?.cloudCover ?? null,
          sky_code: hSkyCode !== null && hSkyCode !== undefined ? String(hSkyCode) : null,
          precipitation_type: hPtyCode !== null && hPtyCode !== undefined ? Number(hPtyCode) : null,
        };

        const shortDto: ShortEvaluationInputDTO = {
          mode: "SHORT",
          point,
          target_date: shortDate,
          slot_index: sIdx,
          forecast_time: forecastTime,
          period_start: pStart,
          period_end: pEnd,
          evaluated_at: evaluatedAt,
          marine_slot: mHourly,
          kma_slot: kmaHourly,
          sun_times: shortSunDto,
          marine_history: marineHistory,
          rn1_history: caches.rn1History || [],
        };

        const shortResult = evaluateShort(shortDto);
        shortResult.evaluated_at = evaluatedAt;
        shortResult.point_updated_at = point.updated_at || null;
        allResults.push(shortResult);
        shortCount++;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // C. MID Evaluation (+4~+6일, MID_MARINE_ONLY: AM 06~12, PM 12~18)
  // [CRITICAL] 강수 배제, 자연광 감점 미적용, 해양 4종 6시간 시계열 집계
  // ─────────────────────────────────────────────────────────────
  if (timings) timings.short_ms = elapsedMs(shortStartedAt);
  const midStartedAt = performance.now();
  if (activeModes.includes("MID")) {
    for (let d = 4; d <= 6; d++) {
      const midDate = addDays(todayKst, d);
      const midSunDto: KasiSunTimesInput = sunTimesMap.get(midDate) || {
        date: midDate,
        sunrise: null,
        sunset: null,
        source: "KASI",
      };

      const slotConfigs: Array<{ slotType: "AM" | "PM"; startH: number; endH: number }> = [
        { slotType: "AM", startH: 6, endH: 12 },
        { slotType: "PM", startH: 12, endH: 18 },
      ];

      slotConfigs.forEach(({ slotType, startH, endH }) => {
        const periodStart = formatSlotTime(midDate, startH);
        const periodEnd = formatSlotTime(midDate, endH);

        const series: Array<{
          timestamp: string;
          wave_height: number;
          wave_period?: number | null;
          ocean_current_velocity: number;
          sea_surface_temperature?: number | null;
        }> = [];

        for (let h = startH; h < endH; h++) {
          const slotKey = `${midDate}T${String(h).padStart(2, "0")}`;
          const sIdx = marineIndexMap.get(slotKey);
          if (sIdx !== undefined && Number.isFinite(waveHeights[sIdx]) && Number.isFinite(currentVelocities[sIdx])) {
            series.push({
              timestamp: formatSlotTime(midDate, h),
              wave_height: waveHeights[sIdx],
              wave_period: wavePeriods[sIdx] ?? null,
              ocean_current_velocity: currentVelocities[sIdx],
              sea_surface_temperature: seaTemperatures[sIdx] ?? null,
            });
          }
        }

        const midSlotData = caches.midWeather?.slots?.[midDate];
        const weatherText = slotType === "AM" ? (midSlotData?.weather_am ?? null) : (midSlotData?.weather_pm ?? null);
        const pop = slotType === "AM" ? (midSlotData?.pop_am ?? null) : (midSlotData?.pop_pm ?? null);

        const midDto: MidEvaluationInputDTO = {
          mode: "MID_MARINE_ONLY",
          point,
          target_date: midDate,
          slot_type: slotType,
          period_start: periodStart,
          period_end: periodEnd,
          evaluated_at: evaluatedAt,
          marine_6h_series: series,
          kma_mid_land: {
            weather: weatherText,
            precipitation_probability: pop,
          },
          kma_mid_temp: {
            temp_min: midSlotData?.temp_min ?? null,
            temp_max: midSlotData?.temp_max ?? null,
          },
          sun_times: midSunDto,
        };

        const midResult = evaluateMid(midDto);
        midResult.evaluated_at = evaluatedAt;
        midResult.point_updated_at = point.updated_at || null;
        allResults.push(midResult);
        midCount++;
      });
    }
  }

  // 나만의 스팟은 확정 S코드가 없으면 안전을 추정하지 않는다.
  // 이미 원천 수치/특보로 BLOCK인 결과는 기존 Worst/특보 우선 기준을 유지한다.
  if (timings) timings.mid_ms = elapsedMs(midStartedAt);
  if (point.is_custom_point && !hasConfirmedSeaCode) {
    for (const result of allResults) {
      if (result.safety_status === "PASS") {
        result.safety_status = "UNKNOWN";
        result.safety_reasons = [
          ...(Array.isArray(result.safety_reasons) ? result.safety_reasons : []),
          "해상 특보구역 코드 미확정",
        ];
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // D. Result UPSERT
  // ─────────────────────────────────────────────────────────────
  const storageStartedAt = performance.now();
  let totalUpserted = 0;
  if (!options.dryRun) {
    const { count, error } = await upsertEvaluationResults(client, allResults, sourceIssueTime);
    if (error) {
      if (timings) {
        timings.storage_ms = elapsedMs(storageStartedAt);
        timings.total_ms = elapsedMs(orchestrationStartedAt);
      }
      return {
        point_id: point.id,
        point_name: point.name,
        today_count: todayCount,
        today_hourly_count: todayHourlyCount,
        short_count: shortCount,
        mid_count: midCount,
        total_upserted: 0,
        results: allResults,
        error: error.message,
        timings,
      };
    }
    totalUpserted = count;
  } else {
    totalUpserted = allResults.length;
  }
  if (timings) {
    timings.storage_ms = elapsedMs(storageStartedAt);
    timings.total_ms = elapsedMs(orchestrationStartedAt);
  }

  return {
    point_id: point.id,
    point_name: point.name,
    today_count: todayCount,
    today_hourly_count: todayHourlyCount,
    short_count: shortCount,
    mid_count: midCount,
    total_upserted: totalUpserted,
    results: allResults,
    error: null,
    timings,
  };
}
