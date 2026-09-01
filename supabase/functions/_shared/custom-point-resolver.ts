/**
 * custom-point-resolver.ts
 *
 * 나만의 포인트용 지역 코드 해석 유틸리티.
 *
 * 책임:
 *   - 카카오 역지오코딩 응답의 region_2depth_name 정규화
 *   - 기존 공식 확정 S코드 (해상 특보구역) 조회 — 5개 region만 지원
 *   - 기존 공식 확정 L코드 (육상 특보구역) 조회 — 12개 region 지원
 *   - 매핑 실패 시 null 반환 → Safety UNKNOWN
 *
 * 제약:
 *   - 신규 외부 API 호출 없음
 *   - bounding box / 추정 매핑 없음
 *   - 기존 kma_safety_cache는 evaluation-orchestrator가 직접 재사용
 *
 * S코드 출처:
 *   KMA 날씨누리 warning-area GeoJSON
 *   https://www.weather.go.kr/wgis-nuri/js/info/wrnArea.geojson
 *   (dataset: 260601_wrnArea, 마이그레이션 20260814053000 공식 확정값)
 *
 * L코드 출처:
 *   KMA 날씨누리 wrnArea GeoJSON 기반
 *   (마이그레이션 20260831110000 공식 확정값)
 */

export interface RegionRecord {
  id: number | string;
  name: string;
  warning_area_code?: string | null;
  land_warning_area_code?: string | null;
}

// ─────────────────────────────────────────────────────────────
// 1. 시군구명 정규화
//    카카오 역지오코딩 region_2depth_name: "강릉시" → "강릉"
// ─────────────────────────────────────────────────────────────

const METRO_DISTRICT_MAP: Readonly<Record<string, string>> = {
  // 부산 구·군
  "해운대": "부산", "기장": "부산", "수영": "부산", "영도": "부산", "사하": "부산",
  "강서": "부산", "부산진": "부산", "동래": "부산", "금정": "부산", "사상": "부산", "연제": "부산",
  // 울산 구·군
  "울주": "울산",
  // 인천 구·군 (강화, 옹진은 개별 region 지원)
  "연수": "인천", "미추홀": "인천", "남동": "인천", "부평": "인천", "계양": "인천",
  // 창원 구
  "마산합포": "창원", "마산회원": "창원", "성산": "창원", "의창": "창원", "진해": "창원", "마산": "창원",
  // 포항 구
  "포항북": "포항", "포항남": "포항",
};

/**
 * 카카오 역지오코딩 region_2depth_name에서 행정구역 접미사를 제거하여
 * 기존 SNORKY region명 형식("강릉", "고성", "부산" 등)으로 정규화한다.
 *
 * 처리 순서:
 *   1. 공백 분리 후 첫 번째 토큰 사용 (예: "포항시 북구" → "포항시")
 *   2. 광역시·특별시·특별자치시·자치시·특별자치도·도 → 끝에서 제거 (예: "울산광역시" → "울산")
 *   3. 시·군·구 → 끝에서 제거 (예: "강릉시" → "강릉", "해운대구" → "해운대")
 *   4. 광역시 산하 구/군 매핑 (예: "해운대" → "부산", "기장" → "부산")
 */
export function normalizeRegionName(raw: string): string {
  const parts = String(raw || "").trim().split(/\s+/);
  const first = parts[0]
    .replace(/광역시$|특별시$|특별자치시$|자치시$|특별자치도$|도$/, "")
    .replace(/[시군구]$/, "");

  if (METRO_DISTRICT_MAP[first]) {
    return METRO_DISTRICT_MAP[first];
  }

  // "포항시 북구"처럼 2번째 토큰이 있을 경우
  if (parts.length > 1) {
    const combined = `${first}${parts[1].replace(/[시군구]$/, "")}`;
    if (METRO_DISTRICT_MAP[combined]) {
      return METRO_DISTRICT_MAP[combined];
    }
  }

  return first;
}

