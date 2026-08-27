import http from 'http';

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
  const key = process.env.KMA_API_KEY || "nQHxdmNDRKWB8XZjQ8SlVg";
  console.log("=== 기상청 wrn_now_data.php 직접 호출 테스트 ===");
  console.log("KMA_API_KEY 존재 여부:", !!key, "(Key 길이:", key?.length, ")");

  const tm = kstTimestamp();
  const u = new URL(KMA_ENDPOINT);
  u.searchParams.set("fe", "f");
  u.searchParams.set("tm", tm);
  u.searchParams.set("disp", "0");
  u.searchParams.set("help", "1");
  u.searchParams.set("authKey", key);

  console.log(`요청 URL: https://apihub.kma.go.kr/api/typ01/url/wrn_now_data.php?fe=f&tm=${tm}&disp=0&help=1&authKey=[REDACTED]`);
  
  const startTime = Date.now();
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000); // 20초 타임아웃
    const res = await fetch(u, { signal: ctl.signal });
    clearTimeout(timer);
    const elapsed = Date.now() - startTime;
    console.log(`\n• HTTP Status: ${res.status} ${res.statusText} (${elapsed}ms 소요)`);
    console.log(`• Content-Type: ${res.headers.get("content-type")}`);
    
    const bytes = await res.arrayBuffer();
    const text = new TextDecoder("euc-kr").decode(bytes);
    console.log(`• 응답 바이트 수: ${bytes.byteLength}`);
    console.log(`\n--- 원문 응답 첫 1000자 ---`);
    console.log(text.slice(0, 1000));
    console.log(`--- 원문 응답 끝 ---`);

    // Parse lines
    const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith("#"));
    console.log(`\n• 유효 데이터 라인 수: ${lines.length}`);
    if (lines.length > 0) {
      console.log("• 데이터 샘플 (최대 5줄):");
      lines.slice(0, 5).forEach((l, i) => console.log(`  [${i+1}] ${l}`));
    }
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`\n호출 실패 (${elapsed}ms):`, err.name, err.message);
  }
}

main().catch(console.error);
