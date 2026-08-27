import type {
  TodayEvaluationInputDTO,
  ShortEvaluationInputDTO,
  MidEvaluationInputDTO,
  MarineHistoryItem,
  Rn1HistoryItem,
  KasiSunTimesInput,
} from "./evaluation-dto.ts";
import type { SnorkyPoint, PointEnvironment } from "./kma-grid.ts";

export interface ServerEvaluationResult {
  point_id: string | number;
  mode: "TODAY" | "TODAY_HOURLY" | "SHORT" | "MID";
  target_date: string;
  slot_index?: number | null;
  period_start: string | null;
  period_end: string | null;
  algorithm_version: "1.5";
  quality_status: "READY" | "PARTIAL" | "UNKNOWN";
  safety_status: "PASS" | "BLOCK" | "UNKNOWN";
  safety_reasons: string[];
  condition_score: number | null;
  condition_status: string;
  recommendation: string;
  visibility_score: number | null;
  visibility_grade: string;
  visibility_explanation: string;
  evaluated_at: string;
  point_updated_at?: string | null;
  forecast_time: string | null;
  source_issue_time?: import("./evaluation-dto.ts").SourceIssueTimeDTO | null;
  metrics: {
    wave_height: number | null;
    current_speed: number | null;
    wind_speed?: number | null;
    wave_period?: number | null;
    sea_temperature?: number | null;
    entry_score?: number | null;
    comfort_score?: number | null;
    temperature_suitability?: string | null;
    temperature_cap?: string | null;
  };
  min_max_metrics?: {
    wave_height: { min: number; max: number; mean: number };
    current_speed: { min: number; max: number; mean: number };
    sea_temperature: { min: number; max: number; mean: number } | null;
    wave_period: number | null;
  } | null;
  raw_scores?: Record<string, unknown> | null;
}

function addHoursIso(isoStr: string, hours: number): string {
  const d = new Date(isoStr);
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

// ─────────────────────────────────────────────────────────────
// V1.5 Breakpoints & Constants
// ─────────────────────────────────────────────────────────────
const WAVE_BREAKPOINTS = [
  [0.15, 100], [0.25, 90], [0.30, 82], [0.40, 65], [0.50, 45],
  [0.60, 28], [0.65, 20], [0.70, 12], [0.75, 6], [0.80, 0]
];
const CURRENT_BREAKPOINTS = [
  [0.10, 100], [0.15, 95], [0.20, 88], [0.25, 78], [0.30, 65],
  [0.35, 52], [0.40, 38], [0.45, 25], [0.50, 15], [0.60, 5]
];
const WIND_BREAKPOINTS = [
  [3, 100], [4, 95], [5, 88], [6, 78], [7, 65],
  [8, 50], [9, 35], [10, 20], [11, 10], [12, 0]
];
const PERIOD_FACTOR_BREAKPOINTS = [[6, 1], [8, 1.05], [10, 1.10], [12, 1.18], [14, 1.25]];
const SENSITIVITY_FACTORS = Object.freeze({ low: 0.75, medium: 1, high: 1.25 });
const DIRECTION_FACTOR_BREAKPOINTS = [[0, 1.20], [45, 1.10], [90, 1], [135, 0.95], [180, 0.90]];
const DIRECTION_DEGREES = Object.freeze({ N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 });
const TERRAIN_LAMBDA = Object.freeze({ rock: 0.12, harbor: 0.08, mixed: 0.06, sand: 0.04 });

function linearInterpolate(breakpoints: number[][], x: number): number | null {
  if (!Number.isFinite(x)) return null;
  const first = breakpoints[0], last = breakpoints[breakpoints.length - 1];
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const [x0, y0] = breakpoints[i], [x1, y1] = breakpoints[i + 1];
    if (x >= x0 && x <= x1) {
      return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
    }
  }
  return null;
}

function waveScore(waveHeight: number): number | null {
  return linearInterpolate(WAVE_BREAKPOINTS, waveHeight);
}

function wavePeriodAdjustment(rawWaveScore: number | null, wavePeriod: number | null | undefined, environment?: PointEnvironment | null) {
  if (!Number.isFinite(rawWaveScore) || rawWaveScore === null) {
    return { periodFactor: 1, effectivePeriodFactor: 1, finalWaveScore: rawWaveScore };
  }
  const periodFactor = Number.isFinite(wavePeriod) ? (linearInterpolate(PERIOD_FACTOR_BREAKPOINTS, wavePeriod!) ?? 1) : 1;
  const sensitivity = environment?.swellSensitivity;
  if (!sensitivity || !SENSITIVITY_FACTORS[sensitivity] || !Number.isFinite(wavePeriod)) {
    return { periodFactor, effectivePeriodFactor: 1, finalWaveScore: rawWaveScore };
  }
  const sensitivityFactor = SENSITIVITY_FACTORS[sensitivity];
  const effectivePeriodFactor = 1 + (periodFactor - 1) * sensitivityFactor;
  const waveLoss = 100 - rawWaveScore;
  const finalWaveScore = Math.max(0, Math.min(100, Math.round((100 - waveLoss * effectivePeriodFactor) * 10) / 10));
  return { periodFactor, effectivePeriodFactor, finalWaveScore };
}

