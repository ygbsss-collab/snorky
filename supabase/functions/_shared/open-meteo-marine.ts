export const MARINE_HOURLY_FIELDS = [
  "wave_height",
  "wave_period",
  "ocean_current_velocity",
  "sea_surface_temperature"
] as const;

export type MarineRow = {
  forecastAt: string;
  wave_height: number | null;
  wave_period: number | null;
  ocean_current_velocity: number | null;
  sea_surface_temperature: number | null;
};

const finite = (value: unknown) =>
  value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;

export const coordinateKey = (latitude: number, longitude: number) =>
  `${latitude.toFixed(4)}:${longitude.toFixed(4)}`;

export function marineEndpoint() {
  return (Deno.env.get("OPEN_METEO_MARINE_BASE_URL") || "https://marine-api.open-meteo.com/v1/marine").replace(/\/$/, "");
}

export function marineUrl(latitude: number | number[], longitude: number | number[]) {
  const url = new URL(marineEndpoint());
  url.searchParams.set("latitude", Array.isArray(latitude) ? latitude.join(",") : String(latitude));
  url.searchParams.set("longitude", Array.isArray(longitude) ? longitude.join(",") : String(longitude));
  url.searchParams.set("hourly", MARINE_HOURLY_FIELDS.join(","));
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("timezone", "Asia/Seoul");
  url.searchParams.set("past_days", "2");
  url.searchParams.set("forecast_days", "7");
  const key = Deno.env.get("OPEN_METEO_API_KEY");
  if (key) url.searchParams.set("apikey", key);
  return url;
}

export function normalizeMarine(payload: any): MarineRow[] {
  const hourly = payload?.hourly,
        times = Array.isArray(hourly?.time) ? hourly.time : [],
        // Open-Meteo Marine의 원천 기본 단위는 km/h다. 응답 단위 메타데이터가
        // 누락된 경우에도 SNORKY 표준 단위(m/s)로 잘못 해석하지 않도록 한다.
        currentUnit = String(payload?.hourly_units?.ocean_current_velocity || "km/h").toLowerCase(),
        currentToMs = (value: unknown) => {
          const current = finite(value);
          if (current === null) return null;
          if (currentUnit === "km/h" || currentUnit === "kmh" || currentUnit === "kph") return current / 3.6;
          if (currentUnit === "mph") return current * 0.44704;
          if (currentUnit === "kn" || currentUnit === "knots") return current * 0.514444;
          return current;
        };
  return times
    .map((forecastAt: string, index: number) => ({
      forecastAt,
      wave_height: finite(hourly.wave_height?.[index]),
      wave_period: finite(hourly.wave_period?.[index]),
      ocean_current_velocity: currentToMs(hourly.ocean_current_velocity?.[index]),
      sea_surface_temperature: finite(hourly.sea_surface_temperature?.[index])
    }))
    .filter((row: MarineRow) =>
      Object.entries(row).some(([key, value]) => key !== "forecastAt" && value !== null)
    );
}
