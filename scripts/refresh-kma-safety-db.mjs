import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { parseRows, latestWarnings } = require('../api/kma-warnings.js')._test;

const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
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

function warningIndex(w) {
  const x = {};
  for (const v of w.filter(v => v.active)) {
    for (const c of new Set([v.regId, v.regUp].filter(c => /^S\d{7}$/.test(c)))) {
      (x[c] ??= []).push(v);
    }
  }
  return x;
}

async function main() {
  console.log("=== 1. 기상청 wrn_now_data.php 호출 및 파싱 ===");
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
  const warnings = latestWarnings(rawRows);
  const wIdx = warningIndex(warnings);

  console.log(`• Raw rows: ${rawRows.length}`);
  console.log(`• Normalized warnings: ${warnings.length}`);
  console.log(`• Active warnings: ${warnings.filter(w => w.active).length}`);
  console.log(`• Warning index keys:`, Object.keys(wIdx));

  const tm = rawRows.length ? rawRows.map(x => x.tmFc).sort().at(-1) : kstTimestamp();
  const source = `${tm.slice(0, 4)}-${tm.slice(4, 6)}-${tm.slice(6, 8)}T${tm.slice(8, 10)}:${tm.slice(10, 12)}:00+09:00`;
  const now = new Date().toISOString();

  console.log(`\n=== 2. DB kma_safety_cache 갱신 payload 준비 ===`);
  const cachePayload = {
    source_issued_at: source,
    fetched_at: now,
    last_successful_at: now,
    status: "fresh",
    stale: false,
    http_status: 200,
    warning_payload: { rowCount: rawRows.length },
    normalized_warnings: warnings,
    warning_index: wIdx
  };

  console.log("Payload source_issued_at:", source);
  console.log("Payload fetched_at:", now);

  // Write to DB via PostgREST
  const postRes = await fetch(`${restUrl}/kma_safety_cache`, {
    method: "POST",
    headers: {
      "apikey": publishableKey,
      "Authorization": `Bearer ${publishableKey}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates"
    },
    body: JSON.stringify(cachePayload)
  });

  console.log("DB POST status:", postRes.status, postRes.statusText);

  // Verify GET /functions/v1/kma-warnings
  console.log("\n=== 3. GET /functions/v1/kma-warnings 응답 상태 확인 ===");
  const edgeRes = await fetch("https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-warnings", {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }
  });
  const edgeJson = await edgeRes.json();
  console.log("kma-warnings status:", edgeJson.status);
  console.log("kma-warnings stale:", edgeJson.stale);
  console.log("kma-warnings warnings count:", edgeJson.warnings?.length);
  console.log("kma-warnings warningIndex count:", Object.keys(edgeJson.warningIndex || {}).length);
}

main().catch(console.error);