function currentScore(currentSpeed: number): number | null {
  if (!Number.isFinite(currentSpeed)) return null;
  if (currentSpeed <= 0.10) return 100;
  if (currentSpeed >= 0.60) return 5;
  return linearInterpolate(CURRENT_BREAKPOINTS, currentSpeed);
}

function windBaseScore(windSpeed: number): number | null {
  if (!Number.isFinite(windSpeed)) return null;
  if (windSpeed <= 3) return 100;
  if (windSpeed >= 12) return 0;
  return linearInterpolate(WIND_BREAKPOINTS, windSpeed);
}

function relativeDirectionAngle(windDirectionDeg: number | null | undefined, exposureDirection: string | null | undefined): number | null {
  if (!Number.isFinite(windDirectionDeg) || !exposureDirection) return null;
  const exposureDeg = (DIRECTION_DEGREES as Record<string, number>)[exposureDirection];
  if (!Number.isFinite(exposureDeg)) return null;
  const diff = Math.abs(windDirectionDeg! - exposureDeg);
  return Math.min(diff, 360 - diff);
}

function windAdjustment(rawWindScore: number | null, windDirectionDeg: number | null | undefined, environment?: PointEnvironment | null) {
  if (!Number.isFinite(rawWindScore) || rawWindScore === null) {
    return { directionFactor: 1, effectiveDirectionFactor: 1, finalWindScore: rawWindScore };
  }
  const angle = relativeDirectionAngle(windDirectionDeg, environment?.exposureDirection);
  const directionFactor = angle !== null ? (linearInterpolate(DIRECTION_FACTOR_BREAKPOINTS, angle) ?? 1) : 1;
  const sensitivity = environment?.onshoreWindSensitivity ?? environment?.eastWindSensitivity;
  const sensitivityFactor = (sensitivity && SENSITIVITY_FACTORS[sensitivity]) ? SENSITIVITY_FACTORS[sensitivity] : 1;
  const effectiveDirectionFactor = 1 + (directionFactor - 1) * sensitivityFactor;
  const windLoss = 100 - rawWindScore;
  const finalWindScore = Math.max(0, Math.min(100, Math.round((100 - windLoss * effectiveDirectionFactor) * 10) / 10));
  return { directionFactor, effectiveDirectionFactor, finalWindScore };
}

function entryA(waveS: number | null, windS: number | null, currentS?: number | null) {
  if (!Number.isFinite(waveS)) {
    return { a: null, waveLoss: null, currentLoss: 0, windLoss: null };
  }
  // V1.5 기존 파고(0.60) 대 풍속(0.10)의 6:1 비율 보존 비례 정규화 (6/7 ≈ 0.8571, 1/7 ≈ 0.1429)
  const windFactor = Number.isFinite(windS) ? Math.pow(Math.max(0, windS!) / 100, 1 / 7) : 1.0;
  const waveFactor = Math.pow(Math.max(0, waveS!) / 100, 6 / 7);
  const a0 = 100 * waveFactor * windFactor;
  const m = waveS!;
  const g = 0.70 + 0.30 * (m / 100);
  const a = Math.max(0, Math.min(100, Math.round(a0 * g * 10) / 10));
  const waveLoss = (100 - waveS!) * (6 / 7);
  const windLoss = Number.isFinite(windS) ? (100 - windS!) * (1 / 7) : 0;
  return { a, waveLoss, currentLoss: 0, windLoss };
}

function visibilityB(
  row: { wave_height: number; precipitation?: number | null },
  environment?: PointEnvironment | null,
  history: Array<{ hoursAgo: number; wave_height: number | null; precipitation?: number | null }> = []
) {
  const baseScore = 100;
  const waveH = Number.isFinite(row.wave_height) ? row.wave_height : 0;
  const instantWavePenalty = waveH > 0.3 ? Math.min(40, (waveH - 0.3) * 60) : 0;
  const terrain = environment?.terrain ?? "rock";
  const lambda = (TERRAIN_LAMBDA as Record<string, number>)[terrain] ?? 0.12;

  let waveHistoryPenalty = 0;
  let rainHistoryPenalty = 0;
  for (const h of history) {
    if (h.hoursAgo > 0 && h.hoursAgo <= 48) {
      const decay = Math.exp(-lambda * h.hoursAgo);
      if (Number.isFinite(h.wave_height) && h.wave_height! > 0.4) {
        const excess = h.wave_height! - 0.4;
        waveHistoryPenalty += excess * 25 * decay;
      }
      if (Number.isFinite(h.precipitation) && h.precipitation! > 0) {
        rainHistoryPenalty += h.precipitation! * 2 * decay;
      }
    }
  }
  waveHistoryPenalty = Math.min(35, waveHistoryPenalty);
  rainHistoryPenalty = Math.min(25, rainHistoryPenalty);

  const precip = Number.isFinite(row.precipitation) ? row.precipitation! : 0;
  const instantRainPenalty = precip > 0 ? Math.min(25, precip * 3) : 0;

  const totalLoss = instantWavePenalty + waveHistoryPenalty + instantRainPenalty + rainHistoryPenalty;
  const score = Math.max(0, Math.min(100, Math.round((baseScore - totalLoss) * 10) / 10));

  let grade = "보통/회복중";
  if (score >= 80) grade = "좋음";
  else if (score >= 65) grade = "양호";
  else if (score < 40) grade = "매우나쁨";
  else if (score < 50) grade = "나쁨";

  return { score, grade, explanation: `수중시야 예상점수: ${score}점 (${grade})` };
}

