const ENDPOINT = "https://marine-api.open-meteo.com/v1/marine";
const POINT = Object.freeze({
  name: "가진해변",
  latitude: 38.373191067146,
  longitude: 128.509633744093,
});

const url = new URL(ENDPOINT);
url.search = new URLSearchParams({
  latitude: String(POINT.latitude),
  longitude: String(POINT.longitude),
  hourly: [
    "wave_height",
    "wave_direction",
    "wave_period",
    "swell_wave_height",
    "swell_wave_direction",
    "swell_wave_period",
    "ocean_current_velocity",
    "ocean_current_direction",
    "sea_surface_temperature",
  ].join(","),
  velocity_unit: "ms",
  timezone: "Asia/Seoul",
  forecast_days: "7",
}).toString();

const result = {
  endpoint: ENDPOINT,
  point: POINT.name,
  requestUrl: url.toString(),
  stage: "request",
  httpStatus: null,
  statusText: null,
  contentType: null,
  retryAfter: null,
  bodyPreview: null,
  jsonParseSucceeded: false,
  error: null,
};

try {
  // This is the only network call in this script. Do not add retry logic.
  const response = await fetch(url, { method: "GET" });

  // Preserve response metadata before reading or parsing the body.
  result.httpStatus = response.status;
  result.statusText = response.statusText || "";
  result.stage = "headers";

  try {
    result.contentType = response.headers.get("content-type");
  } catch (error) {
    result.headerError = error instanceof Error ? error.message : String(error);
  }

  try {
    result.retryAfter = response.headers.get("retry-after");
  } catch (error) {
    result.headerError = [
      result.headerError,
      error instanceof Error ? error.message : String(error),
    ].filter(Boolean).join("; ");
  }

  result.stage = "body";
  let body = "";
  try {
    body = await response.text();
    result.bodyPreview = body.slice(0, 500);
  } catch (error) {
    result.bodyError = error instanceof Error ? error.message : String(error);
  }

  result.stage = "json";
  if (body) {
    try {
      JSON.parse(body);
      result.jsonParseSucceeded = true;
    } catch (error) {
      result.jsonParseError = error instanceof Error ? error.message : String(error);
    }
  }

  result.stage = "complete";
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error);
}

console.log(JSON.stringify(result, null, 2));