// ─────────────────────────────────────────────────────────────
// 2. DB regions 매칭 로직
// ─────────────────────────────────────────────────────────────

/**
 * 카카오 시군구명(region_2depth_name)을 기존 regions 테이블 레코드와 매칭한다.
 * 매칭 순서:
 *   1. 정규화 이름 정확 일치 (예: '강릉' === '강릉', '울진' === '울진', '제주' === '제주', '부산' === '부산')
 *   2. 도서/특수 지역 별칭 일치 ('울릉' <-> '울릉도', '서귀포' <-> '제주')
 *   3. 접두/포함 매칭 (예: '남해군' <-> '남해')
 */
export function matchRegion(
  kakaoRegion2DepthName: string,
  regions: RegionRecord[]
): RegionRecord | null {
  if (!kakaoRegion2DepthName || !Array.isArray(regions) || regions.length === 0) return null;
  const normalized = normalizeRegionName(kakaoRegion2DepthName);
  if (!normalized) return null;

  // 1. 정확히 정규화된 이름 일치
  let matched = regions.find(r => normalizeRegionName(r.name) === normalized);
  if (matched) return matched;

  // 2. 도서/특수 지역 별칭 일치
  if (normalized === "울릉" || normalized === "울릉도") {
    matched = regions.find(r => r.name === "울릉도" || r.name === "울릉" || normalizeRegionName(r.name) === "울릉");
    if (matched) return matched;
  }
  if (normalized === "서귀포" || normalized === "제주") {
    matched = regions.find(r => r.name === "제주");
    if (matched) return matched;
  }

  // 3. 접두/포함 매칭
  matched = regions.find(r => {
    const regNorm = normalizeRegionName(r.name);
    return Boolean(regNorm) && (normalized.startsWith(regNorm) || regNorm.startsWith(normalized));
  });
  if (matched) return matched;

  return null;
}

// ─────────────────────────────────────────────────────────────
// 3. DB regions 캐싱 로더
// ─────────────────────────────────────────────────────────────

let cachedRegions: RegionRecord[] | null = null;
let cachedRegionsAt = 0;
const REGIONS_CACHE_TTL_MS = 60_000;

export async function getOrFetchRegions(client: any): Promise<RegionRecord[]> {
  const now = Date.now();
  if (cachedRegions && now - cachedRegionsAt < REGIONS_CACHE_TTL_MS) {
    return cachedRegions;
  }
  try {
    let result = await client.from("regions").select("id, name, warning_area_code, land_warning_area_code");
    if (result?.error && `${result.error.code || ""} ${result.error.message || ""}`.includes("land_warning_area_code")) {
      result = await client.from("regions").select("id, name, warning_area_code");
    }
    if (!result?.error && Array.isArray(result?.data)) {
      cachedRegions = result.data.map((r: any) => ({
        id: r.id,
        name: r.name,
        warning_area_code: r.warning_area_code || null,
        land_warning_area_code: r.land_warning_area_code || null,
      }));
      cachedRegionsAt = now;
      return cachedRegions;
    }
  } catch (e) {
    console.warn("[custom-point-resolver] Failed to fetch regions from DB:", e);
  }
  return cachedRegions || [];
}

// ─────────────────────────────────────────────────────────────
// 4. S코드/L코드 하드코딩 Fallback 맵
//    (KMA 공식 해상 앞바다 및 육상 특보구역 전국 기준데이터)
// ─────────────────────────────────────────────────────────────

