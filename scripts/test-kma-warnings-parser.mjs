import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { csvFields, parseRows, latestWarnings, toWarningName, toLevelName, isReleaseCommand } = require('../api/kma-warnings.js')._test;

const key = process.env.KMA_API_KEY || "nQHxdmNDRKWB8XZjQ8SlVg";
const KMA_ENDPOINT = "https://apihub.kma.go.kr/api/typ01/url/wrn_now_data.php";

function kstTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}${value.hour}${value.minute}`;
}

async function main() {
  console.log("=== 1. KMA API wrn_now_data.php 실호출 및 신규 파서 검증 ===");
  const u = new URL(KMA_ENDPOINT);
  u.searchParams.set("fe", "f");
  u.searchParams.set("tm", kstTimestamp());
  u.searchParams.set("disp", "0");
  u.searchParams.set("help", "1");
  u.searchParams.set("authKey", key);

  const res = await fetch(u);
  const bytes = await res.arrayBuffer();
  const text = new TextDecoder("euc-kr").decode(bytes);

  const rawRows = parseRows(text);
  console.log(`• Raw parsed rows count: ${rawRows.length}`);

  const normalized = latestWarnings(rawRows);
  console.log(`• Normalized warnings count: ${normalized.length}`);

  const activeWarnings = normalized.filter(w => w.active);
  console.log(`• Active warnings (경보/주의보) count: ${activeWarnings.length}`);

  console.log("\n=== 2. Active Warnings 목록 ===");
  activeWarnings.forEach((w, i) => {
    console.log(`  [${i+1}] regId: ${w.regId} | regUp: ${w.regUp} | area: ${w.areaName} | ${w.warningName} ${w.levelName} (${w.commandName}) | tmEf: ${w.tmEf}`);
  });

  console.log("\n=== 3. 문암해변 (S1151100 / 강원북부앞바다) 특보 상태 확인 ===");
  const munamWarning = activeWarnings.find(w => w.regId === "S1151100" || w.regUp === "S1151100");
  if (munamWarning) {
    console.log(`• 문암해변 특보 발효 중 (BLOCK): ${munamWarning.areaName} ${munamWarning.warningName}${munamWarning.levelName}`);
  } else {
    console.log(`• 문암해변 특보 없음 (PASS) - 안전 상태`);
  }

  console.log("\n=== 4. 동해중부앞바다 전체 권역 확인 ===");
  const donghaeWarnings = activeWarnings.filter(w => w.regId?.startsWith("S115") || w.regUp?.startsWith("S115"));
  console.log(`• 동해중부 구역 발효 특보 수: ${donghaeWarnings.length}`);
  donghaeWarnings.forEach(w => console.log(`  - ${w.regId} (${w.areaName}): ${w.warningName} ${w.levelName}`));
}

main().catch(console.error);
