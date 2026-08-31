import fs from 'fs';

// 1. Official KMA Map
const kmaRaw = fs.readFileSync('d:\\SNORK_prototype_v0.1\\kma_zones_decoded.txt', 'utf-8');
const officialMap = new Map();

for (const line of kmaRaw.split(/\r?\n/)) {
  const l = line.trim();
  if (!l || l.startsWith("#") || l.startsWith("L")) continue;
  const parts = l.split(/\s+/);
  if (parts.length >= 6 && parts[2] === '210012310000') {
    officialMap.set(parts[0], { code: parts[0], parent: parts[4], name: parts[5] });
  }
}

// 2. Fetch regions & points from Supabase REST
const SUPABASE_URL = "https://vqpkckonpsnzhuwuybav.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxcGtja29ucHNnemh1d3V5YmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1NjgwNDgsImV4cCI6MjA3MTE0NDA0OH0.eD26Wp8K3i6cZkL2sYw8eSZe9J5W3fN_6K4wYgB7V2Y";

async function main() {
  console.log("=== DB regions 및 points 테이블 warning_area_code 전수 검증 ===\n");
  
  // 1. Regions
  const regRes = await fetch(`${SUPABASE_URL}/rest/v1/regions?select=*&order=id`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  });
  const regions = await regRes.json();
  console.log("1. Regions 테이블 (" + regions.length + "개):");
  regions.forEach(r => {
    const off = officialMap.get(r.warning_area_code);
    const valid = off ? `[정상: ${off.name}]` : (r.warning_area_code ? `[오류/불일치: ${r.warning_area_code}]` : `[NULL: 구역코드 누락]`);
    console.log(`  ID ${r.id} (${r.name}): warning_area_code = ${r.warning_area_code} -> ${valid}`);
  });

  // 2. Points
  const ptsRes = await fetch(`${SUPABASE_URL}/rest/v1/points?select=id,name,region_id,lat,lng,warning_area_code&order=id`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  });
  const points = await ptsRes.json();
  console.log("\n2. Points 테이블 (" + points.length + "개 중 구역코드 현황):");
  
  const ptIssues = [];
  points.forEach(p => {
    const off = officialMap.get(p.warning_area_code);
    if (!p.warning_area_code) {
      ptIssues.push({ id: p.id, name: p.name, code: null, issue: "NULL (미입력)" });
    } else if (!off) {
      ptIssues.push({ id: p.id, name: p.name, code: p.warning_area_code, issue: "존재하지 않는 코드" });
    } else {
      // Check if region matches
      // e.g. 울진이 S1131300(경북북부앞바다)인지
    }
  });

  console.log(`  총 문제 있는 포인트: ${ptIssues.length}개`);
  ptIssues.forEach(i => console.log(`  [포인트 이슈] ID ${i.id} (${i.name}): code=${i.code} -> ${i.issue}`));

  // Check Uljin / Yeongdeok / Ulsan codes specifically
  console.log("\n3. 울진/영덕/울산 포인트 코드 매핑 상세:");
  points.filter(p => [42, 43, 26, 27, 123, 132].includes(p.id)).forEach(p => {
    const off = officialMap.get(p.warning_area_code);
    console.log(`  ID ${p.id} (${p.name}): DB code=${p.warning_area_code} -> KMA 공식 명칭: '${off?.name || "없음"}'`);
  });
}

main().catch(console.error);
