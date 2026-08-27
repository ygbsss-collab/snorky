const key = process.env.KMA_API_KEY || "nQHxdmNDRKWB8XZjQ8SlVg";

async function testUrl(path) {
  const tm = "202608271117";
  const u = `https://apihub.kma.go.kr/api/typ01/url/${path}?fe=f&tm=${tm}&disp=0&help=1&authKey=${key}`;
  try {
    const res = await fetch(u);
    const bytes = await res.arrayBuffer();
    const text = new TextDecoder("euc-kr").decode(bytes);
    const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith("#"));
    console.log(`\nPath: ${path} -> HTTP ${res.status}, Lines: ${lines.length}`);
    if (lines.length > 0) {
      console.log("Sample:", lines[0]);
    }
  } catch (e) {
    console.log(`Path: ${path} -> Error:`, e.message);
  }
}

async function main() {
  await testUrl("wrn_now_data.php");
  await testUrl("wrn_now_code.php");
  await testUrl("wrn_now_raw.php");
  await testUrl("wrn_now.php");
  await testUrl("wrn_met_data.php");
}

main().catch(console.error);
