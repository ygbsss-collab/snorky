import { pathToFileURL } from 'url';
import fs from 'fs';

const zonesModule = await import(pathToFileURL('d:\\SNORK_prototype_v0.1\\public\\js\\kma-warning-zones.js').href);
const { resolveWarningAreaCode, getZoneByCode } = zonesModule.default || zonesModule;

// Run supabase query to get all points
import { execSync } from 'child_process';

const jsonStr = execSync('npx supabase db query --linked --project-ref vqpkckonpsnzhuwuybav "SELECT p.id, p.name, p.region_id, r.name as region_name, p.lat, p.lng, p.warning_area_code as point_code, r.warning_area_code as reg_code FROM points p JOIN regions r ON p.region_id = r.id ORDER BY p.region_id, p.id;"', { encoding: 'utf-8' });

// Parse JSON from output
const cleanJson = jsonStr.substring(jsonStr.indexOf('{'), jsonStr.lastIndexOf('}') + 1);
const res = JSON.parse(cleanJson);
const rows = res.rows || [];

console.log(`=== 전체 ${rows.length}개 포인트 좌표 기반 구역 판정 vs DB 저장값 비교 ===\n`);

const diffList = [];

rows.forEach(p => {
  const resolved = resolveWarningAreaCode(Number(p.lat), Number(p.lng));
  const isMatch = (resolved === p.point_code);
  
  if (!isMatch) {
    diffList.push({
      id: p.id,
      name: p.name,
      region: p.region_name,
      dbCode: p.point_code,
      resolvedCode: resolved,
      resolvedZone: getZoneByCode(resolved)?.name
    });
  }
});

console.log(`불일치 또는 업데이트 대상 포인트: ${diffList.length}개\n`);
diffList.forEach(d => {
  console.log(`[ID ${d.id}] ${d.region} - ${d.name}`);
  console.log(`  - DB 저장값: ${d.dbCode}`);
  console.log(`  - 좌표 판정값: ${d.resolvedCode} (${d.resolvedZone || "구역 없음"})\n`);
});
