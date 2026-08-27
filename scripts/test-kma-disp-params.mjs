const key = process.env.KMA_API_KEY || "nQHxdmNDRKWB8XZjQ8SlVg";
const KMA_ENDPOINT = "https://apihub.kma.go.kr/api/typ01/url/wrn_now_data.php";

function kstTimestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}${value.hour}${value.minute}`;
}

async function testParam(disp, fe, help) {
  const tm = kstTimestamp();
  const u = new URL(KMA_ENDPOINT);
  if (fe) u.searchParams.set("fe", fe);
  u.searchParams.set("tm", tm);
  if (disp !== undefined) u.searchParams.set("disp", disp);
  if (help !== undefined) u.searchParams.set("help", help);
  u.searchParams.set("authKey", key);

  const res = await fetch(u);
  const bytes = await res.arrayBuffer();
  const text = new TextDecoder("euc-kr").decode(bytes);
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith("#"));
  console.log(`\n======================================================`);
  console.log(`[disp=${disp}, fe=${fe}, help=${help}] -> Status: ${res.status}, Lines: ${lines.length}`);
  if (lines.length > 0) {
    console.log("Sample 1:", lines[0]);
    console.log("Sample 2:", lines[1]);
  }
}

async function main() {
  await testParam("0", "f", "1"); // Edge function current: disp=0, fe=f, help=1
  await testParam("1", "f", "1"); // disp=1 (코드 형식?)
  await testParam("2", "f", "1"); // disp=2
  await testParam("0", "c", "1"); // fe=c
  await testParam("1", "c", "1"); // disp=1, fe=c
  await testParam(undefined, "f", "0"); // disp default
}

main().catch(console.error);
