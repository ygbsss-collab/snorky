/**
 * SNORKY 2.0 — V1.2 공통 평가 엔진
 * 기준: SNORKY_2.0_컨디션_및_예상수중시야_알고리즘_최종명세서_V1.2_구현규칙확정본
 * 확정일: 2026-08-19
 *
 * [중요] 이 파일은 신규 V1.2 엔진이다.
 * 기존 today-best.js / nearby-best.js / 화면 출력에는 아직 연결하지 않는다.
 * 기존 calculateSnorkelingScore / estimateUnderwaterVisibility 는 삭제하지 않는다.
 *
 * 공개 API:
 *   window.SNORKYEval.evaluate(row, point, options) → CommonResult
 *   window.SNORKYEval.waveScore(waveHeight)           → number|null
 *   window.SNORKYEval.currentScore(currentSpeed)      → number|null
 *   window.SNORKYEval.windScore(windSpeed, windDeg, env) → number|null
 *   window.SNORKYEval.entryA(waveS, currentS, windS)  → {a0, g, a}
 *   window.SNORKYEval.visibilityB(row, env, history)  → {score, grade, explanation}
 *   window.SNORKYEval.comfortC(row)                   → number
 *   window.SNORKYEval.finalScore(entryA, visB, comfortC) → number
 *   window.SNORKYEval.VERSION                         → "1.2"
 */
