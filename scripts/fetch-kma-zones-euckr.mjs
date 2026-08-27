const KMA_KEY = process.env.KMA_API_KEY || "nQHxdmNDRKWB8XZjQ8SlVg";

async function main() {
  const u = new URL("https://apihub.kma.go.kr/api/typ01/url/wrn_reg.php");
  u.searchParams.set("authKey", KMA_KEY);
  
  const res = await fetch(u);
  const buffer = await res.arrayBuffer();
  
  let text = new TextDecoder("euc-kr").decode(buffer);
  if (text.includes("")) {
    text = new TextDecoder("utf-8").decode(buffer);
  }

  const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"));
  
  console.log(`=== KMA 공식 특보구역 메타 파싱 결과 (총 ${lines.length}개) ===\n`);
  
  const marineList = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 6 && parts[0].startsWith("S")) {
      const code = parts[0];
      const start = parts[1];
      const end = parts[2];
      const parent = parts[4];
      const name = parts.slice(5).join(" ");
      marineList.push({ code, start, end, parent, name });
    }
  }

  console.log(`=== 해상특보구역 (${marineList.length}개) ===`);
  marineList.forEach(m => {
    console.log(`${m.code} | 상위: ${m.parent} | 기간: ${m.start}~${m.end} | 구역명: ${m.name}`);
  });
}

main().catch(console.error);
