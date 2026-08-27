import fs from 'fs';

const KMA_KEY = process.env.KMA_API_KEY || "nQHxdmNDRKWB8XZjQ8SlVg";

async function main() {
  const u = new URL("https://apihub.kma.go.kr/api/typ01/url/wrn_reg.php");
  u.searchParams.set("authKey", KMA_KEY);
  
  const res = await fetch(u);
  const buf = await res.arrayBuffer();
  
  const td = new TextDecoder('euc-kr');
  const text = td.decode(buf);

  fs.writeFileSync('d:\\SNORK_prototype_v0.1\\kma_zones_decoded.txt', text, 'utf-8');
  console.log("kma_zones_decoded.txt 저장 완료! 길이:", text.length);
}

main().catch(console.error);
