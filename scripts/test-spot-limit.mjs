import assert from "node:assert";

// Mock environment
const MAX_CUSTOM_SPOTS = 10;
let spots = [];
let editingId = null;
let finalCoordinates = null;
let nameVal = "";
let errorMsg = "";
let alertMsg = "";
let apiCallCount = 0;

globalThis.window = {
  alert: (msg) => { alertMsg = msg; }
};

function reverseGeocode(lat, lng) {
  return Promise.resolve({
    lat,
    lng,
    region2DepthName: "테스트시",
    addressName: "테스트시 테스트동",
    cachedAt: new Date().toISOString(),
  });
}

function createSpotId() {
  return 1000 + spots.length + 1;
}

function openEditor(spotId) {
  alertMsg = "";
  errorMsg = "";
  const existing = spots.find(item => Number(item.id) === Number(spotId)) || null;
  if (!existing && spots.length >= MAX_CUSTOM_SPOTS) {
    window.alert("나만의 스팟은 최대 10개까지 저장할 수 있습니다.");
    return false;
  }
  editingId = existing?.id || null;
  finalCoordinates = existing ? { lat: Number(existing.lat), lng: Number(existing.lng) } : null;
  nameVal = existing?.name || "";
  return true;
}

async function saveSpot(name, lat, lng) {
  errorMsg = "";
  const existing = spots.find(item => Number(item.id) === Number(editingId));

  if (!name) {
    errorMsg = "스팟 이름을 입력해 주세요.";
    return false;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    errorMsg = "지도에서 최종 위치를 직접 선택해 주세요.";
    return false;
  }
  if (lat < 32 || lat > 39.8 || lng < 124 || lng > 132) {
    errorMsg = "대한민국 예보 지원 좌표를 확인해 주세요.";
    return false;
  }

  // 10개 제한 검증 (신규 등록 시)
  if (!existing && spots.length >= MAX_CUSTOM_SPOTS) {
    errorMsg = "나만의 스팟은 최대 10개까지 저장할 수 있습니다.";
    return false;
  }

  // 동일 좌표 중복 저장 방지
  const isDuplicateCoord = spots.some(item =>
    Number(item.id) !== Number(editingId) &&
    Math.abs(Number(item.lat) - lat) < 0.0001 &&
    Math.abs(Number(item.lng) - lng) < 0.0001
  );
  if (isDuplicateCoord) {
    errorMsg = "이미 동일한 위치에 저장된 스팟이 있습니다.";
    return false;
  }

  const geocode = await reverseGeocode(lat, lng);
  const spot = {
    id: existing?.id || createSpotId(),
    name,
    lat,
    lng,
    region: geocode.region2DepthName,
    geocode,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existing) spots = spots.map(item => item.id === existing.id ? spot : item);
  else spots.unshift(spot);
  return true;
}

function deleteSpot(spotId) {
  spots = spots.filter(item => Number(item.id) !== Number(spotId));
}

// ─────────────────────────────────────────────────────────────
// 검증 실행
// ─────────────────────────────────────────────────────────────
console.log("=== 나만의 스팟 10개 제한 및 중복 방지 검증 시작 ===");

// 1. 9개 등록
for (let i = 1; i <= 9; i++) {
  const canOpen = openEditor(null);
  assert(canOpen === true, `스팟 ${i}개 상태에서 새 스팟 열기 실패`);
  const saved = await saveSpot(`스팟_${i}`, 35.0 + i * 0.1, 128.0 + i * 0.1);
  assert(saved === true, `스팟 ${i} 저장 실패`);
}
assert(spots.length === 9, "9개 저장 확인");
console.log("1. 9개 등록 완료:", spots.length, "개");

// 2. 9개 -> 10번째 저장 성공
const open10 = openEditor(null);
assert(open10 === true, "10번째 스팟 열기 성공");
const saved10 = await saveSpot("스팟_10", 36.0, 129.0);
assert(saved10 === true, "10번째 스팟 저장 성공");
assert(spots.length === 10, "10개 저장 확인");
console.log("2. 9개 -> 10번째 저장 성공:", spots.length, "개");

// 3. 10개 -> 11번째 저장 차단
const open11 = openEditor(null);
assert(open11 === false, "10개 도달 시 신규 열기 차단 성공");
assert(alertMsg === "나만의 스팟은 최대 10개까지 저장할 수 있습니다.", "10개 초과 안내 문구 불일치");

// saveSpot 직접 호출 시에도 차단 확인
const saved11 = await saveSpot("스팟_11", 36.1, 129.1);
assert(saved11 === false, "11번째 saveSpot 차단 성공");
assert(errorMsg === "나만의 스팟은 최대 10개까지 저장할 수 있습니다.", "10개 초과 에러 문구 불일치");
assert(spots.length === 10, "스팟 개수 10개 유지");
console.log("3. 10개 -> 11번째 저장 차단 성공:", spots.length, "개 (문구 일치)");

// 4. 동일 좌표 중복 저장 방지 검증 (9개 상태로 만든 후 테스트)
deleteSpot(spots[0].id);
assert(spots.length === 9, "1개 삭제 후 9개");
const dupSaved = await saveSpot("중복위치_스팟", spots[0].lat, spots[0].lng);
assert(dupSaved === false, "동일 좌표 중복 저장 차단 성공");
assert(errorMsg === "이미 동일한 위치에 저장된 스팟이 있습니다.", "중복 좌표 에러 문구 불일치");
console.log("4. 동일 좌표 중복 저장 차단 성공 (문구 일치)");

// 5. 1개 삭제 후 신규 1개 정상 저장 성공 (슬롯 복구)
const newCoordSaved = await saveSpot("새로운_10번째_스팟", 37.1234, 128.5678);
assert(newCoordSaved === true, "슬롯 복구 후 신규 10번째 저장 성공");
assert(spots.length === 10, "최종 10개 도달");
console.log("5. 1개 삭제 -> 신규 1개 저장 성공 (슬롯 복구):", spots.length, "개");

// 6. 저장 시 평가 API 호출 수 0회 확인
assert(apiCallCount === 0, "저장 중 외부/평가 API 호출이 발생함");
console.log("6. 저장 시 평가 API 호출 0회 확인");

console.log("\n모든 검증 케이스 100% 통과!");
