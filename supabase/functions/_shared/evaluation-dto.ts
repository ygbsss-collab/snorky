import type { SnorkyPoint } from "./kma-grid.ts";

/**
 * Source Issue Time DTO
 * (원천 데이터 소스별 실제 사용 시각 구조)
 */
export interface SourceIssueTimeDTO {
  marine_issued_at?: string | null;          // Open-Meteo 실제 사용 모델 발행/캐시 시각 (없을 시 "[확인 필요]")
  kma_base_time?: string | null;             // KMA 단기 예보 발표 시각 (예: 20260825_1100)
  kma_safety_fetched_at?: string | null;    // KMA 해상특보 조회/발효 시각
  rn1_observed_at?: string | null;          // KMA 실황 강수 관측 시각
  mid_land_base_time?: string | null;       // KMA 중기 육상 발표 시각 (06:00 / 18:00)
  mid_temp_base_time?: string | null;       // KMA 중기 기온 발표 시각
  kasi_sun_times_date?: string | null;      // KASI 일출·일몰 기준일 (YYYY-MM-DD)
  kasi_sun_times_fetched_at?: string | null; // KASI 조회/발행 시각
}

/**
 * KASI SunTimes Input Interface
 * (KASI 한국천문연구원 일출·일몰 원천 분리 인터페이스)
 */
export interface KasiSunTimesInput {
  date: string;
  sunrise: string | null;
  sunset: string | null;
  source: "KASI" | "CALCULATED";
}

/**
 * Marine History Item (해양 과거 48시간 파고/너울 이력 - 시야 감점 산출용)
 */
export interface MarineHistoryItem {
  hoursAgo: number;
  wave_height: number | null;
  wave_period?: number | null;
  ocean_current_velocity?: number | null;
}

/**
 * RN1 History Item (KMA 실황 강수 과거 48시간 누적 이력 - 강우 탁도 감점 산출용)
 */
export interface Rn1HistoryItem {
  hoursAgo: number;
  rn1: number | null;
  precipitation_accumulated_24h?: number | null;
}

/**
 * TODAY Evaluation Input DTO
 * (당일 1시간 슬롯 실시간 평가용)
 */
export interface TodayEvaluationInputDTO {
  mode: "TODAY";
  point: SnorkyPoint;
  target_date: string;       // YYYY-MM-DD
  forecast_time: string;     // ISO8601 (예: 2026-08-25T14:00:00+09:00)
  period_start?: string;     // ISO8601 (예: 2026-08-25T14:00:00+09:00)
  period_end?: string;       // ISO8601 (예: 2026-08-25T15:00:00+09:00)
  evaluated_at: string;      // ISO8601 (계산 시각)
  marine_hourly: {
    wave_height: number;
    wave_period?: number | null;
    ocean_current_velocity: number;
    sea_surface_temperature?: number | null;
  };
  kma_hourly: {
    temperature?: number | null;
    wind_speed?: number | null;
    wind_direction_degree?: number | null;
    precipitation?: number | null;
    precipitation_probability?: number | null;
    cloud_cover?: number | null;
    sky_code?: string | null;
    precipitation_type?: number | null;
  };
  rn1_live: {
    rn1: number | null;
    observed_at?: string;
  } | null;
  kma_warning_safety: {
    status: "PASS" | "BLOCK" | "UNKNOWN";
    active_warnings: string[];
    warning_area_code?: string | null;
  };
  sun_times: KasiSunTimesInput;
  marine_history: MarineHistoryItem[];
  rn1_history: Rn1HistoryItem[];
}

/**
 * SHORT Evaluation Input DTO
 * (+1~+3일 3시간 슬롯 단기 예보 평가용)
 * [CRITICAL] SHORT는 당일 실시간 특보(kma_warning_safety)를 혼합하지 않으며, safety_status는 'PASS'로 독립 처리된다.
 */
export interface ShortEvaluationInputDTO {
  mode: "SHORT";
  point: SnorkyPoint;
  target_date: string;       // YYYY-MM-DD (+1, +2, +3)
  slot_index: number;        // 0(06:00), 1(09:00), 2(12:00), 3(15:00), 4(18:00)
  forecast_time: string;     // ISO8601
  evaluated_at: string;      // ISO8601
  marine_slot: {
    wave_height: number;
    wave_period?: number | null;
    ocean_current_velocity: number;
    sea_surface_temperature?: number | null;
  };
  kma_slot: {
    temperature?: number | null;
    wind_speed?: number | null;
    wind_direction_degree?: number | null;
    precipitation?: number | null;
    precipitation_probability?: number | null;
    cloud_cover?: number | null;
    sky_code?: string | null;
    precipitation_type?: number | null;
  };
  sun_times: KasiSunTimesInput;
  marine_history: MarineHistoryItem[];
  rn1_history: Rn1HistoryItem[];
  safety_status: "PASS";     // 실시간 특보 혼합 금지
}

/**
 * MID Evaluation Input DTO
 * (+4~+6일 6시간 슬롯 해양 중심 평가용)
 * [CRITICAL] 강수량 배제, 자연광 감점 미적용, 해양 4종 기반 evaluateMidMarine 전용.
 */
export interface MidEvaluationInputDTO {
  mode: "MID_MARINE_ONLY";
  point: SnorkyPoint;
  target_date: string;       // YYYY-MM-DD (+4, +5, +6)
  slot_type: "AM" | "PM";    // AM(06~12), PM(12~18)
  period_start: string;      // ISO8601 (예: 2026-08-29T06:00:00+09:00)
  period_end: string;        // ISO8601 (예: 2026-08-29T12:00:00+09:00)
  evaluated_at: string;      // ISO8601
  marine_6h_series: Array<{
    timestamp: string;
    wave_height: number;
    wave_period?: number | null;
    ocean_current_velocity: number;
    sea_surface_temperature?: number | null;
  }>;
  kma_mid_land?: {
    weather?: string | null;
    precipitation_probability?: number | null;
  } | null;
  kma_mid_temp?: {
    temp_min?: number | null;
    temp_max?: number | null;
  } | null;
  sun_times: KasiSunTimesInput;
}