function comfortC(windSpeed: number | null | undefined): number {
  if (!Number.isFinite(windSpeed) || windSpeed === null) return 70;
  if (windSpeed <= 3) return 100;
  if (windSpeed <= 5) return 85;
  if (windSpeed <= 8) return 65;
  if (windSpeed <= 11) return 40;
  return 20;
}

// ─────────────────────────────────────────────────────────────
// V1.5 §20~§23 Visual Condition & Final Visual Visibility
// ─────────────────────────────────────────────────────────────
type VisualLightState = "DAY" | "SUNRISE_EFFECT" | "SUNSET_EFFECT" | "NIGHT";
type VisualWeatherState = "CLEAR" | "MOSTLY_CLOUDY" | "OVERCAST" | "RAIN";

const VISUAL_CONDITION_PENALTIES: Record<"DAY" | "SUNRISE_EFFECT" | "SUNSET_EFFECT", Record<VisualWeatherState, number>> = {
  DAY: { CLEAR: 0, MOSTLY_CLOUDY: 5, OVERCAST: 10, RAIN: 25 },
  SUNRISE_EFFECT: { CLEAR: 10, MOSTLY_CLOUDY: 15, OVERCAST: 20, RAIN: 35 },
  SUNSET_EFFECT: { CLEAR: 10, MOSTLY_CLOUDY: 15, OVERCAST: 20, RAIN: 35 },
};

function getKstHour(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const match = timeStr.match(/T(\d{2}):(\d{2})/);
  if (match) return Number(match[1]) + Number(match[2]) / 60;
  const match2 = timeStr.match(/^(\d{2}):(\d{2})/);
  if (match2) return Number(match2[1]) + Number(match2[2]) / 60;
  const dt = new Date(timeStr);
  if (!isNaN(dt.getTime())) {
    if (timeStr.endsWith("Z")) {
      const kstDt = new Date(dt.getTime() + 9 * 3600000);
      return kstDt.getUTCHours() + kstDt.getUTCMinutes() / 60;
    }
    return dt.getHours() + dt.getMinutes() / 60;
  }
  return null;
}

function resolveVisualLightState(
  forecastTime: string | null | undefined,
  sunTimes?: { sunrise?: string | null; sunset?: string | null } | null,
  allSlotHours: number[] = [3, 6, 9, 12, 15, 18, 21]
): VisualLightState {
  const slotHour = getKstHour(forecastTime);
  if (slotHour === null) return "DAY";

  const sunriseHour = getKstHour(sunTimes?.sunrise) ?? 6;
  const sunsetHour = getKstHour(sunTimes?.sunset) ?? 19;

  // §20: 3시간 슬롯 기준 일출·일몰 대표 슬롯 (동률 시 일출은 이후, 일몰은 이전 슬롯)
  let sunriseEffectSlot = 6;
  let minRiseDiff = Infinity;
  for (const h of allSlotHours) {
    const diff = Math.abs(h - sunriseHour);
    if (diff < minRiseDiff || (diff === minRiseDiff && h > sunriseEffectSlot)) {
      minRiseDiff = diff;
      sunriseEffectSlot = h;
    }
  }

  let sunsetEffectSlot = 18;
  let minSetDiff = Infinity;
  for (const h of allSlotHours) {
    const diff = Math.abs(h - sunsetHour);
    if (diff < minSetDiff || (diff === minSetDiff && h < sunsetEffectSlot)) {
      minSetDiff = diff;
      sunsetEffectSlot = h;
    }
  }

  const roundedSlotHour = Math.round(slotHour);
  if (roundedSlotHour === sunriseEffectSlot) return "SUNRISE_EFFECT";
  if (roundedSlotHour === sunsetEffectSlot) return "SUNSET_EFFECT";
  if (slotHour < sunriseHour || slotHour >= sunsetHour) return "NIGHT";
  return "DAY";
}