(function () {
  "use strict";

  const VERSION = "1.2";

  // ─────────────────────────────────────────────────────────────
  // §4  Data Quality Gate
  // ─────────────────────────────────────────────────────────────
  /**
   * Safety 필수 데이터 존재 여부. wave_height는 Hard Safety 판단에 필수.
   * current_speed / wind_speed 는 보조지만, 없으면 해당 엔진은 null 처리.
   */
  function dataQualityGate(row) {
    if (!Number.isFinite(row?.wave_height)) {
      return { pass: false, reason: "wave_height 데이터 없음" };
    }
    return { pass: true, reason: null };
  }

  // ─────────────────────────────────────────────────────────────
  // §5  Wave Engine  (§명세 임계표 + 선형 보간)
  // ─────────────────────────────────────────────────────────────
  /**
   * V1.2 명세 §5 임계표 — 중간값은 선형 보간
   * ≥0.80 m 는 Hard Safety Gate 후보 (여기서는 점수를 반환하되 호출자가 Safety 처리)
   */
  const WAVE_BREAKPOINTS = [
    [0.15, 100],
    [0.25, 90],
    [0.30, 82],
    [0.40, 65],
    [0.50, 45],
    [0.60, 28],
    [0.65, 20],
    [0.70, 12],
    [0.75, 6],
    [0.80, 0],   // 0.80 이상은 Safety Gate — 점수 0으로 수렴
  ];

  function linearInterpolate(breakpoints, x) {
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

  /** V1.2 §5 Wave Score (0~100). wave_height 단위: m */
  function waveScore(waveHeight) {
    return linearInterpolate(WAVE_BREAKPOINTS, waveHeight);
  }

  /**
   * 파주기(wave_period)는 파고 위험의 보정계수로만 사용 (§5)
   * 장주기(≥9s) + 너울(swell_height≥0.3) 일 때 waveScore를 하향 보정.
   * 독립 점수 항목으로 사용하지 않는다.
   */
  function wavePeriodCorrectedScore(rawWaveScore, wavePeriod, swellHeight) {
    if (!Number.isFinite(rawWaveScore)) return rawWaveScore;
    if (!Number.isFinite(wavePeriod)) return rawWaveScore;
    // 장주기 너울 위험 증가: period≥9 AND swell≥0.3 → 최대 15점 추가 감점
    if (wavePeriod >= 9 && Number.isFinite(swellHeight) && swellHeight >= 0.3) {
      const severityFactor = Math.min(1, (swellHeight - 0.3) / 0.4); // 0.3→0, 0.7→1
      const penalty = Math.round(15 * severityFactor);
      return Math.max(0, rawWaveScore - penalty);
    }
    return rawWaveScore;
  }

  // ─────────────────────────────────────────────────────────────
  // §6  Current Engine
  // ─────────────────────────────────────────────────────────────
  const CURRENT_BREAKPOINTS = [
    [0.10, 100],
    [0.15, 95],
    [0.20, 88],
    [0.25, 78],
    [0.30, 65],
    [0.35, 52],
    [0.40, 38],
    [0.45, 25],
    [0.50, 15],
    [0.60, 5],
  ];

  /** V1.2 §6 Current Score (0~100). current_speed 단위: m/s */
  function currentScore(currentSpeed) {
    if (!Number.isFinite(currentSpeed)) return null;
    if (currentSpeed <= 0.10) return 100;
    if (currentSpeed >= 0.60) return 5;
    return linearInterpolate(CURRENT_BREAKPOINTS, currentSpeed);
  }

  // ─────────────────────────────────────────────────────────────
  // §7  Wind Engine
  // ─────────────────────────────────────────────────────────────
  const WIND_BREAKPOINTS = [
    [3,  100],
    [4,  95],
    [5,  88],
    [6,  78],
    [7,  65],
    [8,  50],
    [9,  35],
    [10, 20],
    [11, 10],
    [12, 0],
  ];

  /**
   * V1.2 §7 Wind Score.
   * eastWindSensitivity: 동풍 성분(67.5°~112.5°)이 실제 존재할 때만 보정.
   * 일반 windExposureDirection은 미구현(DB 필드 없음) — 사용하지 않음.
   */
  function windScore(windSpeed, windDirectionDeg, environment) {
    if (!Number.isFinite(windSpeed)) return null;
    let base;
    if (windSpeed <= 3) base = 100;
    else if (windSpeed >= 12) base = 0;
    else base = linearInterpolate(WIND_BREAKPOINTS, windSpeed);

    // eastWindSensitivity 보정: 동풍 방향(±22.5° of 90°)에서만 적용
    const sensitivity = environment?.eastWindSensitivity ?? environment?.onshoreWindSensitivity ?? "medium";
    const isEastWind = Number.isFinite(windDirectionDeg) &&
      Math.abs(((windDirectionDeg % 360 + 360) % 360) - 90) <= 22.5;
    if (isEastWind && sensitivity !== "medium") {
      const factors = { low: 0.90, medium: 1.00, high: 1.10 };
      const f = factors[sensitivity] ?? 1.00;
      // factor > 1 → 더 위험하게 취급 → 점수 낮춤 (clamp ±15%)
      const raw = 100 - (100 - base) * Math.max(0.85, Math.min(1.15, f));
      base = Math.max(0, Math.min(100, raw));
    }
    return Math.round(base * 10) / 10;
  }

  // ─────────────────────────────────────────────────────────────
  // §8  Entry Condition A — 기하결합 + weakest-link Gate
  // ─────────────────────────────────────────────────────────────
  /**
   * A₀ = 100 × (Wave/100)^0.60 × (Current/100)^0.30 × (Wind/100)^0.10
   * M  = min(Wave, Current)
   * G  = 0.70 + 0.30 × (M / 100)
   * A  = A₀ × G
   *
   * Wave 또는 Current가 null이면 결과를 산출할 수 없다.
   * Wind가 null이면 Wind 항을 100으로 대체하지 않고 (가중치 조정 없음) null 반환.
   */
  function entryA(wS, cS, wndS) {
    // Wave, Current는 필수
    if (!Number.isFinite(wS) || !Number.isFinite(cS)) {
      return { a0: null, g: null, a: null, nullReason: "Wave 또는 Current 데이터 없음" };
    }
    // Wind 없으면 보조 비중 제외하고 Wave/Current 기하결합만으로 계산
    const windFactor = Number.isFinite(wndS) ? Math.pow(wndS / 100, 0.10) : 1.0;
    const waveFactor = Math.pow(Math.max(0, wS) / 100, 0.60);
    const currentFactor = Math.pow(Math.max(0, cS) / 100, 0.30);
    const a0 = 100 * waveFactor * currentFactor * windFactor;
    const m = Math.min(wS, cS);
    const g = 0.70 + 0.30 * (m / 100);
    const a = Math.max(0, Math.min(100, a0 * g));
    return { a0: Math.round(a0 * 10) / 10, g: Math.round(g * 1000) / 1000, a: Math.round(a * 10) / 10 };
  }

  // ─────────────────────────────────────────────────────────────
  // §9  Visibility Engine B — 48h 이력 + Exponential Decay
  // ─────────────────────────────────────────────────────────────

  /**
   * terrain별 감쇠 상수 λ (/h) — 암반 빠른 회복, 모래 느린 회복
   * λ = ln(2) / 반감기(h)
   */
  const TERRAIN_LAMBDA = {
    rock:    { wave: 0.080, precip: 0.100 },  // 반감기: wave~8.7h, precip~6.9h
    default: { wave: 0.058, precip: 0.080 },  // 반감기: wave~12h,  precip~8.7h
    sand:    { wave: 0.040, precip: 0.058 },  // 반감기: wave~17.3h, precip~12h
  };

  function getTerrainLambda(terrain) {
    if (terrain === "rock") return TERRAIN_LAMBDA.rock;
    if (terrain === "sand") return TERRAIN_LAMBDA.sand;
    return TERRAIN_LAMBDA.default;
  }

  /**
   * 파고에서 교란 강도를 계산 (0~1).
   * Hs가 높을수록, 파주기가 길수록 교란 강도 증가.
   */
  function waveDisruptionImpact(waveHeight, wavePeriod) {
    if (!Number.isFinite(waveHeight) || waveHeight <= 0) return 0;
    // 파고 기반: 0.2m→0.1, 0.5m→0.5, 0.8m→1.0 (선형 스케일)
    const baseImpact = Math.min(1, Math.max(0, (waveHeight - 0.1) / 0.7));
    // 장주기 너울 보정: wavePeriod≥9 → 20% 가산
    const periodBonus = Number.isFinite(wavePeriod) && wavePeriod >= 9 ? 0.20 : 0;
    return Math.min(1, baseImpact + periodBonus);
  }

  /**
   * 강수 교란 강도 계산 (0~1).
   * 현재 강수는 Comfort에 반영하고 과거 강수만 Visibility에 반영 (§9)
   */
  function precipDisruptionImpact(precipitation) {
    if (!Number.isFinite(precipitation) || precipitation <= 0) return 0;
    // 0mm/h → 0, 5mm/h → 0.5, ≥20mm/h → 1.0
    return Math.min(1, precipitation / 20);
  }

  /**
   * Environment 보정 계수 — exposure, breakwaterShelter, swellSensitivity
   * 보정 범위는 ±15% 이내로 clamp (§5)
   */
  function visibilityEnvFactor(environment) {
    const exposure = environment?.exposure ?? "medium";
    const shelter = environment?.breakwaterShelter ?? "medium";
    const swell = environment?.swellSensitivity ?? "medium";
    const expMap    = { low: 0.85, medium: 1.00, high: 1.15 };
    const shelterMap = { low: 1.15, medium: 1.00, high: 0.85 };
    const swellMap  = { low: 0.95, medium: 1.00, high: 1.05 };
    const factor = (expMap[exposure] ?? 1.0) * (shelterMap[shelter] ?? 1.0) * (swellMap[swell] ?? 1.0);
    return Math.max(0.85, Math.min(1.15, factor));
  }

  /**
   * history: Array<{ hoursAgo: number, wave_height: number|null, wave_period: number|null, precipitation: number|null }>
   *   - hoursAgo: 현재로부터 몇 시간 전인지 (0 = 현재, 양수 = 과거)
   *   - 최대 48시간 이내 항목만 사용
   *
   * V1.2 §9: Visibility B
   * 반환값: { score: 0~100, grade: string, explanation: string, detail: object }
   */
  function visibilityB(row, environment, history = []) {
    const terrain = environment?.terrain ?? "default";
    const lambda = getTerrainLambda(terrain);
    const envFactor = visibilityEnvFactor(environment);

    // 현재 시점을 포함한 이력 구성 (hoursAgo=0이 현재)
    const allEntries = [
      {
        hoursAgo: 0,
        wave_height: row?.wave_height ?? null,
        wave_period: row?.wave_period ?? null,
        precipitation: null,   // 현재 강수는 Comfort에만 (§9)
      },
      ...history.filter(item => Number.isFinite(item.hoursAgo) && item.hoursAgo >= 0 && item.hoursAgo <= 48),
    ];

    // 누적 교란 점수 계산
    let totalWaveImpact = 0;
    let totalPrecipImpact = 0;
    let hasHistory = allEntries.length > 1;

    for (const entry of allEntries) {
      const t = entry.hoursAgo;
      const wImpact = waveDisruptionImpact(entry.wave_height, entry.wave_period);
      const pImpact = precipDisruptionImpact(entry.precipitation);
      totalWaveImpact  += wImpact  * Math.exp(-lambda.wave  * t) * envFactor;
      totalPrecipImpact += pImpact * Math.exp(-lambda.precip * t);
    }

    // 정규화: 48h 누적 최대값 기준으로 0~1 스케일
    // 최대: 매 시간 impact=1, envFactor=1.15 → 합≈14.4 (파도), 합≈12.5 (강수)
    const MAX_WAVE_IMPACT   = 14.4;
    const MAX_PRECIP_IMPACT = 12.5;
    const normWave   = Math.min(1, totalWaveImpact   / MAX_WAVE_IMPACT);
    const normPrecip = Math.min(1, totalPrecipImpact / MAX_PRECIP_IMPACT);

    // B score: 100에서 교란 감점 (파도 영향이 강수보다 더 큰 비중)
    const rawB = 100 - (normWave * 70) - (normPrecip * 30);
    const score = Math.max(0, Math.min(100, Math.round(rawB)));

    const grade = visibilityGradeFromScore(score);
    const explanation = buildVisibilityExplanation(
      row?.wave_height, normWave, normPrecip, terrain, hasHistory, grade
    );

    return {
      score,
      grade,
      explanation,
      detail: {
        terrain,
        envFactor: Math.round(envFactor * 1000) / 1000,
        normWaveImpact:   Math.round(normWave * 1000) / 1000,
        normPrecipImpact: Math.round(normPrecip * 1000) / 1000,
        historyPoints: allEntries.length,
      },
    };
  }

  /** V1.2 §9 B점수 → 5단계 등급 */
  function visibilityGradeFromScore(score) {
    if (!Number.isFinite(score)) return "UNKNOWN";
    if (score >= 85) return "좋음";
    if (score >= 65) return "양호";
    if (score >= 45) return "보통/회복중";
    if (score >= 25) return "나쁨";
    return "매우나쁨";
  }

  /** §13 Explain Layer — 자동 설명문 */
  function buildVisibilityExplanation(currentWaveHeight, normWave, normPrecip, terrain, hasHistory, grade) {
    const currentWaveHigh = Number.isFinite(currentWaveHeight) && currentWaveHeight >= 0.4;
    const histPrecip = normPrecip > 0.15;
    const histWave   = normWave > 0.20;

    if (currentWaveHigh && histWave)
      return "현재 파도 영향으로 바닥 교란이 크고 최근 높은 파도의 영향도 남아 있습니다.";
    if (currentWaveHigh)
      return "현재 파도 영향으로 바닥 교란이 커 수중시야가 낮게 예상됩니다.";
    if (!hasHistory && !currentWaveHigh)
      return "현재 파도는 잔잔하며, 이력 데이터가 충분하지 않아 회복 상태를 정확히 추정하기 어렵습니다.";
    if (histWave && histPrecip)
      return "최근 파도와 강수 영향이 겹쳐 수중시야 회복이 늦어지고 있습니다.";
    if (histWave)
      return "현재 바다는 잔잔하지만 최근 높은 파도의 영향으로 수중시야가 회복 중입니다.";
    if (histPrecip)
      return "현재 비는 그쳤지만 최근 강수 영향으로 수중시야가 낮게 예상됩니다.";
    return "최근 파도와 강수 영향이 적어 수중시야가 좋은 상태로 예상됩니다.";
  }

  // ─────────────────────────────────────────────────────────────
  // §10  Comfort C & Final Condition
  // ─────────────────────────────────────────────────────────────
  /**
   * Comfort C 점수 (0~100)
   * 입력: row.precipitation (현재 강수량 mm/h), row.temperature, row.sea_temperature, row.cloud_cover
   * 바다 자체가 좋은데 흐리다고 크게 낮아지지 않도록 — 각 요소 균등 기여
   */
  function comfortC(row) {
    const scores = [];

    // 강수: 0→100, 0.5→80, 2→50, 5→20, ≥10→0
    if (Number.isFinite(row?.precipitation)) {
      const p = row.precipitation;
      const ps = p <= 0 ? 100 : p <= 0.5 ? 80 : p <= 2 ? 50 : p <= 5 ? 20 : 0;
      scores.push(ps);
    }

    // 기온: 18~30°C → 100, 10°C→60, 5°C→30, <5°C→0, >35°C→60
    if (Number.isFinite(row?.temperature)) {
      const t = row.temperature;
      let ts;
      if (t >= 18 && t <= 30) ts = 100;
      else if (t > 30) ts = Math.max(0, 100 - (t - 30) * 8);
      else if (t >= 10) ts = 60 + (t - 10) * 4;
      else if (t >= 5) ts = 30 + (t - 5) * 6;
      else ts = Math.max(0, 30 + t * 6);
      scores.push(Math.max(0, Math.min(100, ts)));
    }

    // 수온: ≥24→100, 21→80, 18→60, 15→40, <15→20
    if (Number.isFinite(row?.sea_temperature)) {
      const st = row.sea_temperature;
      let sts;
      if (st >= 24) sts = 100;
      else if (st >= 21) sts = 80 + (st - 21) * (20 / 3);
      else if (st >= 18) sts = 60 + (st - 18) * (20 / 3);
      else if (st >= 15) sts = 40 + (st - 15) * (20 / 3);
      else sts = Math.max(0, 20 + (st - 15) * 4);
      scores.push(Math.max(0, Math.min(100, sts)));
    }

    // 구름: 0~30%→100, 30~70%→80, >70%→60 (흐림이 크게 감점하지 않도록)
    if (Number.isFinite(row?.cloud_cover)) {
      const cc = row.cloud_cover;
      const cs = cc <= 30 ? 100 : cc <= 70 ? 80 : 60;
      scores.push(cs);
    }

    if (!scores.length) return 70;  // 데이터 없음 → 중립값 (최상값으로 채우지 않음)
    return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
  }

  /**
   * CM = 0.95 + 0.05 × (C / 100)   →  C=100이면 CM=1.00, C=0이면 CM=0.95
   * Core = 100 × (A/100)^0.63 × (B/100)^0.37
   * Final = Core × CM
   */
  function finalScore(entryAScore, visBScore, comfortCScore) {
    if (!Number.isFinite(entryAScore) || !Number.isFinite(visBScore)) return null;
    const a = Math.max(0, Math.min(100, entryAScore));
    const b = Math.max(0, Math.min(100, visBScore));
    const c = Number.isFinite(comfortCScore) ? Math.max(0, Math.min(100, comfortCScore)) : 70;
    const core = 100 * Math.pow(a / 100, 0.63) * Math.pow(b / 100, 0.37);
    const cm = 0.95 + 0.05 * (c / 100);
    return Math.max(0, Math.min(100, Math.round(core * cm * 10) / 10));
  }

  // ─────────────────────────────────────────────────────────────
  // §11  Recommendation 3단계
  // ─────────────────────────────────────────────────────────────
  /**
   * Entry A 기반 + Visibility B 하향 보정
   * A≥80 → 추천, A 65~79 → 주의, A<65 → 비추천
   * B<45(보통 이하)이면 한 단계 하향
   */
  function recommendation(entryAScore, visBScore) {
    if (!Number.isFinite(entryAScore)) return "비추천";
    let rec;
    if (entryAScore >= 80) rec = "추천";
    else if (entryAScore >= 65) rec = "주의";
    else rec = "비추천";

    // Visibility B 하향 보정
    if (Number.isFinite(visBScore) && visBScore < 45) {
      if (rec === "추천") rec = "주의";
      else if (rec === "주의") rec = "비추천";
    }
    return rec;
  }

  // ─────────────────────────────────────────────────────────────
  // §12  Activity Time Gate
  // ─────────────────────────────────────────────────────────────
  /**
   * sunTimes: { sunrise: ISO8601 string, sunset: ISO8601 string }
   * evaluatedAt: ISO8601 or Date
   * V1.2 §12 기준 — 야간은 Hard Safety BLOCK 아님, Recommendation 제한만
   */
  function applyActivityTimeGate(baseRecommendation, sunTimes, evaluatedAt) {
    if (!sunTimes?.sunrise || !sunTimes?.sunset) return baseRecommendation;
    const now = new Date(evaluatedAt ?? new Date());
    const sunrise = new Date(sunTimes.sunrise);
    const sunset  = new Date(sunTimes.sunset);
    if (isNaN(sunrise.getTime()) || isNaN(sunset.getTime())) return baseRecommendation;

    const minsToSunset = (sunset.getTime() - now.getTime()) / 60000;
    const afterSunset  = now >= sunset;
    const beforeSunrise = now < sunrise;

    if (beforeSunrise || afterSunset) return "야간 비추천";
    if (minsToSunset <= 30) return "해질녘 비추천";
    if (minsToSunset <= 60) {
      // 해질녘 주의: 기존 비추천이면 유지, 아니면 주의
      return baseRecommendation === "비추천" ? "비추천" : "해질녘 주의";
    }
    return baseRecommendation;
  }

  // ─────────────────────────────────────────────────────────────
  // §4+§11  Recommendation 상태 한글 설명
  // ─────────────────────────────────────────────────────────────
  const CONDITION_LABELS = [
    { min: 80, label: "오늘 바다 정말 좋아요!" },
    { min: 65, label: "오늘 바다 괜찮아요" },
    { min: 50, label: "오늘 바다는 좀 아쉬워요" },
    { min: 35, label: "오늘 바다는 많이 아쉬워요" },
    { min:  0, label: "오늘은 바다 쉬어가요" },
  ];

  function conditionLabel(score) {
    if (!Number.isFinite(score)) return "바다 상태를 확인할 수 없어요";
    return CONDITION_LABELS.find(l => score >= l.min)?.label ?? CONDITION_LABELS.at(-1).label;
  }

  // ─────────────────────────────────────────────────────────────
  // §17.4  공통 결과 객체 생성
  // ─────────────────────────────────────────────────────────────
  /**
   * 메인 평가 함수.
   *
   * @param {object} row           buildCurrentRow 결과물 (wave_height, current_speed, wind_speed, wave_period 등)
   * @param {object} point         포인트 객체 { environment: { terrain, exposure, breakwaterShelter, swellSensitivity, eastWindSensitivity } }
   * @param {object} [options]
   *   @param {object}   options.safety      SNORKYMarineSafety.statusForPoint(point) 결과
   *   @param {object}   options.sunTimes    { sunrise: ISO8601, sunset: ISO8601 }
   *   @param {Array}    options.waveHistory [ { hoursAgo, wave_height, wave_period, precipitation } ]
   *   @param {string}   options.evaluatedAt ISO8601 — 없으면 new Date()
   *
   * @returns {CommonResult}  §17.4 공통 결과 객체
   */
  function evaluate(row, point, options = {}) {
    const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();
    const env = (typeof window !== "undefined" && typeof window.normalizePointEnvironment === "function")
      ? window.normalizePointEnvironment(point?.environment)
      : (point?.environment ?? {});

    // ── §4 Data Quality Gate ──
    const dq = dataQualityGate(row);
    if (!dq.pass) {
      return makeResult({
        safety: "UNKNOWN", safetyReasons: [dq.reason],
        recommendation: "비추천",
        conditionScore: null,
        waveScore: null, currentScore: null, windScore: null, entryA: null,
        visibilityScore: null, visibilityGrade: "UNKNOWN",
        visibilityExplanation: "필수 안전 데이터가 없어 수중시야를 예측할 수 없습니다.",
        comfortScore: null, finalRaw: null,
        evaluatedAt, row, env,
      });
    }

    // ── §4 Safety Gate ──
    const safetyStatus = options.safety ?? null;
    const kmaStatus = safetyStatus?.status ?? "UNKNOWN";
    const isHardBlocked = kmaStatus === "BLOCK";

    // Hard Safety: 파고 0.80m 이상은 BLOCK 후보 (§4, §5)
    const waveHs = row.wave_height;
    const waveHardBlock = Number.isFinite(waveHs) && waveHs >= 0.80;
    const hardBlockReasons = [];
    if (isHardBlocked && safetyStatus?.warning) {
      const w = safetyStatus.warning;
      hardBlockReasons.push(`${w.areaName ?? ""} ${w.warningName ?? ""}${w.levelName ?? ""} 발효 중`.trim());
    }
    if (waveHardBlock) {
      hardBlockReasons.push(`유의파고 ${waveHs.toFixed(2)}m — Hard Safety 기준 초과`);
    }

    const safety = (isHardBlocked || waveHardBlock) ? "BLOCK"
      : kmaStatus === "PASS" ? "PASS"
      : "UNKNOWN";

    // BLOCK 또는 UNKNOWN이면 점수 숨김
    if (safety === "BLOCK" || safety === "UNKNOWN") {
      return makeResult({
        safety, safetyReasons: hardBlockReasons.length ? hardBlockReasons : [kmaStatus === "UNKNOWN" ? "해상특보 정보 확인 불가" : "입수 금지"],
        recommendation: "비추천",
        conditionScore: null,   // 점수 숨김
        waveScore: null, currentScore: null, windScore: null, entryA: null,
        visibilityScore: null, visibilityGrade: "UNKNOWN",
        visibilityExplanation: safety === "BLOCK" ? "입수 금지 상태로 예상 수중시야를 제공하지 않습니다." : "안전정보를 확인할 수 없습니다.",
        comfortScore: null, finalRaw: null,
        evaluatedAt, row, env,
      });
    }

    // ── §5 Wave ──
    const rawWave = waveScore(waveHs);
    const correctedWave = wavePeriodCorrectedScore(rawWave, row.wave_period, row.swell_height);

    // ── §6 Current ──
    const curS = currentScore(row.current_speed);

    // ── §7 Wind ──
    const wndS = windScore(row.wind_speed, row.wind_direction_degree, env);

    // ── §8 Entry A ──
    const entryResult = entryA(correctedWave, curS, wndS);
    const entryAScore = entryResult.a;

    // ── §9 Visibility B ──
    const visResult = visibilityB(row, env, options.waveHistory ?? []);

    // ── §10 Comfort C ──
    const comfortScore = comfortC(row);

    // ── §10 Final Score ──
    const final = finalScore(entryAScore, visResult.score, comfortScore);

    // ── §11 Recommendation ──
    const baseRec = recommendation(entryAScore, visResult.score);

    // ── §12 Activity Time Gate ──
    const finalRec = applyActivityTimeGate(baseRec, options.sunTimes, evaluatedAt);

    return makeResult({
      safety: "PASS", safetyReasons: [],
      recommendation: finalRec,
      conditionScore: final,
      waveScore: correctedWave, currentScore: curS, windScore: wndS,
      entryA: entryResult,
      visibilityScore: visResult.score, visibilityGrade: visResult.grade,
      visibilityExplanation: visResult.explanation,
      comfortScore, finalRaw: final,
      evaluatedAt, row, env,
      _detail: {
        rawWaveScore: rawWave,
        wavePeriodCorrectedScore: correctedWave,
        visibilityDetail: visResult.detail,
        entryA0: entryResult.a0,
        entryGate: entryResult.g,
        baseRecommendation: baseRec,
        comfortModifier: 0.95 + 0.05 * (comfortScore / 100),
      },
    });
  }

  function makeResult({
    safety, safetyReasons, recommendation: rec,
    conditionScore, waveScore: wS, currentScore: cS, windScore: wndS,
    entryA: eA, visibilityScore, visibilityGrade, visibilityExplanation,
    comfortScore, finalRaw, evaluatedAt, row, env, _detail,
  }) {
    return Object.freeze({
      // §17.4 최소 필드
      safety,                    // "PASS" | "BLOCK" | "UNKNOWN"
      safetyReasons,             // string[]
      recommendation: rec,       // "추천" | "주의" | "비추천" | "야간 비추천" | "해질녘 주의" | "해질녘 비추천"
      conditionScore,            // 0~100 또는 null (BLOCK/UNKNOWN)
      visibilityScore,           // 0~100 또는 null
      visibilityGrade,           // "좋음"|"양호"|"보통/회복중"|"나쁨"|"매우나쁨"|"UNKNOWN"
      visibilityExplanation,     // string
      evaluatedAt,               // ISO8601
      // 대표 지표 요약
      metrics: Object.freeze({
        waveHeight: row?.wave_height ?? null,
        currentSpeed: row?.current_speed ?? null,
        windSpeed: row?.wind_speed ?? null,
        wavePeriod: row?.wave_period ?? null,
        seaTemperature: row?.sea_temperature ?? null,
        waveScore: wS,
        currentScore: cS,
        windScore: wndS,
        entryA: eA?.a ?? null,
        comfortScore,
        conditionLabel: conditionScore !== null ? conditionLabel(conditionScore) : null,
      }),
      // 내부 진단 (개발/감사용)
      _detail: _detail ?? null,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // §17.5  통합 진입점 헬퍼 (V1.2 연결 단계)
  // ─────────────────────────────────────────────────────────────

  /**
   * Marine 캐시 데이터에서 과거 48시간 wave history를 추출.
   * visibilityB()의 history 인수 형식으로 변환.
   *
   * @param {object} marine  SNORKYOpenMeteoMarineCache.fetch() 결과
   * @param {string} currentTimestamp  현재 슬롯 timestamp ("YYYY-MM-DDTHH:mm")
   * @returns {Array<{hoursAgo, wave_height, wave_period, precipitation}>}
   */
  function waveHistoryFromMarineData(marine, currentTimestamp) {
    if (!marine?.hourly?.time || !currentTimestamp) return [];
    try {
      const times = marine.hourly.time;
      const waveH = marine.hourly.wave_height || [];
      const waveP = marine.hourly.wave_period || [];
      const nowMs = new Date(currentTimestamp + ":00+09:00").getTime();
      if (isNaN(nowMs)) return [];
      const history = [];
      for (let i = 0; i < times.length; i++) {
        const slotMs = new Date(times[i] + ":00+09:00").getTime();
        if (isNaN(slotMs)) continue;
        const hoursAgo = (nowMs - slotMs) / 3600000;
        if (hoursAgo <= 0 || hoursAgo > 48) continue;
        const wh = typeof waveH[i] === "number" ? waveH[i] : null;
        const wp = typeof waveP[i] === "number" ? waveP[i] : null;
        if (wh !== null) {
          history.push({ hoursAgo, wave_height: wh, wave_period: wp, precipitation: null });
        }
      }
      return history;
    } catch (_) {
      return [];
    }
  }

  /**
   * 모든 화면에서 공통으로 사용하는 SNORKYEval 호출 어댑터.
   * row, point, marine 캐시를 받아 V1.2 CommonResult를 반환.
   * 기존 calculateEnvironmentComponentPreview 결과를 대체하지 않고 v12 필드에 추가 저장.
   *
   * @param {object} row           buildCurrentRow 결과물
   * @param {object} point         포인트 객체 (environment, lat, lng 포함)
   * @param {object} [marine]      SNORKYOpenMeteoMarineCache.fetch() 결과 (없으면 history=[])
   * @param {object} [extraOptions]  sunTimes 등 추가 옵션
   * @returns {CommonResult}
   */
  function evaluateWithMarineKma(row, point, marine, extraOptions = {}) {
    try {
      const safetyStatus = (typeof window !== "undefined" && window.SNORKYMarineSafety)
        ? window.SNORKYMarineSafety.statusForPoint(point)
        : null;
      const waveHistory = waveHistoryFromMarineData(marine, row?.timestamp ?? null);
      return evaluate(row, point, {
        safety: safetyStatus,
        waveHistory,
        ...extraOptions,
      });
    } catch (err) {
      // 평가 실패 시 UNKNOWN 결과 반환 (기존 흐름 보호)
      console.warn("[SNORKYEval] evaluateWithMarineKma 실패:", err?.message ?? err);
      return evaluate({}, point, { safety: null });
    }
  }

  /**
   * row 또는 point 객체에서 v12 CommonResult를 안전하게 추출.
   * v12가 없으면 null 반환.
   *
   * @param {object} item  row | point | evalItem (v12 필드를 가질 수 있는 객체)
   * @returns {CommonResult|null}
   */
  function getV12Result(item) {
    return item?.v12 ?? null;
  }

  // ─────────────────────────────────────────────────────────────
  // §17.5  공통 컨디션 표시 단일 기준
  // ─────────────────────────────────────────────────────────────
  /**
   * 전 화면 공통 컨디션 상태 산출 함수
   * 80~100 -> 좋음 / 65~79 -> 보통 / 50~64 -> 주의 / 0~49 -> 나쁨 / BLOCK -> 입수 금지 / UNKNOWN -> 확인 필요
   */
  function getConditionStatus(pointOrScore, safety) {
    let score = pointOrScore;
    let s = safety;
    if (typeof pointOrScore === "object" && pointOrScore !== null) {
      const v12 = pointOrScore.v12 || pointOrScore;
      s = s || v12.safety || pointOrScore.kma || pointOrScore.safety;
      score = v12.conditionScore ?? pointOrScore.score;
    }
    if (s === "BLOCK") return "입수 금지";
    if (s === "UNKNOWN") return "확인 필요";
    const num = Number(score);
    if (!Number.isFinite(num)) return "확인 필요";
    if (num >= 80) return "좋음";
    if (num >= 65) return "보통";
    if (num >= 50) return "주의";
    return "나쁨";
  }

  function getConditionStatusInfo(pointOrScore, safety) {
    const status = getConditionStatus(pointOrScore, safety);
    let color = "#64748b";
    let dot = "⚪";
    if (status === "좋음") { color = "#10b981"; dot = "🟢"; }
    else if (status === "보통") { color = "#3b82f6"; dot = "🔵"; }
    else if (status === "주의") { color = "#f59e0b"; dot = "🟡"; }
    else if (status === "나쁨") { color = "#f97316"; dot = "🟠"; }
    else if (status === "입수 금지") { color = "#ef4444"; dot = "🔴"; }
    return { status, color, dot };
  }

  // ─────────────────────────────────────────────────────────────
  // §17.6  공통 BEST Ranking SSOT
  // ─────────────────────────────────────────────────────────────
  /**
   * 전 화면 공통 BEST 순위 산출 함수
   * 후보 목록 -> (반경/지역 필터) -> Safety PASS -> conditionScore >= 50 -> conditionScore DESC 단 1회 정렬 -> rank 부여 -> 최대 10개
   * @param {Array<object>} points
   * @param {object} [options]
   * @param {number} [options.radius]
   * @param {{latitude: number, longitude: number}} [options.userCoords]
   * @param {string} [options.region]
   * @param {number} [options.limit=10]
   * @returns {Array<object>}
   */
  function rankBestPoints(points, options = {}) {
    if (!Array.isArray(points)) return [];

    let candidates = points;
    if (options.userCoords && Number.isFinite(Number(options.radius))) {
      const radius = Number(options.radius);
      candidates = candidates.filter(p => {
        const dist = Number.isFinite(p.distance) ? p.distance : (
          (p.lat != null && p.lng != null && window.SNORKYNearbyBest?.haversineKm)
            ? window.SNORKYNearbyBest.haversineKm(options.userCoords.latitude, options.userCoords.longitude, Number(p.lat), Number(p.lng))
            : Infinity
        );
        return dist <= radius;
      });
    }
    if (options.region) {
      candidates = candidates.filter(p => p.region === options.region || p.regionId === options.region || String(p.region).includes(options.region));
    }

    // 1. 적격 후보 필터링: Safety PASS && conditionScore >= 50
    const eligible = candidates.filter(p => {
      const v12 = p.v12;
      if (!v12) return false;
      const safety = v12.safety || p.kma;
      const score = Number(v12.conditionScore);
      return safety === "PASS" && Number.isFinite(score) && score >= 50;
    });

    // 2. conditionScore DESC 단 한 번 정렬 (오직 Number(point.v12.conditionScore)만 사용)
    eligible.sort((a, b) => {
      const scoreA = Number(a.v12?.conditionScore);
      const scoreB = Number(b.v12?.conditionScore);
      if (scoreB !== scoreA) return scoreB - scoreA;
      if (a.sourceIndex != null && b.sourceIndex != null && a.sourceIndex !== b.sourceIndex) {
        return a.sourceIndex - b.sourceIndex;
      }
      if (Number.isFinite(a.distance) && Number.isFinite(b.distance) && a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      return String(a.region || "").localeCompare(String(b.region || ""), "ko-KR") ||
             String(a.name || "").localeCompare(String(b.name || ""), "ko-KR") ||
             String(a.id || a.supabaseId || "").localeCompare(String(b.id || b.supabaseId || ""));
    });

    // 3. rank 부여
    const limit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 10;
    const sliced = eligible.slice(0, limit);
    return sliced.map((point, index) => ({
      ...point,
      rank: index + 1
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // 공개 API
  // ─────────────────────────────────────────────────────────────
  const SNORKYEval = Object.freeze({
    VERSION,
    evaluate,
    // 통합 진입점 (V1.2 연결 단계)
    evaluateWithMarineKma,
    waveHistoryFromMarineData,
    getV12Result,
    getConditionStatus,
    getConditionStatusInfo,
    rankBestPoints,
    // 개별 엔진 (테스트/진단용)
    waveScore,
    wavePeriodCorrectedScore,
    currentScore,
    windScore,
    entryA,
    visibilityB,
    visibilityGradeFromScore,
    comfortC,
    finalScore,
    recommendation,
    applyActivityTimeGate,
    conditionLabel,
    // 내부 상수 (테스트용)
    _WAVE_BREAKPOINTS: WAVE_BREAKPOINTS,
    _CURRENT_BREAKPOINTS: CURRENT_BREAKPOINTS,
    _WIND_BREAKPOINTS: WIND_BREAKPOINTS,
    _TERRAIN_LAMBDA: TERRAIN_LAMBDA,
  });

  if (typeof window !== "undefined") {
    window.SNORKYEval = SNORKYEval;
    window.getSnorkyConditionStatus = getConditionStatus;
    window.getSnorkyConditionStatusInfo = getConditionStatusInfo;
    window.rankSnorkyBestPoints = rankBestPoints;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = SNORKYEval;
  }
})();