const SEA_WARNING_CODE_MAP: Readonly<Record<string, string>> = {
  // 강원
  "고성": "S1151100", // 강원북부앞바다
  "속초": "S1151100",
  "양양": "S1151100",
  "강릉": "S1151200", // 강원중부앞바다
  "동해": "S1151300", // 강원남부앞바다
  "삼척": "S1151300",
  // 경북
  "울진": "S1131300", // 경북북부앞바다
  "영덕": "S1131300",
  "포항": "S1131200", // 경북남부앞바다
  "경주": "S1131200",
  "울릉": "S1152010", // 동해중부안쪽먼바다 (울릉도/독도 공식 해상)
  "울릉도": "S1152010",
  // 부산/울산/경남
  "울산": "S1131100", // 울산앞바다
  "부산": "S1311100", // 부산앞바다
  "거제": "S1311400", // 거제시동부앞바다
  "통영": "S1311300", // 경남중부남해앞바다
  "욕지도": "S1311300",
  "창원": "S1311300",
  "남해": "S1311200", // 경남서부남해앞바다
  "남해군": "S1311200",
  "사천": "S1311200",
  "하동": "S1311200",
  // 전남
  "여수": "S1321200", // 전남동부남해앞바다
  "순천": "S1321200",
  "광양": "S1321200",
  "고흥": "S1321100", // 전남서부남해앞바다
  "완도": "S1321100",
  "장흥": "S1321100",
  "강진": "S1321100",
  "해남": "S1321100",
  "진도": "S1231500", // 전남남부서해앞바다
  "목포": "S1231500",
  "영암": "S1231500",
  "신안": "S1231400", // 전남중부서해앞바다
  "무안": "S1231400",
  "함평": "S1231400",
  "영광": "S1231300", // 전남북부서해앞바다
  // 전북
  "고창": "S1231200", // 전북남부앞바다
  "부안": "S1231200",
  "군산": "S1231100", // 전북북부앞바다
  "김제": "S1231100",
  // 충남
  "서천": "S1251400", // 충남남부앞바다
  "보령": "S1251400",
  "태안": "S1251300", // 충남북부앞바다
  "서산": "S1251300",
  "당진": "S1251300",
  // 인천/경기
  "인천": "S1251200", // 인천·경기남부앞바다
  "강화": "S1251100", // 인천·경기북부앞바다
  "옹진": "S1251100",
  "화성": "S1251200",
  "평택": "S1251200",
  "안산": "S1251200",
  "시흥": "S1251200",
  "김포": "S1251100",
  // 제주
  "제주": "S1323000", // 제주도앞바다
  "서귀포": "S1323300", // 제주도남부앞바다
};

export function getSeaWarningCode(normalizedRegion: string): string | null {
  return SEA_WARNING_CODE_MAP[normalizedRegion] ?? null;
}

const LAND_WARNING_CODE_MAP: Readonly<Record<string, string>> = {
  // 강원
  "강릉": "L1022500",
  "고성": "L1022200",
  "속초": "L1022100",
  "양양": "L1022300",
  "동해": "L1021900",
  "삼척": "L1022000",
  // 경북
  "울진": "L1073000",
  "영덕": "L1072200",
  "포항": "L1072400",
  "경주": "L1073100",
  "울릉": "L1072100",
  "울릉도": "L1072100",
  // 부산/울산/경남
  "울산": "L1160000",
  "부산": "L1150000",
  "거제": "L1082200",
  "통영": "L1082000",
  "욕지도": "L1082000",
  "창원": "L1080600",
  "남해": "L1082400",
  "남해군": "L1082400",
  "사천": "L1082100",
  // 전남
  "여수": "L1051000",
  "순천": "L1051200",
  "광양": "L1051100",
  "고흥": "L1053100",
  "완도": "L1053300",
  "진도": "L1052300",
  "해남": "L1053200",
  "목포": "L1052100",
  "신안": "L1052200",
  "무안": "L1053400",
  "영광": "L1052700",
  // 전북
  "부안": "L1061500",
  "군산": "L1061600",
  "고창": "L1060100",
  // 충남
  "서산": "L1031300",
  "태안": "L1031100",
  "보령": "L1031900",
  "서천": "L1031500",
  "당진": "L1031200",
  // 인천/경기
  "인천": "L1110000",
  "강화": "L1010900",
  "옹진": "L1013600",
  "화성": "L1013200",
  "평택": "L1012500",
  "안산": "L1010400",
  "시흥": "L1010500",
  "김포": "L1010700",
  // 제주
  "제주": "L1090000",
  "서귀포": "L1090000",
};

