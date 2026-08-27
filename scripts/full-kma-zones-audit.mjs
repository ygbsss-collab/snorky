import fs from 'fs';

// 1. Parse official KMA
const kmaRaw = fs.readFileSync('d:\\SNORK_prototype_v0.1\\kma_zones_decoded.txt', 'utf-8');
const officialActive = [];

for (const line of kmaRaw.split(/\r?\n/)) {
  const l = line.trim();
  if (!l || l.startsWith("#") || l.startsWith("L")) continue;
  const parts = l.split(/\s+/);
  if (parts.length >= 6 && parts[2] === '210012310000') {
    // Only marine forecast zones (Level 15 앞바다, Level 14 먼바다/앞바다상위, Level 3 전해상)
    officialActive.push({
      code: parts[0],
      parent: parts[4],
      level: parts[3],
      name: parts[5]
    });
  }
}

// 2. Read kma-warning-zones.js
const zonesFile = fs.readFileSync('d:\\SNORK_prototype_v0.1\\public\\js\\kma-warning-zones.js', 'utf-8');
const zoneRegex = /{\s*code:\s*["']([^"']+)["'],\s*name:\s*["']([^"']+)["']/g;
const projectZones = [];
let match;
while ((match = zoneRegex.exec(zonesFile)) !== null) {
  projectZones.push({ code: match[1], name: match[2] });
}

console.log("================================================================================");
console.log("1. KMA 공식 전체 앞바다(연안) 구역 목록 (Level 15 - REG_SP 00000015)");
console.log("================================================================================");
const officialLevel15 = officialActive.filter(z => z.level === '00000015');
officialLevel15.forEach(z => {
  console.log(`[공식 앞바다] 코드: ${z.code} | 상위: ${z.parent} | 구역명: ${z.name}`);
});

console.log("\n================================================================================");
console.log("2. kma-warning-zones.js 정의 24개 구역 전수 감사 및 공식 코드 대조");
console.log("================================================================================");

projectZones.forEach((pz, idx) => {
  const exact = officialActive.find(o => o.code === pz.code);
  let status = "[정상]";
  let correctCode = pz.code;
  let correctName = exact ? exact.name : "";

  if (!exact) {
    status = "[치명적 오류: 가상/잘못된 코드]";
    // Find matching official zone by name keywords
    let matched = null;
    if (pz.name.includes("제주도북부")) matched = officialActive.find(o => o.code === "S1323100");
    else if (pz.name.includes("제주도동부")) matched = officialActive.find(o => o.code === "S1323200");
    else if (pz.name.includes("제주도남부")) matched = officialActive.find(o => o.code === "S1323300");
    else if (pz.name.includes("제주도서부")) matched = officialActive.find(o => o.code === "S1323400");
    else if (pz.name.includes("부산앞바다")) matched = officialActive.find(o => o.code === "S1311100");
    else if (pz.name.includes("경남서부남해")) matched = officialActive.find(o => o.code === "S1311200");
    else if (pz.name.includes("경남중부남해")) matched = officialActive.find(o => o.code === "S1311300");
    else if (pz.name.includes("거제시동부")) matched = officialActive.find(o => o.code === "S1311400");
    else if (pz.name.includes("전남서부남해")) matched = officialActive.find(o => o.code === "S1321100");
    else if (pz.name.includes("전남동부남해")) matched = officialActive.find(o => o.code === "S1321200");
    else if (pz.name.includes("인천·경기북부") || pz.name.includes("인천경기북부")) matched = officialActive.find(o => o.code === "S1251100");
    else if (pz.name.includes("인천·경기남부") || pz.name.includes("인천경기남부") || pz.name.includes("인천·경기앞바다")) matched = officialActive.find(o => o.code === "S1251200");
    else if (pz.name.includes("충남북부")) matched = officialActive.find(o => o.code === "S1251300");
    else if (pz.name.includes("충남남부")) matched = officialActive.find(o => o.code === "S1251400");
    else if (pz.name.includes("전북북부")) matched = officialActive.find(o => o.code === "S1231100");
    else if (pz.name.includes("전북남부")) matched = officialActive.find(o => o.code === "S1231200");
    else if (pz.name.includes("전남북부서해")) matched = officialActive.find(o => o.code === "S1231300");
    else if (pz.name.includes("전남중부서해")) matched = officialActive.find(o => o.code === "S1231400");
    else if (pz.name.includes("전남남부서해")) matched = officialActive.find(o => o.code === "S1231500");
    else if (pz.name.includes("서해5도")) matched = { code: "S1251100/L1014000", name: "인천·경기북부앞바다 또는 서해5도(육상)" };
    else if (pz.name.includes("울릉도")) matched = { code: "S1130000/L1600000", name: "동해남부전해상 또는 울릉도.독도(육상)" };

    correctCode = matched ? matched.code : "미확인";
    correctName = matched ? matched.name : "미확인";
  } else {
    // Check if the name in the project matches the official name
    if (pz.name.includes("경북북부") && exact.name.includes("울산")) {
      status = "[명칭-코드 엇갈림 오류: S1131100은 경북북부가 아니라 울산앞바다임]";
      correctCode = "S1131300";
      correctName = "경북북부앞바다";
    } else if (pz.name.includes("경북남부") && exact.name.includes("경북북부")) {
      status = "[명칭-코드 엇갈림 오류: S1131300은 경북남부가 아니라 경북북부앞바다임]";
      correctCode = "S1131200";
      correctName = "경북남부앞바다";
    } else if (pz.name.includes("울산") && exact.name.includes("경북남부")) {
      status = "[명칭-코드 엇갈림 오류: S1131200은 울산이 아니라 경북남부앞바다임]";
      correctCode = "S1131100";
      correctName = "울산앞바다";
    }
  }

  console.log(`[${idx+1}] ${status}`);
  console.log(`    - 현재 파일: 코드 '${pz.code}' | 구역명 '${pz.name}'`);
  console.log(`    - KMA 공식: 올바른 코드 '${correctCode}' | 공식 구역명 '${correctName}'`);
});