function parseForecastDate(val: string | Date | null | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * V1.5 §12 Activity Time Gate — 야간·해질녘 활동 추천 제한
 * 일출 전 / 일몰 후 슬롯의 Recommendation을 '야간 비추천'으로 고정.
 * Condition Score, Condition Status, Base Visibility는 왜곡 없이 유지.
 */
export function applyActivityTimeGate(
  baseRecommendation: string,
  sunTimes?: { sunrise?: string | null; sunset?: string | null } | null,
  forecastTime?: string | Date | null,
  lightState?: VisualLightState
): string {
  if (lightState === "NIGHT") {
    return "야간 비추천";
  }
  if (!sunTimes?.sunrise || !sunTimes?.sunset || !forecastTime) {
    if (lightState === "NIGHT") return "야간 비추천";
    return baseRecommendation;
  }

  const now = parseForecastDate(forecastTime);
  const sunrise = parseForecastDate(sunTimes.sunrise);
  const sunset = parseForecastDate(sunTimes.sunset);

  if (now && sunrise && sunset) {
    const minsToSunset = (sunset.getTime() - now.getTime()) / 60000;
    const afterSunset = now >= sunset;
    const beforeSunrise = now < sunrise;

    if (beforeSunrise || afterSunset) return "야간 비추천";
    if (minsToSunset <= 30) return "해질녘 비추천";
    if (minsToSunset <= 60) {
      return baseRecommendation === "비추천" ? "비추천" : "해질녘 주의";
    }
    return baseRecommendation;
  }

  const slotHour = getKstHour(String(forecastTime));
  const sunriseHour = getKstHour(sunTimes.sunrise) ?? 6;
  const sunsetHour = getKstHour(sunTimes.sunset) ?? 19;

  if (slotHour !== null) {
    if (slotHour < sunriseHour || slotHour >= sunsetHour) return "야간 비추천";
    const minsToSunset = (sunsetHour - slotHour) * 60;
    if (minsToSunset <= 30) return "해질녘 비추천";
    if (minsToSunset <= 60) {
      return baseRecommendation === "비추천" ? "비추천" : "해질녘 주의";
    }
  }

  return baseRecommendation;
}

function classifyVisualWeatherState(kma: {
  precipitation?: number | null;
  precipitation_type?: number | null;
  sky_code?: string | number | null;
  cloud_cover?: number | null;
} | null | undefined): VisualWeatherState {
  const pty = Number(kma?.precipitation_type ?? 0);
  const precip = Number(kma?.precipitation ?? 0);
  if (pty === 1 || pty === 4 || pty > 0 || (Number.isFinite(precip) && precip > 0.5)) {
    return "RAIN";
  }
  const sky = String(kma?.sky_code ?? "");
  if (sky === "4") return "OVERCAST";
  if (sky === "3") return "MOSTLY_CLOUDY";
  if (sky === "1") return "CLEAR";
  const clouds = Number(kma?.cloud_cover);
  if (Number.isFinite(clouds)) {
    if (clouds >= 80) return "OVERCAST";
    if (clouds >= 40) return "MOSTLY_CLOUDY";
  }
  return "CLEAR";
}

function computeFinalVisualVisibility(
  baseScore: number | null,
  baseGrade: string,
  lightState: VisualLightState,
  weatherState: VisualWeatherState
) {
  if (baseScore === null || !Number.isFinite(baseScore)) {
    return {
      finalScore: null,
      finalGrade: "UNKNOWN",
      penalty: 0,
      lightState,
      weatherState,
      explanation: "수중시야 평가 데이터 부족",
    };
  }

  if (lightState === "NIGHT") {
    return {
      finalScore: 0,
      finalGrade: "매우 나쁨",
      penalty: 0,
      lightState,
      weatherState,
      explanation: "바다 자체의 투명도는 양호하나, 야간으로 자연광이 없어 실제 수중시야 확보가 불가합니다.",
    };
  }

  const penalty = VISUAL_CONDITION_PENALTIES[lightState]?.[weatherState] ?? 0;
  const finalScore = Math.max(0, Math.min(100, Math.round((baseScore - penalty) * 10) / 10));

  let finalGrade = "보통";
  if (finalScore >= 85) finalGrade = "좋음";
  else if (finalScore >= 65) finalGrade = "양호";
  else if (finalScore >= 45) finalGrade = "보통";
  else if (finalScore >= 25) finalGrade = "나쁨";
  else finalGrade = "매우 나쁨";

  const penaltyText = penalty > 0 ? ` (시각조건 -${penalty}점 감점)` : "";

  return {
    finalScore,
    finalGrade,
    penalty,
    lightState,
    weatherState,
    explanation: `최종 예상 수중시야: ${finalScore}점 (${finalGrade})${penaltyText}`,
  };
}

function temperatureActivitySuitability(seaTemp: number | null | undefined) {
  if (!Number.isFinite(seaTemp) || seaTemp === null) {
    return { label: "정보 없음", recommendationCap: "추천" };
  }
  if (seaTemp >= 25) return { label: "매우 쾌적", recommendationCap: "추천" };
  if (seaTemp >= 22) return { label: "적합", recommendationCap: "추천" };
  if (seaTemp >= 19) return { label: "주의 (수트 필요)", recommendationCap: "주의" };
  return { label: "저온 위험 (입수 비추천)", recommendationCap: "비추천" };
}

function applyTemperatureRecommendationCap(baseRec: string, cap: string): string {
  const ranks: Record<string, number> = { "추천": 3, "주의": 2, "비추천": 1 };
  const currentRank = ranks[baseRec] ?? 2;
  const capRank = ranks[cap] ?? 3;
  if (currentRank > capRank) return cap;
  return baseRec;
}

function finalScore(entryScore: number, visScore: number, comfScore: number): number {
  const combined = entryScore * 0.45 + visScore * 0.35 + comfScore * 0.20;
  return Math.round(combined);
}

function conditionStatusFromScore(score: number | null, safety: "PASS" | "BLOCK" | "UNKNOWN"): string {
  if (safety === "BLOCK") return "입수 금지";
  if (safety === "UNKNOWN" || score === null || !Number.isFinite(score)) return "확인 필요";
  if (score >= 80) return "좋음";
  if (score >= 65) return "보통";
  if (score >= 50) return "주의";
  return "나쁨";
}

// ─────────────────────────────────────────────────────────────
// Evaluation Adapters
// ─────────────────────────────────────────────────────────────

/**
 * 1. TODAY Evaluation Engine
 */
export function evaluateToday(dto: TodayEvaluationInputDTO): ServerEvaluationResult {
  const evaluated_at = dto.evaluated_at || new Date().toISOString();
  const waveH = dto.marine_hourly?.wave_height;
  const curV = dto.marine_hourly?.ocean_current_velocity;

  const hasRequired = Number.isFinite(waveH);
  const hasOptional = Number.isFinite(dto.kma_hourly?.wind_speed) && Number.isFinite(dto.marine_hourly?.sea_surface_temperature);
  const quality_status: "READY" | "PARTIAL" | "UNKNOWN" = !hasRequired ? "UNKNOWN" : (hasOptional ? "READY" : "PARTIAL");

  if (!hasRequired) {
    return {
      point_id: dto.point.id,
      mode: "TODAY",
      target_date: dto.target_date,
      period_start: dto.period_start || dto.forecast_time,
      period_end: dto.period_end || (dto.forecast_time ? addHoursIso(dto.forecast_time, 1) : null),
      algorithm_version: "V1.5",
      quality_status: "UNKNOWN",
      safety_status: "UNKNOWN",
      safety_reasons: ["필수 해양 데이터(파고) 누락"],
      condition_score: null,
      condition_status: "확인 필요",
      recommendation: "확인 필요",
      visibility_score: null,
      visibility_grade: "UNKNOWN",
      visibility_explanation: "해양 데이터 부족으로 평가 불가",
      evaluated_at,
      point_updated_at: dto.point.updated_at || null,
      forecast_time: dto.forecast_time,
      metrics: { wave_height: null, current_speed: null }
    };
  }

  // Safety Gate check
  let safety_status: "PASS" | "BLOCK" | "UNKNOWN" = dto.kma_warning_safety?.status ?? "PASS";
  const safety_reasons: string[] = [...(dto.kma_warning_safety?.active_warnings ?? [])];

  if (waveH! >= 0.80) {
    safety_status = "BLOCK";
    safety_reasons.push(`유의파고 위험 (${waveH}m >= 0.80m — Hard Safety 기준 초과)`);
  }

  const rawWave = waveScore(waveH!);
  const periodAdj = wavePeriodAdjustment(rawWave, dto.marine_hourly.wave_period, dto.point.environment);
  const curS = Number.isFinite(curV) ? currentScore(curV!) : null;
  const rawWind = Number.isFinite(dto.kma_hourly.wind_speed) ? windBaseScore(dto.kma_hourly.wind_speed!) : null;
  const windAdj = windAdjustment(rawWind, dto.kma_hourly.wind_direction_degree, dto.point.environment);

  const entryResult = entryA(periodAdj.finalWaveScore, windAdj.finalWindScore);
  const precip = dto.rn1_live?.rn1 ?? dto.kma_hourly.precipitation;

  // Combine marine history + rn1 history
  const combinedHistory = (dto.marine_history || []).map((mh, idx) => ({
    hoursAgo: mh.hoursAgo,
    wave_height: mh.wave_height,
    precipitation: dto.rn1_history?.[idx]?.rn1 ?? null
  }));

  const visResult = visibilityB({ wave_height: waveH!, precipitation: precip }, dto.point.environment, combinedHistory);
  
  // V1.5 §20~§23: Visual Condition & Final Visual Visibility
  const lightState = resolveVisualLightState(dto.forecast_time, dto.sun_times);
  const weatherState = classifyVisualWeatherState(dto.kma_hourly);
  const finalVis = computeFinalVisualVisibility(visResult.score, visResult.grade, lightState, weatherState);

  const comfScore = comfortC(dto.kma_hourly.wind_speed);

  const tempSuit = temperatureActivitySuitability(dto.marine_hourly.sea_surface_temperature);
  let condition_score: number | null = null;
  if (safety_status === "PASS" && entryResult.a !== null && visResult.score !== null) {
    condition_score = finalScore(entryResult.a, visResult.score, comfScore);
  }

  let rec = condition_score !== null && condition_score >= 70 ? "추천" : (condition_score !== null && condition_score >= 50 ? "주의" : "비추천");
  if (safety_status === "BLOCK") rec = "비추천";
  else {
    rec = applyTemperatureRecommendationCap(rec, tempSuit.recommendationCap);
    rec = applyActivityTimeGate(rec, dto.sun_times, dto.forecast_time, lightState);
  }

  return {
    point_id: dto.point.id,
    mode: "TODAY",
    target_date: dto.target_date,
    period_start: dto.period_start || dto.forecast_time,
    period_end: dto.period_end || (dto.forecast_time ? addHoursIso(dto.forecast_time, 1) : null),
    algorithm_version: "V1.5",
    quality_status,
    safety_status,
    safety_reasons,
    condition_score,
    condition_status: conditionStatusFromScore(condition_score, safety_status),
    recommendation: rec,
    visibility_score: finalVis.finalScore,
    visibility_grade: finalVis.finalGrade,
    visibility_explanation: finalVis.explanation,
    evaluated_at,
    point_updated_at: dto.point.updated_at || null,
    forecast_time: dto.forecast_time,
    metrics: {
      wave_height: waveH!,
      current_speed: curV!,
      wind_speed: dto.kma_hourly.wind_speed ?? null,
      wind_direction_degree: dto.kma_hourly.wind_direction_degree ?? null,
      temperature: dto.kma_hourly.temperature ?? null,
      precipitation: dto.kma_hourly.precipitation ?? null,
      precipitation_probability: dto.kma_hourly.precipitation_probability ?? null,
      sky_code: dto.kma_hourly.sky_code ?? null,
      precipitation_type: dto.kma_hourly.precipitation_type ?? null,
      wave_period: dto.marine_hourly.wave_period ?? null,
      sea_temperature: dto.marine_hourly.sea_surface_temperature ?? null,
      entry_score: entryResult.a,
      comfort_score: comfScore,
      base_visibility_score: visResult.score,
      base_visibility_grade: visResult.grade,
      base_visibility_explanation: visResult.explanation,
      visual_condition: { lightState: finalVis.lightState, weatherState: finalVis.weatherState },
      visual_condition_penalty: finalVis.penalty,
      final_visual_visibility_score: finalVis.finalScore,
      final_visual_visibility_grade: finalVis.finalGrade,
      temperature_suitability: tempSuit.label,
      temperature_cap: tempSuit.recommendationCap
    }
  };
}

/**
 * 2. SHORT Evaluation Engine (+1~+3일)
 * [CRITICAL] 당일 실시간 특보 혼합 금지, safety_status는 PASS 고정
 */
export function evaluateShort(dto: ShortEvaluationInputDTO): ServerEvaluationResult {
  const evaluated_at = dto.evaluated_at || new Date().toISOString();
  const waveH = dto.marine_slot?.wave_height;
  const curV = dto.marine_slot?.ocean_current_velocity;

  const hasRequired = Number.isFinite(waveH);
  const hasOptional = Number.isFinite(dto.kma_slot?.wind_speed) && Number.isFinite(dto.marine_slot?.sea_surface_temperature);
  const quality_status: "READY" | "PARTIAL" | "UNKNOWN" = !hasRequired ? "UNKNOWN" : (hasOptional ? "READY" : "PARTIAL");

  if (!hasRequired) {
    return {
      point_id: dto.point.id,
      mode: "SHORT",
      target_date: dto.target_date,
      slot_index: dto.slot_index,
      period_start: null,
      period_end: null,
      algorithm_version: "V1.5",
      quality_status: "UNKNOWN",
      safety_status: "UNKNOWN",
      safety_reasons: ["필수 해양 데이터 누락"],
      condition_score: null,
      condition_status: "확인 필요",
      recommendation: "확인 필요",
      visibility_score: null,
      visibility_grade: "UNKNOWN",
      visibility_explanation: "해양 데이터 부족",
      evaluated_at,
    point_updated_at: dto.point.updated_at || null,
      forecast_time: dto.forecast_time,
      metrics: { wave_height: null, current_speed: null }
    };
  }

  let safety_status: "PASS" | "BLOCK" = "PASS";
  const safety_reasons: string[] = [];
  if (waveH! >= 0.80) {
    safety_status = "BLOCK";
    safety_reasons.push(`유의파고 예보 위험 (${waveH}m >= 0.80m — Hard Safety 기준 초과)`);
  }

  const rawWave = waveScore(waveH!);
  const periodAdj = wavePeriodAdjustment(rawWave, dto.marine_slot.wave_period, dto.point.environment);
  const curS = Number.isFinite(curV) ? currentScore(curV!) : null;
  const rawWind = Number.isFinite(dto.kma_slot.wind_speed) ? windBaseScore(dto.kma_slot.wind_speed!) : null;
  const windAdj = windAdjustment(rawWind, dto.kma_slot.wind_direction_degree, dto.point.environment);

  const entryResult = entryA(periodAdj.finalWaveScore, windAdj.finalWindScore);
  const precip = dto.kma_slot.precipitation ?? 0;

  const combinedHistory = (dto.marine_history || []).map((mh, idx) => ({
    hoursAgo: mh.hoursAgo,
    wave_height: mh.wave_height,
    precipitation: dto.rn1_history?.[idx]?.rn1 ?? null
  }));

  const visResult = visibilityB({ wave_height: waveH!, precipitation: precip }, dto.point.environment, combinedHistory);
  
  // V1.5 §20~§23: Visual Condition & Final Visual Visibility
  const lightState = resolveVisualLightState(dto.forecast_time, dto.sun_times, [6, 9, 12, 15, 18]);
  const weatherState = classifyVisualWeatherState(dto.kma_slot);
  const finalVis = computeFinalVisualVisibility(visResult.score, visResult.grade, lightState, weatherState);

  const comfScore = comfortC(dto.kma_slot.wind_speed);

  const tempSuit = temperatureActivitySuitability(dto.marine_slot.sea_surface_temperature);
  let condition_score: number | null = null;
  if (safety_status === "PASS" && entryResult.a !== null && visResult.score !== null) {
    condition_score = finalScore(entryResult.a, visResult.score, comfScore);
  }

  let rec = condition_score !== null && condition_score >= 70 ? "추천" : (condition_score !== null && condition_score >= 50 ? "주의" : "비추천");
  if (safety_status === "BLOCK") rec = "비추천";
  else {
    rec = applyTemperatureRecommendationCap(rec, tempSuit.recommendationCap);
    rec = applyActivityTimeGate(rec, dto.sun_times, dto.forecast_time, lightState);
  }

  return {
    point_id: dto.point.id,
    mode: "SHORT",
    target_date: dto.target_date,
    slot_index: dto.slot_index,
    period_start: null,
    period_end: null,
    algorithm_version: "V1.5",
    quality_status,
    safety_status,
    safety_reasons,
    condition_score,
    condition_status: conditionStatusFromScore(condition_score, safety_status),
    recommendation: rec,
    visibility_score: finalVis.finalScore,
    visibility_grade: finalVis.finalGrade,
    visibility_explanation: finalVis.explanation,
    evaluated_at,
    point_updated_at: dto.point.updated_at || null,
    forecast_time: dto.forecast_time,
    metrics: {
      wave_height: waveH!,
      current_speed: curV!,
      wind_speed: dto.kma_slot.wind_speed ?? null,
      wind_direction_degree: dto.kma_slot.wind_direction_degree ?? null,
      temperature: dto.kma_slot.temperature ?? null,
      precipitation: dto.kma_slot.precipitation ?? null,
      precipitation_probability: dto.kma_slot.precipitation_probability ?? null,
      sky_code: dto.kma_slot.sky_code ?? null,
      precipitation_type: dto.kma_slot.precipitation_type ?? null,
      wave_period: dto.marine_slot.wave_period ?? null,
      sea_temperature: dto.marine_slot.sea_surface_temperature ?? null,
      entry_score: entryResult.a,
      comfort_score: comfScore,
      base_visibility_score: visResult.score,
      base_visibility_grade: visResult.grade,
      base_visibility_explanation: visResult.explanation,
      visual_condition: { lightState: finalVis.lightState, weatherState: finalVis.weatherState },
      visual_condition_penalty: finalVis.penalty,
      final_visual_visibility_score: finalVis.finalScore,
      final_visual_visibility_grade: finalVis.finalGrade,
      temperature_suitability: tempSuit.label,
      temperature_cap: tempSuit.recommendationCap
    }
  };
}

/**
 * 3. MID Evaluation Engine (+4~+6일 MID_MARINE_ONLY)
 * [CRITICAL] 강수 배제, 자연광 감점 미적용, 해양 4종 기반 평균 점수 및 min~max 3종 지표 산출
 */
export function evaluateMid(dto: MidEvaluationInputDTO): ServerEvaluationResult {
  const evaluated_at = dto.evaluated_at || new Date().toISOString();
  const series = dto.marine_6h_series || [];

  const waveHeights = series.map(s => s.wave_height).filter(Number.isFinite);
  const currentSpeeds = series.map(s => s.ocean_current_velocity).filter(Number.isFinite);
  const wavePeriods = series.map(s => s.wave_period).filter((v): v is number => Number.isFinite(v));
  const seaTemps = series.map(s => s.sea_surface_temperature).filter((v): v is number => Number.isFinite(v));

  if (!waveHeights.length) {
    return {
      point_id: dto.point.id,
      mode: "MID",
      target_date: dto.target_date,
      period_start: dto.period_start,
      period_end: dto.period_end,
      algorithm_version: "V1.5",
      quality_status: "UNKNOWN",
      safety_status: "UNKNOWN",
      safety_reasons: ["6시간 해양 시계열 데이터 부족"],
      condition_score: null,
      condition_status: "확인 필요",
      recommendation: "확인 필요",
      visibility_score: null,
      visibility_grade: "UNKNOWN",
      visibility_explanation: "해양 데이터 부족",
      evaluated_at,
    point_updated_at: dto.point.updated_at || null,
      forecast_time: dto.period_start,
      metrics: { wave_height: null, current_speed: null }
    };
  }

  const quality_status: "READY" | "PARTIAL" = seaTemps.length ? "READY" : "PARTIAL";

  // Worst Gate Safety
  const maxWave = Math.max(...waveHeights);
  let safety_status: "PASS" | "BLOCK" = "PASS";
  const safety_reasons: string[] = [];

  if (maxWave >= 0.80) {
    safety_status = "BLOCK";
    safety_reasons.push(`구간 최대 유의파고 위험 (${maxWave}m >= 0.80m — Hard Safety 기준 초과)`);
  }

  // Mean for scoring
  const meanWave = waveHeights.reduce((a, b) => a + b, 0) / waveHeights.length;
  const meanCurrent = currentSpeeds.length ? currentSpeeds.reduce((a, b) => a + b, 0) / currentSpeeds.length : null;
  const meanPeriod = wavePeriods.length ? wavePeriods.reduce((a, b) => a + b, 0) / wavePeriods.length : null;
  const meanTemp = seaTemps.length ? seaTemps.reduce((a, b) => a + b, 0) / seaTemps.length : null;

  const rawWave = waveScore(meanWave);
  const periodAdj = wavePeriodAdjustment(rawWave, meanPeriod, dto.point.environment);
  const curS = Number.isFinite(meanCurrent) ? currentScore(meanCurrent!) : null;
  const entryResult = entryA(periodAdj.finalWaveScore, null);

  const visResult = visibilityB({ wave_height: meanWave, precipitation: 0 }, dto.point.environment, []);
  const comfScore = 70; // MID standard neutral

  const tempSuit = temperatureActivitySuitability(meanTemp);
  let condition_score: number | null = null;
  if (safety_status === "PASS" && entryResult.a !== null && visResult.score !== null) {
    condition_score = finalScore(entryResult.a, visResult.score, comfScore);
  }

  let rec = condition_score !== null && condition_score >= 70 ? "추천" : (condition_score !== null && condition_score >= 50 ? "주의" : "비추천");
  if (safety_status === "BLOCK") rec = "비추천";
  else rec = applyTemperatureRecommendationCap(rec, tempSuit.recommendationCap);

  return {
    point_id: dto.point.id,
    mode: "MID",
    target_date: dto.target_date,
    period_start: dto.period_start,
    period_end: dto.period_end,
    algorithm_version: "V1.5",
    quality_status,
    safety_status,
    safety_reasons,
    condition_score,
    condition_status: conditionStatusFromScore(condition_score, safety_status),
    recommendation: rec,
    visibility_score: visResult.score,
    visibility_grade: visResult.grade,
    visibility_explanation: "MID_MARINE_ONLY 모드로 산출된 수중시야입니다.",
    evaluated_at,
    point_updated_at: dto.point.updated_at || null,
    forecast_time: dto.period_start,
    metrics: {
      wave_height: Math.round(meanWave * 100) / 100,
      current_speed: Math.round(meanCurrent * 100) / 100,
      wave_period: meanPeriod ? Math.round(meanPeriod * 10) / 10 : null,
      sea_temperature: meanTemp ? Math.round(meanTemp * 10) / 10 : null,
      entry_score: entryResult.a,
      comfort_score: comfScore,
      temperature_suitability: tempSuit.label,
      temperature_cap: tempSuit.recommendationCap
    },
    min_max_metrics: {
      wave_height: { min: Math.min(...waveHeights), max: maxWave, mean: Math.round(meanWave * 100) / 100 },
      current_speed: currentSpeeds.length ? { min: Math.min(...currentSpeeds), max: Math.max(...currentSpeeds), mean: Math.round(meanCurrent! * 100) / 100 } : null,
      sea_temperature: seaTemps.length ? { min: Math.min(...seaTemps), max: Math.max(...seaTemps), mean: Math.round(meanTemp! * 10) / 10 } : null,
      wave_period: meanPeriod ? Math.round(meanPeriod * 10) / 10 : null
    }
  };
}
