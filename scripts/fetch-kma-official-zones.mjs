const KMA_KEY = process.env.KMA_API_KEY || "nQHxdmNDRKWB8XZjQ8SlVg";

async function fetchKmaEndpoint(endpoint, params = {}) {
  const u = new URL(`https://apihub.kma.go.kr/api/typ01/url/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  u.searchParams.set("authKey", KMA_KEY);
  
  console.log(`[호출] ${endpoint}...`);
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    return { status: res.status, text };
  } catch (e) {
    return { status: 0, error: e.message };
  }
}

async function main() {
  console.log("=== 1. wrn_reg.php (특보구역 메타 API) 호출 ===");
  const regRes = await fetchKmaEndpoint("wrn_reg.php", { help: "1" });
  console.log("Status:", regRes.status);
  console.log("Response Preview:\n", regRes.text ? regRes.text.slice(0, 1500) : regRes.error);

  if (regRes.text) {
    // Parse lines starting with S or all lines
    const lines = regRes.text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"));
    console.log(`총 구역 수: ${lines.length}`);
    
    // Filter marine zones (code starting with S)
    const marineLines = lines.filter(l => l.includes("S1") || l.includes("바다") || l.includes("해상"));
    console.log(`\n=== 해상 특보구역 목록 (${marineLines.length}개) ===`);
    marineLines.forEach(l => console.log(l));

    // Specifically filter Jeju
    console.log(`\n=== 제주 관련 특보구역 ===`);
    lines.filter(l => l.includes("제주")).forEach(l => console.log(l));
  }
}

main();
