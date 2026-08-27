/**
 * SNORKY V1.2 엔진 테스트
 * Node.js에서 직접 실행: node scripts/test-snorky-eval.js
 *
 * 목적:
 *  1. V1.2 명세 경계값·대표 시나리오 검증
 *  2. 기존 알고리즘(레거시) 결과와 V1.2 결과 비교
 */
"use strict";

// ── 엔진 로드 ──
const SNORKYEval = require("../public/js/snorky-eval.js");

let pass = 0, fail = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS  ${label}`);
    pass++;
  } else {
    console.error(`  ❌ FAIL  ${label}`);
    fail++;
  }
}

function approx(a, b, tol = 0.5) {
  return Math.abs(a - b) <= tol;
}

// ══════════════════════════════════════════════════════════════════
// §5  Wave Engine — 명세 임계값 검증
// ══════════════════════════════════════════════════════════════════
console.log("\n── §5 Wave Engine ──");
assert(SNORKYEval.waveScore(0.10) === 100,  "0.10m → 100");
assert(SNORKYEval.waveScore(0.15) === 100,  "0.15m → 100");
assert(approx(SNORKYEval.waveScore(0.25), 90),  "0.25m → 90");
assert(approx(SNORKYEval.waveScore(0.30), 82),  "0.30m → 82");
assert(approx(SNORKYEval.waveScore(0.40), 65),  "0.40m → 65");
assert(approx(SNORKYEval.waveScore(0.50), 45),  "0.50m → 45");
assert(approx(SNORKYEval.waveScore(0.60), 28),  "0.60m → 28");
assert(approx(SNORKYEval.waveScore(0.65), 20),  "0.65m → 20");
assert(approx(SNORKYEval.waveScore(0.70), 12),  "0.70m → 12");
assert(approx(SNORKYEval.waveScore(0.75),  6),  "0.75m → 6");
assert(SNORKYEval.waveScore(0.80) === 0,    "0.80m → 0 (Safety)");
assert(SNORKYEval.waveScore(1.20) === 0,    "1.20m → 0 (초과)");
// 선형 보간 검증: 0.40~0.50 사이 중간 0.45 → (65+45)/2 = 55
assert(approx(SNORKYEval.waveScore(0.45), 55, 1), "0.45m → ~55 (보간)");

// ══════════════════════════════════════════════════════════════════
// §6  Current Engine
// ══════════════════════════════════════════════════════════════════
console.log("\n── §6 Current Engine ──");
assert(SNORKYEval.currentScore(0.05) === 100, "0.05m/s → 100");
assert(SNORKYEval.currentScore(0.10) === 100, "0.10m/s → 100");
assert(approx(SNORKYEval.currentScore(0.15), 95), "0.15m/s → 95");
assert(approx(SNORKYEval.currentScore(0.20), 88), "0.20m/s → 88");
assert(approx(SNORKYEval.currentScore(0.25), 78), "0.25m/s → 78");
assert(approx(SNORKYEval.currentScore(0.30), 65), "0.30m/s → 65");
assert(approx(SNORKYEval.currentScore(0.35), 52), "0.35m/s → 52");
assert(approx(SNORKYEval.currentScore(0.40), 38), "0.40m/s → 38");
assert(approx(SNORKYEval.currentScore(0.45), 25), "0.45m/s → 25");
assert(approx(SNORKYEval.currentScore(0.50), 15), "0.50m/s → 15");
assert(approx(SNORKYEval.currentScore(0.60),  5), "0.60m/s → 5");
assert(SNORKYEval.currentScore(null) === null,    "null → null");

// ══════════════════════════════════════════════════════════════════
// §7  Wind Engine
// ══════════════════════════════════════════════════════════════════
console.log("\n── §7 Wind Engine ──");
assert(approx(SNORKYEval.windScore(2, null, {}), 100), "2m/s → 100");
assert(approx(SNORKYEval.windScore(3, null, {}), 100), "3m/s → 100");
assert(approx(SNORKYEval.windScore(4, null, {}),  95, 1), "4m/s → 95");
assert(approx(SNORKYEval.windScore(5, null, {}),  88, 1), "5m/s → 88");
assert(approx(SNORKYEval.windScore(8, null, {}),  50, 1), "8m/s → 50");
assert(approx(SNORKYEval.windScore(10, null, {}), 20, 1), "10m/s → 20");
assert(approx(SNORKYEval.windScore(12, null, {}),  0, 1), "12m/s → 0");
assert(SNORKYEval.windScore(null, null, {}) === null,      "null → null");
// eastWindSensitivity 보정: 동풍(90°) + high → 점수 하락
const windHighEast = SNORKYEval.windScore(6, 90, { eastWindSensitivity: "high" });
const windMedEast  = SNORKYEval.windScore(6, null, {});
assert(windHighEast < windMedEast, "동풍 high sensitivity → 점수 하락");
// 서풍(270°)에서는 eastWindSensitivity 무효
const windHighWest = SNORKYEval.windScore(6, 270, { eastWindSensitivity: "high" });
assert(approx(windHighWest, windMedEast, 1), "서풍에선 eastWind 보정 없음");

// ══════════════════════════════════════════════════════════════════
// §8  Entry A — 기하결합 + weakest-link Gate
// ══════════════════════════════════════════════════════════════════
console.log("\n── §8 Entry A ──");
// 완벽 조건: Wave=100, Wind=100 → A₀=100, G=1.00, A=100
{
  const r = SNORKYEval.entryA(100, 100);
  assert(approx(r.a0, 100, 0.1), "완벽 조건 A₀ = 100");
  assert(approx(r.g, 1.00, 0.01), "완벽 조건 G = 1.00");
  assert(approx(r.a, 100, 1),    "완벽 조건 A = 100");
}
// Wave=65, Wind=100
// A₀ = 100×(65/100)^(6/7)×1 = 100×0.6917≈69.2
// M=65, G=0.70+0.30×0.65=0.895, A=69.2×0.895≈61.9
{
  const r = SNORKYEval.entryA(65, 100);
  assert(r.a < 80, "Wave=65 → A < 80 (주의 이하)");
  assert(r.a >= 60, "Wave=65 → A >= 60 (주의 범위)");
}
// Wave=45, Wind=88 → 비추천 영역
{
  const r = SNORKYEval.entryA(45, 88);
  assert(r.a < 65, "Wave=45, Wind=88 → A < 65 (비추천)");
}
// Wave null → null
{
  const r = SNORKYEval.entryA(null, 100);
  assert(r.a === null, "Wave null → A null");
}

// ══════════════════════════════════════════════════════════════════
// §9  Visibility B — 5단계 등급 경계값
// ══════════════════════════════════════════════════════════════════
console.log("\n── §9 Visibility B 등급 ──");
assert(SNORKYEval.visibilityGradeFromScore(100) === "좋음",       "100 → 좋음");
assert(SNORKYEval.visibilityGradeFromScore(85)  === "좋음",       "85  → 좋음");
assert(SNORKYEval.visibilityGradeFromScore(84)  === "양호",       "84  → 양호");
assert(SNORKYEval.visibilityGradeFromScore(65)  === "양호",       "65  → 양호");
assert(SNORKYEval.visibilityGradeFromScore(64)  === "보통/회복중","64  → 보통/회복중");
assert(SNORKYEval.visibilityGradeFromScore(45)  === "보통/회복중","45  → 보통/회복중");
assert(SNORKYEval.visibilityGradeFromScore(44)  === "나쁨",       "44  → 나쁨");
assert(SNORKYEval.visibilityGradeFromScore(25)  === "나쁨",       "25  → 나쁨");
assert(SNORKYEval.visibilityGradeFromScore(24)  === "매우나쁨",   "24  → 매우나쁨");
assert(SNORKYEval.visibilityGradeFromScore(0)   === "매우나쁨",   "0   → 매우나쁨");

// 이력 없는 잔잔한 바다 → 좋음
{
  const rowCalm = { wave_height: 0.10, wave_period: 7, precipitation: 0 };
  const visCalm = SNORKYEval.visibilityB(rowCalm, {}, []);
  assert(visCalm.score >= 85, `이력 없음, 잔잔 바다 → V B≥85 (got ${visCalm.score})`);
  assert(visCalm.grade === "좋음", "이력 없음, 잔잔 바다 → 좋음");
}
// 현재 파고 0.60m → 교란 큼
{
  const rowRough = { wave_height: 0.60, wave_period: 8 };
  const visRough = SNORKYEval.visibilityB(rowRough, {}, []);
  assert(visRough.score < 65, `파고 0.60m → V B<65 (got ${visRough.score})`);
}
// 48h 전 고파도 이력: 현재 잔잔 but 이력 있음 → 회복중
{
  const rowNowCalm = { wave_height: 0.15, wave_period: 6 };
  const history = [
    { hoursAgo: 6,  wave_height: 0.80, wave_period: 9,  precipitation: 0 },
    { hoursAgo: 12, wave_height: 0.60, wave_period: 8,  precipitation: 2 },
    { hoursAgo: 18, wave_height: 0.40, wave_period: 7,  precipitation: 0 },
  ];
  const visHist = SNORKYEval.visibilityB(rowNowCalm, {}, history);
  console.log(`  [INFO] 잔잔+이력 있음 → V B=${visHist.score} (${visHist.grade}): "${visHist.explanation}"`);
  assert(visHist.score < 85, `잔잔+고파도 이력 → V B<85 (got ${visHist.score})`);
}
// terrain=rock → 더 빠른 회복 → sand보다 높은 B점수
{
  const rowMid = { wave_height: 0.30, wave_period: 7 };
  const hist = [{ hoursAgo: 12, wave_height: 0.60, wave_period: 8, precipitation: 0 }];
  const visRock = SNORKYEval.visibilityB(rowMid, { terrain: "rock" }, hist);
  const visSand = SNORKYEval.visibilityB(rowMid, { terrain: "sand" }, hist);
  assert(visRock.score >= visSand.score, `rock(${visRock.score}) ≥ sand(${visSand.score}) 회복 빠름`);
}

// ══════════════════════════════════════════════════════════════════
// §10  Comfort C
// ══════════════════════════════════════════════════════════════════
console.log("\n── §10 Comfort C ──");
const comfortPerfect = SNORKYEval.comfortC({ precipitation: 0, temperature: 25, sea_temperature: 26, cloud_cover: 20 });
assert(comfortPerfect >= 95, `완벽 컨디션 C≥95 (got ${comfortPerfect})`);
const comfortRainy = SNORKYEval.comfortC({ precipitation: 5, temperature: 15, sea_temperature: 18, cloud_cover: 90 });
assert(comfortRainy < 60, `비+저온 C<60 (got ${comfortRainy})`);
// Comfort modifier 범위: CM = 0.95~1.00
const cmMax = 0.95 + 0.05 * (comfortPerfect / 100);
const cmMin = 0.95 + 0.05 * (comfortRainy / 100);
assert(cmMax >= 0.95 && cmMax <= 1.00, `CM 범위 0.95~1.00 (got ${cmMax.toFixed(3)})`);
assert(cmMin >= 0.95 && cmMin <= 1.00, `CM 범위 0.95~1.00 rainy (got ${cmMin.toFixed(3)})`);

// ══════════════════════════════════════════════════════════════════
// §10  Final Score 공식 검증
// ══════════════════════════════════════════════════════════════════
console.log("\n── §10 Final Score ──");
// A=90, B=90, C=90 → Core=100×(0.9)^0.63×(0.9)^0.37=100×0.9=90, CM=0.95+0.05×0.9=0.995, Final≈89.6
{
  const f = SNORKYEval.finalScore(90, 90, 90);
  assert(approx(f, 89.6, 2), `A=90,B=90,C=90 → Final≈89.6 (got ${f})`);
}
// A=80, B=60, C=80 → Core=100×(0.8)^0.63×(0.6)^0.37≈100×0.861×0.798≈68.7, CM≈0.99, Final≈68
{
  const f = SNORKYEval.finalScore(80, 60, 80);
  console.log(`  [INFO] A=80,B=60,C=80 → Final=${f}`);
  assert(f >= 60 && f <= 80, `A=80,B=60 → Final 60~80 (got ${f})`);
}
// A=0, B=50 → Final=0
{
  const f = SNORKYEval.finalScore(0, 50, 80);
  assert(f === 0, `A=0 → Final=0 (got ${f})`);
}

// ══════════════════════════════════════════════════════════════════
// §11  Recommendation 3단계 + Visibility 하향 보정
// ══════════════════════════════════════════════════════════════════
console.log("\n── §11 Recommendation ──");
assert(SNORKYEval.recommendation(80, 90) === "추천",    "A=80,B=90 → 추천");
assert(SNORKYEval.recommendation(79, 90) === "주의",    "A=79,B=90 → 주의");
assert(SNORKYEval.recommendation(65, 90) === "주의",    "A=65,B=90 → 주의");
assert(SNORKYEval.recommendation(64, 90) === "비추천",  "A=64,B=90 → 비추천");
// B<45 → 하향
assert(SNORKYEval.recommendation(90, 44) === "주의",    "A=90,B=44 → 추천→주의(B 하향)");
assert(SNORKYEval.recommendation(70, 40) === "비추천",  "A=70,B=40 → 주의→비추천(B 하향)");
assert(SNORKYEval.recommendation(50, 30) === "비추천",  "A=50,B=30 → 비추천 유지");
// V1.2 §11 예시: A=90, B=35 → 주의
assert(SNORKYEval.recommendation(90, 35) === "주의",    "V1.2 예시: A=90,B=35 → 주의");

// ══════════════════════════════════════════════════════════════════
// §12  Activity Time Gate
// ══════════════════════════════════════════════════════════════════
console.log("\n── §12 Activity Time Gate ──");
// 새벽 3시 (일출 전)
const sunTimes = {
  sunrise: "2026-08-19T05:30:00+09:00",
  sunset:  "2026-08-19T19:20:00+09:00",
};
assert(
  SNORKYEval.applyActivityTimeGate("추천", sunTimes, "2026-08-19T03:00:00+09:00") === "야간 비추천",
  "일출 전 → 야간 비추천"
);
assert(
  SNORKYEval.applyActivityTimeGate("추천", sunTimes, "2026-08-19T12:00:00+09:00") === "추천",
  "낮 12시 → 그대로 추천"
);
assert(
  SNORKYEval.applyActivityTimeGate("추천", sunTimes, "2026-08-19T18:30:00+09:00") === "해질녘 주의",
  "일몰 50분 전 → 해질녘 주의"
);
assert(
  SNORKYEval.applyActivityTimeGate("추천", sunTimes, "2026-08-19T19:00:00+09:00") === "해질녘 비추천",
  "일몰 20분 전 → 해질녘 비추천"
);
assert(
  SNORKYEval.applyActivityTimeGate("추천", sunTimes, "2026-08-19T20:00:00+09:00") === "야간 비추천",
  "일몰 후 → 야간 비추천"
);
// 야간에도 Final 95점이라도 야간 비추천 (§12 예시)
assert(
  SNORKYEval.applyActivityTimeGate("추천", sunTimes, "2026-08-19T21:00:00+09:00") === "야간 비추천",
  "V1.2 §12 예시: Final 95점이라도 야간 → 야간 비추천"
);

// ══════════════════════════════════════════════════════════════════
// §17.4  공통 결과 객체 전체 파이프라인
// ══════════════════════════════════════════════════════════════════
console.log("\n── §17.4 공통 결과 객체 (전체 파이프라인) ──");

// 시나리오 1: 이상적인 조건 — 추천
{
  const row = {
    wave_height: 0.20, wave_period: 7, swell_height: 0.10,
    current_speed: 0.10, wind_speed: 2, wind_direction_degree: 180,
    precipitation: 0, temperature: 26, sea_temperature: 25, cloud_cover: 20,
  };
  const result = SNORKYEval.evaluate(row, { environment: { terrain: "rock", exposure: "medium", breakwaterShelter: "medium", eastWindSensitivity: "medium" } }, {
    safety: { status: "PASS", warning: null },
    sunTimes,
    evaluatedAt: "2026-08-19T11:00:00+09:00",
  });
  console.log(`  [시나리오1] 이상적 조건 → Score=${result.conditionScore}, Rec=${result.recommendation}, VisGrade=${result.visibilityGrade}`);
  assert(result.safety === "PASS", "Sc1: Safety=PASS");
  assert(result.recommendation === "추천", `Sc1: Recommendation=추천 (got ${result.recommendation})`);
  assert(result.conditionScore >= 80, `Sc1: Score≥80 (got ${result.conditionScore})`);
  assert(result.visibilityGrade === "좋음" || result.visibilityGrade === "양호", `Sc1: VisGrade 좋음|양호 (got ${result.visibilityGrade})`);
  assert(typeof result.visibilityExplanation === "string", "Sc1: explanation exists");
  assert(typeof result.evaluatedAt === "string", "Sc1: evaluatedAt exists");
  assert(result.metrics !== null, "Sc1: metrics exists");
}

// 시나리오 2: BLOCK (KMA 특보)
{
  const row = { wave_height: 0.30, current_speed: 0.15, wind_speed: 4 };
  const result = SNORKYEval.evaluate(row, {}, {
    safety: { status: "BLOCK", warning: { areaName: "동해중부앞바다", warningName: "풍랑주의보", levelName: "" } },
    evaluatedAt: "2026-08-19T11:00:00+09:00",
  });
  assert(result.safety === "BLOCK", "Sc2: BLOCK");
  assert(result.conditionScore === null, "Sc2: Score=null (숨김)");
  assert(result.visibilityScore === null, "Sc2: VisScore=null (숨김)");
  assert(result.safetyReasons.length > 0, "Sc2: safetyReasons 있음");
  console.log(`  [시나리오2] BLOCK → safetyReason: ${result.safetyReasons[0]}`);
}

// 시나리오 3: 파고 0.80m Hard Safety
{
  const row = { wave_height: 0.80, current_speed: 0.20, wind_speed: 7 };
  const result = SNORKYEval.evaluate(row, {}, { safety: { status: "PASS" }, evaluatedAt: "2026-08-19T11:00:00+09:00" });
  assert(result.safety === "BLOCK", `Sc3: 파고0.80m → BLOCK (got ${result.safety})`);
  assert(result.conditionScore === null, "Sc3: Score=null");
}

// 시나리오 4: Data Quality 부족 (wave_height 없음)
{
  const row = { current_speed: 0.10, wind_speed: 3 };
  const result = SNORKYEval.evaluate(row, {}, {});
  assert(result.safety === "UNKNOWN", `Sc4: wave_height 없음 → UNKNOWN (got ${result.safety})`);
  assert(result.conditionScore === null, "Sc4: Score=null");
}

// 시나리오 5: 야간 (일몰 후) — Final 95점도 야간 비추천
{
  const row = {
    wave_height: 0.10, current_speed: 0.05, wind_speed: 1,
    precipitation: 0, temperature: 24, sea_temperature: 26, cloud_cover: 0,
  };
  const result = SNORKYEval.evaluate(row, {}, {
    safety: { status: "PASS" },
    sunTimes,
    evaluatedAt: "2026-08-19T21:00:00+09:00",
  });
  assert(result.recommendation === "야간 비추천", `Sc5: 야간 → 야간비추천 (got ${result.recommendation})`);
  assert(result.conditionScore !== null, "Sc5: conditionScore는 숨기지 않음 (야간은 BLOCK 아님)");
}

// 시나리오 6: Visibility B — 48h 이력 vs 이력 없음 차이
{
  const rowNow = { wave_height: 0.15, wave_period: 6, precipitation: 0, current_speed: 0.10, wind_speed: 2 };
  const histHighWave = [
    { hoursAgo: 6,  wave_height: 0.75, wave_period: 9, precipitation: 0 },
    { hoursAgo: 12, wave_height: 0.60, wave_period: 8, precipitation: 3 },
  ];
  const noHist = SNORKYEval.evaluate(rowNow, {}, { safety: { status: "PASS" }, evaluatedAt: "2026-08-19T11:00:00+09:00" });
  const withHist = SNORKYEval.evaluate(rowNow, {}, { safety: { status: "PASS" }, waveHistory: histHighWave, evaluatedAt: "2026-08-19T11:00:00+09:00" });
  console.log(`  [시나리오6] 이력 없음 Score=${noHist.conditionScore} / 48h 고파도 이력 Score=${withHist.conditionScore}`);
  assert(withHist.conditionScore <= noHist.conditionScore, "Sc6: 48h 이력 → 점수 낮거나 같음");
  assert(withHist.visibilityScore < noHist.visibilityScore, `Sc6: 48h 이력 → Visibility 점수 낮음 (${withHist.visibilityScore} < ${noHist.visibilityScore})`);
}

// ══════════════════════════════════════════════════════════════════
// 기존 알고리즘과 V1.2 결과 비교 (3개 포인트 시나리오)
// ══════════════════════════════════════════════════════════════════
console.log("\n── 기존 vs V1.2 비교 (연결 없음 — 진단 전용) ──");

// 기존 알고리즘 간략 구현 (index.html 의 calculateSnorkelingScore 참조)
function legacyWaveScore(v) {
  if (!Number.isFinite(v)) return null;
  if (v <= 0.3) return 100; if (v <= 0.5) return 82; if (v <= 0.8) return 48; if (v <= 1.0) return 25; return 0;
}
function legacyCurrentScore(v) {
  if (!Number.isFinite(v)) return null;
  if (v <= 0.15) return 100; if (v <= 0.3) return 82; if (v <= 0.5) return 48; if (v <= 0.7) return 25; return 0;
}
function legacyWindScore(v) {
  if (!Number.isFinite(v)) return null;
  if (v <= 2) return 100; if (v <= 4) return 82; if (v <= 6) return 48; if (v <= 8) return 25; return 0;
}
function legacyScore(row) {
  const items = [[legacyWaveScore(row.wave_height), 22], [legacyCurrentScore(row.current_speed), 18], [legacyWindScore(row.wind_speed), 12]];
  let weighted = 0, total = 0;
  items.forEach(([s, w]) => { if (Number.isFinite(s)) { weighted += s * w; total += w; } });
  return total ? Math.round(weighted / total) : 0;
}

const compareScenarios = [
  { label: "잔잔 (이상적)", row: { wave_height: 0.15, current_speed: 0.10, wind_speed: 2, precipitation: 0, temperature: 26, sea_temperature: 25, cloud_cover: 10 } },
  { label: "주의 경계",     row: { wave_height: 0.40, current_speed: 0.25, wind_speed: 6, precipitation: 0, temperature: 22, sea_temperature: 22, cloud_cover: 40 } },
  { label: "비추천",        row: { wave_height: 0.60, current_speed: 0.35, wind_speed: 8, precipitation: 1, temperature: 18, sea_temperature: 18, cloud_cover: 80 } },
];

console.log(`\n  ${"시나리오".padEnd(14)} ${"레거시".padEnd(10)} ${"V1.2 Final".padEnd(12)} ${"Rec".padEnd(10)} ${"VisGrade"}`);
console.log("  " + "─".repeat(64));
compareScenarios.forEach(({ label, row }) => {
  const legacy = legacyScore(row);
  const v12 = SNORKYEval.evaluate(row, {}, { safety: { status: "PASS" }, evaluatedAt: "2026-08-19T11:00:00+09:00" });
  const vFinal = v12.conditionScore ?? "--";
  console.log(`  ${label.padEnd(14)} ${String(legacy).padEnd(10)} ${String(vFinal).padEnd(12)} ${v12.recommendation.padEnd(10)} ${v12.visibilityGrade}`);
});

// ══════════════════════════════════════════════════════════════════
// 결과 요약
// ══════════════════════════════════════════════════════════════════
console.log("\n══════════════════════════════════════");
console.log(`  테스트 결과: ✅ PASS ${pass}  /  ❌ FAIL ${fail}`);
console.log("══════════════════════════════════════\n");
if (fail > 0) process.exit(1);
