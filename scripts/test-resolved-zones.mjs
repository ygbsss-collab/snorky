import { pathToFileURL } from 'url';

const zonesModule = await import(pathToFileURL('d:\\SNORK_prototype_v0.1\\public\\js\\kma-warning-zones.js').href);
const { resolveWarningAreaCode, getZoneByCode } = zonesModule.default || zonesModule;

console.log("=== kma-warning-zones.js 판정 테스트 ===");

// 1. 제주test (중문): 33.2253639899532, 126.475430198713
const jejuCode = resolveWarningAreaCode(33.2253639899532, 126.475430198713);
console.log("1. 제주test (서귀포 중문) -> resolveWarningAreaCode:", jejuCode, "| 구역:", getZoneByCode(jejuCode)?.name);

// 2. 울산 주전몽돌: 35.5651935082871, 129.456037118607
const ulsanCode = resolveWarningAreaCode(35.5651935082871, 129.456037118607);
console.log("2. 울산 주전몽돌 -> resolveWarningAreaCode:", ulsanCode, "| 구역:", getZoneByCode(ulsanCode)?.name);

// 3. 고성 문암해변: 38.303964, 128.53755
const gyeongCode = resolveWarningAreaCode(38.303964, 128.53755);
console.log("3. 고성 문암해변 -> resolveWarningAreaCode:", gyeongCode, "| 구역:", getZoneByCode(gyeongCode)?.name);

// 4. 울진 구산해수욕장: 36.753103, 129.468878
const uljinCode = resolveWarningAreaCode(36.753103, 129.468878);
console.log("4. 울진 구산해수욕장 -> resolveWarningAreaCode:", uljinCode, "| 구역:", getZoneByCode(uljinCode)?.name);

// 5. 영덕 구계항: 36.317211, 129.379594
const yeongdeokCode = resolveWarningAreaCode(36.317211, 129.379594);
console.log("5. 영덕 구계항 -> resolveWarningAreaCode:", yeongdeokCode, "| 구역:", getZoneByCode(yeongdeokCode)?.name);
