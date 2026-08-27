import fs from 'fs';

// 1. Parse official KMA zones from decoded file
const kmaRaw = fs.readFileSync('d:\\SNORK_prototype_v0.1\\kma_zones_decoded.txt', 'utf-8');
const officialMap = new Map();

for (const line of kmaRaw.split(/\r?\n/)) {
  const l = line.trim();
  if (!l || l.startsWith("#") || l.startsWith("L")) continue;
  const parts = l.split(/\s+/);
  if (parts.length >= 6) {
    const code = parts[0];
    const tmEnd = parts[2];
    const parent = parts[4];
    const name = parts[5];
    // Only current active zones (tmEnd == '210012310000')
    if (tmEnd === '210012310000') {
      officialMap.set(code, { code, parent, name });
    }
  }
}

// 2. Read public/js/kma-warning-zones.js
const zonesFile = fs.readFileSync('d:\\SNORK_prototype_v0.1\\public\\js\\kma-warning-zones.js', 'utf-8');
const zoneRegex = /{\s*code:\s*["']([^"']+)["'],\s*name:\s*["']([^"']+)["']/g;
const projectZones = [];
let match;
while ((match = zoneRegex.exec(zonesFile)) !== null) {
  projectZones.push({ code: match[1], name: match[2] });
}

console.log(`=== kma-warning-zones.js 정의 구역 대조 (${projectZones.length}개) ===\n`);

const mismatches = [];
const matches = [];

for (const p of projectZones) {
  const off = officialMap.get(p.code);
  if (!off) {
    // Check if code exists in official at all
    const existsAny = [...officialMap.values()].find(o => o.name.includes(p.name) || p.name.includes(o.name));
    mismatches.push({
      projectCode: p.code,
      projectName: p.name,
      issue: "KMA 공식 구역코드에 존재하지 않음 (오류 코드)",
      suggestedOfficial: existsAny ? `${existsAny.code} (${existsAny.name})` : "확인 필요"
    });
  } else {
    // Check name match
    matches.push({
      code: p.code,
      projectName: p.name,
      officialName: off.name,
      parent: off.parent
    });
  }
}

console.log("1. 정상 일치 구역 (" + matches.length + "개):");
matches.forEach(m => console.log(`  [OK] ${m.code}: 프로젝트 '${m.projectName}' <-> KMA 공식 '${m.officialName}' (상위: ${m.parent})`));

console.log("\n2. 불일치/오류 구역 (" + mismatches.length + "개):");
mismatches.forEach(m => console.log(`  [FAIL] ${m.projectCode} ('${m.projectName}'): ${m.issue} -> 공식 추천: ${m.suggestedOfficial}`));

// Specifically check Jeju official zones
console.log("\n=== 3. KMA 공식 제주 권역 해상특보 구역 전체 ===");
for (const [code, info] of officialMap.entries()) {
  if (info.name.includes("제주") || info.parent === "S1330000" || info.parent === "S1323000" || code.startsWith("S1323") || code.startsWith("S1324")) {
    console.log(`  KMA 공식: ${code} | 상위: ${info.parent} | 구역명: ${info.name}`);
  }
}
