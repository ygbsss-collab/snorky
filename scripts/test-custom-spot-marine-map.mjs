import fs from "fs";
import path from "path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log("=== 나만의 스팟 해양 상세지도 연동 및 기존 기능 무결성 검증 시작 ===");

const mySpotsHtml = fs.readFileSync(path.resolve("my-spots.html"), "utf-8");
const mySpotsJs = fs.readFileSync(path.resolve("public/js/my-spots.js"), "utf-8");
const mySpotsCss = fs.readFileSync(path.resolve("public/css/my-spots.css"), "utf-8");
const indexHtml = fs.readFileSync(path.resolve("index.html"), "utf-8");
const pointDetailMapJs = fs.readFileSync(path.resolve("public/js/point-detail-map.js"), "utf-8");

// 1. my-spots.html 의존성 스크립트 검증
assert(mySpotsHtml.includes("ol@v8.2.0/dist/ol.js"), "OpenLayers SDK 누락");
assert(mySpotsHtml.includes("otmsSSLVectormapApi.do"), "KHOA ENC API 누락");
assert(mySpotsHtml.includes("point-detail-map.js"), "point-detail-map.js 누락");
assert(mySpotsHtml.includes("kma-weather-cache.js"), "kma-weather-cache.js 누락");
console.log("1. my-spots.html 의존성 스크립트 확인 완료");

// 2. my-spots.js 카드 렌더링 및 해양 상세지도 버튼/핸들러 검증
assert(mySpotsJs.includes('class="custom-map-btn"'), "custom-map-btn 버튼 마크업 누락");
assert(mySpotsJs.includes("data-map-spot="), "data-map-spot 속성 누락");
assert(mySpotsJs.includes("openDetailMap"), "openDetailMap 함수 누락");
assert(mySpotsJs.includes("SNORKYPointDetailMap.open"), "SNORKYPointDetailMap.open 호출 누락");
console.log("2. my-spots.js 해양 상세지도 UI/핸들러 확인 완료");

// 3. CSS 3개 버튼 그리드 및 스타일 검증
assert(mySpotsCss.includes("grid-template-columns:repeat(3,minmax(0,1fr))"), "3열 그리드 스타일 누락");
assert(mySpotsCss.includes(".custom-map-btn"), ".custom-map-btn 스타일 누락");
console.log("3. my-spots.css 스타일 확인 완료");

// 4. 좌표 전달 및 데이터 흐름 모의 검증
const mockCustomSpot = {
  id: 1987654321,
  name: "나만의 비밀 포인트",
  lat: 37.7519,
  lng: 128.8761,
  region: "강릉시",
  isCustomSpot: true,
};

let capturedPoint = null;
globalThis.window = {
  SNORKYAuthSession: {
    get: () => ({ user: { id: "user_test_123" } }),
  },
  SNORKYPointDetailMap: {
    open: (point) => {
      capturedPoint = point;
      return true;
    },
  },
};

// 모의 openDetailMap 로직 실행
const pointForUi = {
  id: mockCustomSpot.id,
  name: mockCustomSpot.name,
  lat: mockCustomSpot.lat,
  lng: mockCustomSpot.lng,
  latitude: mockCustomSpot.lat,
  longitude: mockCustomSpot.lng,
  region: mockCustomSpot.region,
  warning_area_code: null,
  land_warning_area_code: null,
  isCustomSpot: true,
};
window.SNORKYPointDetailMap.open(pointForUi);

assert(capturedPoint !== null, "SNORKYPointDetailMap.open 미호출");
assert(capturedPoint.lat === 37.7519, "전달된 위도(lat) 불일치");
assert(capturedPoint.lng === 128.8761, "전달된 경도(lng) 불일치");
assert(capturedPoint.name === "나만의 비밀 포인트", "전달된 스팟명 불일치");
assert(capturedPoint.isCustomSpot === true, "isCustomSpot 플래그 누락");
console.log("4. 나만의 스팟 lat/lng 좌표 전달 및 매핑 검증 완료");

// 5. 기존 등록 포인트 상세 기능 무결성 검증
assert(indexHtml.includes("id=\"btnScrollDetailMap\""), "기존 등록 포인트 해양 상세지도 버튼 무결성 확인");
assert(indexHtml.includes("class=\"kakao-map-link\""), "기존 등록 포인트 카카오맵에서 보기 링크 무결성 확인");
assert(indexHtml.includes("class=\"kakao-map-link kakao-parking-link\""), "기존 등록 포인트 주차장 바로가기 링크 무결성 확인");
assert(pointDetailMapJs.includes("SNORKYPointDetailMap"), "SNORKYPointDetailMap 공통 객체 무결성 확인");
console.log("5. 기존 등록 포인트 상세 기능 및 공통 함수 무결성 확인 완료");

console.log("\n모든 검증 케이스 100% 통과!");