export function getLandWarningCode(normalizedRegion: string): string | null {
  return LAND_WARNING_CODE_MAP[normalizedRegion] ?? null;
}

// ─────────────────────────────────────────────────────────────
// 5. KMA 중기 육상/기온 공식 코드 (전국 해안 시군구)
// ─────────────────────────────────────────────────────────────

const MID_REGION_CODE_MAP: Readonly<Record<string, Readonly<{
  landRegId: string;
  tempRegId: string;
}>>> = {
  // 강원영동 (11D20000)
  "강릉": { landRegId: "11D20000", tempRegId: "11D20501" },
  "고성": { landRegId: "11D20000", tempRegId: "11D20401" },
  "속초": { landRegId: "11D20000", tempRegId: "11D20401" },
  "양양": { landRegId: "11D20000", tempRegId: "11D20401" },
  "삼척": { landRegId: "11D20000", tempRegId: "11D20601" },
  "동해": { landRegId: "11D20000", tempRegId: "11D20601" },

  // 대구/경북 (11H10000)
  "울진": { landRegId: "11H10000", tempRegId: "11H10101" },
  "영덕": { landRegId: "11H10000", tempRegId: "11H10301" },
  "포항": { landRegId: "11H10000", tempRegId: "11H10201" },
  "경주": { landRegId: "11H10000", tempRegId: "11H10202" },

  // 부산/울산/경남 (11H20000)
  "울산": { landRegId: "11H20000", tempRegId: "11H10201" },
  "부산": { landRegId: "11H20000", tempRegId: "11H20201" },
  "거제": { landRegId: "11H20000", tempRegId: "11H20403" },
  "통영": { landRegId: "11H20000", tempRegId: "11H20401" },
  "욕지도": { landRegId: "11H20000", tempRegId: "11H20401" },
  "남해": { landRegId: "11H20000", tempRegId: "11H20405" },
  "남해군": { landRegId: "11H20000", tempRegId: "11H20405" },
  "사천": { landRegId: "11H20000", tempRegId: "11H20402" },
  "창원": { landRegId: "11H20000", tempRegId: "11H20301" },

  // 광주/전남 (11F20000)
  "여수": { landRegId: "11F20000", tempRegId: "11F20401" },
  "순천": { landRegId: "11F20000", tempRegId: "11F20402" },
  "광양": { landRegId: "11F20000", tempRegId: "11F20403" },
  "고흥": { landRegId: "11F20000", tempRegId: "11F20404" },
  "완도": { landRegId: "11F20000", tempRegId: "11F20406" },
  "진도": { landRegId: "11F20000", tempRegId: "11F20502" },
  "해남": { landRegId: "11F20000", tempRegId: "11F20504" },
  "목포": { landRegId: "11F20000", tempRegId: "11F20501" },
  "신안": { landRegId: "11F20000", tempRegId: "11F20503" },
  "무안": { landRegId: "11F20000", tempRegId: "11F20501" },
  "영광": { landRegId: "11F20000", tempRegId: "11F20505" },

  // 전북자치도 (11F10000)
  "군산": { landRegId: "11F10000", tempRegId: "11F10201" },
  "부안": { landRegId: "11F10000", tempRegId: "11F10202" },
  "고창": { landRegId: "11F10000", tempRegId: "11F10203" },

  // 대전/세종/충남 (11C20000)
  "서산": { landRegId: "11C20000", tempRegId: "11C20101" },
  "태안": { landRegId: "11C20000", tempRegId: "11C20104" },
  "보령": { landRegId: "11C20000", tempRegId: "11C20102" },
  "서천": { landRegId: "11C20000", tempRegId: "11C20102" },
  "당진": { landRegId: "11C20000", tempRegId: "11C20103" },

  // 서울/인천/경기 (11B00000)
  "인천": { landRegId: "11B00000", tempRegId: "11B20201" },
  "강화": { landRegId: "11B00000", tempRegId: "11B20101" },
  "옹진": { landRegId: "11B00000", tempRegId: "11B20701" },
  "화성": { landRegId: "11B00000", tempRegId: "11B20601" },
  "평택": { landRegId: "11B00000", tempRegId: "11B20602" },
  "안산": { landRegId: "11B00000", tempRegId: "11B20603" },
  "시흥": { landRegId: "11B00000", tempRegId: "11B20603" },
  "김포": { landRegId: "11B00000", tempRegId: "11B20102" },

  // 제주도 (11G00000)
  "제주": { landRegId: "11G00000", tempRegId: "11G00201" },
  "서귀포": { landRegId: "11G00000", tempRegId: "11G00401" },

  // 울릉도/독도 (11E00000)
  "울릉": { landRegId: "11E00000", tempRegId: "11E00101" },
  "울릉도": { landRegId: "11E00000", tempRegId: "11E00101" },
};

export function getMidRegionCodes(normalizedRegion: string): {
  landRegId: string;
  tempRegId: string;
} | null {
  const codes = MID_REGION_CODE_MAP[normalizedRegion];
  return codes ? { ...codes } : null;
}

// ─────────────────────────────────────────────────────────────
// 6. 통합 조회
// ─────────────────────────────────────────────────────────────

export interface CustomPointWarningCodes {
  /** 해상 특보구역 S코드. null이면 seaCode 미지원 → Safety UNKNOWN */
  seaCode: string | null;
  /** 육상 특보구역 L코드. null이면 landCode 미지원 */
  landCode: string | null;
  /** 정규화된 region명 */
  normalizedRegion: string;
  /** 확정 KMA 중기 코드. null이면 중기 기상 API를 호출하지 않는다. */
  midCodes: { landRegId: string; tempRegId: string } | null;
  /** 매칭된 DB region id (있을 경우) */
  matchedRegionId?: number | string | null;
}

/**
 * 카카오 역지오코딩 region_2depth_name(예: "강릉시", "제주시", "여수시")을 받아
 * DB regions 레코드와 매칭하여 공식 해상·육상 특보구역 코드를 반환한다.
 *
 * DB regions 제공 시:
 *   - region 매칭 성공 시: DB의 공식 warning_area_code, land_warning_area_code 주입
 *   - region 매칭 실패 시: null 반환 → Safety UNKNOWN 처리
 *
 * DB regions 미제공 시 (fallback):
 *   - 기존 5개 하드코딩 맵 fallback 수행
 */
export function resolveWarningCodes(
  kakaoRegion2DepthName: string,
  dbRegions?: RegionRecord[] | null
): CustomPointWarningCodes {
  const normalizedRegion = normalizeRegionName(kakaoRegion2DepthName);

  if (Array.isArray(dbRegions) && dbRegions.length > 0) {
    const matched = matchRegion(kakaoRegion2DepthName, dbRegions);
    if (matched) {
      const regNorm = normalizeRegionName(matched.name);
      return {
        seaCode: matched.warning_area_code || null,
        landCode: matched.land_warning_area_code || null,
        normalizedRegion: regNorm || normalizedRegion,
        midCodes: getMidRegionCodes(regNorm) || getMidRegionCodes(normalizedRegion),
        matchedRegionId: matched.id,
      };
    }
    // DB regions가 전달되었으나 매칭 실패한 경우 → null 반환 (UNKNOWN)
    return {
      seaCode: null,
      landCode: null,
      normalizedRegion,
      midCodes: null,
    };
  }

  // DB regions 미제공 시 Fallback (기존 5개 하드코딩 맵)
  return {
    seaCode: getSeaWarningCode(normalizedRegion),
    landCode: getLandWarningCode(normalizedRegion),
    normalizedRegion,
    midCodes: getMidRegionCodes(normalizedRegion),
  };
}
