import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const ENDPOINT = "https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst",
      ISSUES = [2, 5, 8, 11, 14, 17, 20, 23],
      TIMEOUT = 12000,
      CACHE_STALE_MINUTES = 360;

function toKmaGrid(latitude: number, longitude: number) {
  const RE = 6371.00877, GRID = 5, SLAT1 = 30, SLAT2 = 60, OLON = 126, OLAT = 38, XO = 43, YO = 136, D = Math.PI / 180;
  const re = RE / GRID, s1 = SLAT1 * D, s2 = SLAT2 * D, o = OLON * D, ol = OLAT * D;
  let sn = Math.log(Math.cos(s1) / Math.cos(s2)) / Math.log(Math.tan(Math.PI * .25 + s2 * .5) / Math.tan(Math.PI * .25 + s1 * .5)),
      sf = Math.pow(Math.tan(Math.PI * .25 + s1 * .5), sn) * Math.cos(s1) / sn,
      ro = re * sf / Math.pow(Math.tan(Math.PI * .25 + ol * .5), sn),
      ra = re * sf / Math.pow(Math.tan(Math.PI * .25 + latitude * D * .5), sn),
      theta = longitude * D - o;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return { nx: Math.floor(ra * Math.sin(theta) + XO + .5), ny: Math.floor(ro - ra * Math.cos(theta) + YO + .5) };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const finite = (value: unknown) =>
  value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;

function getBase() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts().map(x => [x.type, x.value]));
  const mins = +p.hour * 60 + +p.minute - 10;
  let date = new Date(Date.UTC(+p.year, +p.month - 1, +p.day)),
      hour = ISSUES.filter(h => h * 60 <= mins).at(-1);
  if (hour === undefined) {
    date = new Date(date.getTime() - 86400000);
    hour = 23;
  }
  return {
    baseDate: `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`,
    baseTime: `${String(hour).padStart(2, "0")}00`
  };
}

function normalizeKma(items: any[]) {
  const h = new Map(), d = new Map();
  for (const x of items) {
    const day = String(x.fcstDate || ""),
          time = String(x.fcstTime || "").padStart(4, "0"),
          dt = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:00+09:00`;
    if (x.category === "TMX" || x.category === "TMN") {
      if (!d.has(day)) d.set(day, { date: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`, tempMax: null, tempMin: null });
      d.get(day)[x.category === "TMX" ? "tempMax" : "tempMin"] = finite(x.fcstValue);
      continue;
    }
    if (!h.has(dt)) h.set(dt, { datetime: dt, temperature: null, humidity: null, windSpeed: null, windDirection: null, precipitation: null, precipitationProbability: null, sky: null, precipitationType: null });
    const r = h.get(dt), v = x.fcstValue;
    if (x.category === "TMP") r.temperature = finite(v);
    else if (x.category === "REH") r.humidity = finite(v);
    else if (x.category === "WSD") r.windSpeed = finite(v);
    else if (x.category === "VEC") r.windDirection = finite(v);
    else if (x.category === "POP") r.precipitationProbability = finite(v);
    else if (x.category === "PCP") {
      const num = finite(v);
      const rawStr = String(v).trim();
      const mmVal = num !== null ? num : (rawStr === "강수없음" || rawStr === "0" || rawStr === "0.0" ? 0 : null);
      r.precipitation = { raw: rawStr, mm: mmVal };
    }
    else if (x.category === "SKY") r.sky = { code: finite(v) };
    else if (x.category === "PTY") r.precipitationType = { code: finite(v) };
  }
  return {
    hourly: [...h.values()].sort((a, b) => a.datetime.localeCompare(b.datetime)),
    daily: [...d.values()].sort((a, b) => a.date.localeCompare(b.date))
  };
}

async function fetchKmaOnDemand(client: SupabaseClient, nx: number, ny: number, gridKey: string) {
  const apiKey = Deno.env.get("KMA_API_KEY");
  if (!apiKey) return null;
  const b = getBase();
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const u = new URL(ENDPOINT);
    for (const [k, v] of Object.entries({ pageNo: 1, numOfRows: 1100, dataType: "JSON", base_date: b.baseDate, base_time: b.baseTime, nx, ny, authKey: apiKey })) {
      u.searchParams.set(k, String(v));
    }
    const r = await fetch(u, { signal: ctl.signal });
    if (!r.ok) return null;
    const text = await r.text();
    let p: any;
    try { p = JSON.parse(text); } catch { return null; }
    const items = p?.response?.body?.items?.item;
    if (String(p?.response?.header?.resultCode) !== "00" || !Array.isArray(items) || !items.length) return null;
    const forecastData = normalizeKma(items),
          now = new Date().toISOString(),
          source = `${b.baseDate.slice(0, 4)}-${b.baseDate.slice(4, 6)}-${b.baseDate.slice(6, 8)}T${b.baseTime.slice(0, 2)}:00:00+09:00`;
    const record = {
      grid_key: gridKey,
      nx,
      ny,
      base_date: b.baseDate,
      base_time: b.baseTime,
      forecast_data: { ...forecastData, rawMeta: { itemCount: items.length, receivedBytes: new TextEncoder().encode(text).length } },
      source_issued_at: source,
      fetched_at: now,
      last_successful_at: now,
      updated_at: now,
      status: "fresh",
      stale: false,
      http_status: r.status,
      response_bytes: new TextEncoder().encode(text).length,
      item_count: items.length
    };
    await client.from("kma_weather_cache").upsert(record, { onConflict: "grid_key,base_date,base_time" });
    return record;
  } catch (_e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "GET" && request.method !== "POST") return json({ status: "ERROR", code: "METHOD_NOT_ALLOWED", forecastData: null }, 200);
  try {
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("server configuration unavailable");
    let input: Record<string, unknown> = {};
    if (request.method === "POST") {
      try { input = await request.json(); } catch { input = {}; }
    } else input = Object.fromEntries(new URL(request.url).searchParams);
    let nx = finite(input.nx), ny = finite(input.ny);
    const latitude = finite(input.latitude), longitude = finite(input.longitude);
    if ((nx === null || ny === null) && latitude !== null && longitude !== null) ({ nx, ny } = toKmaGrid(latitude, longitude));
    if (nx === null || ny === null || !Number.isInteger(nx) || !Number.isInteger(ny) || nx < 1 || nx > 149 || ny < 1 || ny > 253) return json({ status: "ERROR", code: "INVALID_GRID", forecastData: null });
    const gridKey = `${nx}:${ny}`, client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    let { data, error } = await client.from("kma_weather_cache").select("grid_key,nx,ny,base_date,base_time,forecast_data,source_issued_at,fetched_at,last_successful_at,http_status,status").eq("grid_key", gridKey).eq("status", "fresh").order("fetched_at", { ascending: false }).order("base_date", { ascending: false }).order("base_time", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) {
      const fetched = await fetchKmaOnDemand(client, nx, ny, gridKey);
      if (fetched) data = fetched as any;
      else return json({ status: "EMPTY", gridKey, nx, ny, forecastData: null, stale: false });
    }
    const ageMinutes = Math.max(0, (Date.now() - new Date(data.fetched_at).getTime()) / 60000),
          stale = !Number.isFinite(ageMinutes) || ageMinutes > CACHE_STALE_MINUTES,
          forecastData = data.forecast_data;
    if (!forecastData || !Array.isArray(forecastData.hourly) || !Array.isArray(forecastData.daily)) return json({ status: "ERROR", code: "MALFORMED_CACHE", gridKey, nx, ny, forecastData: null, stale: true });
    return json({ status: "READY", gridKey: data.grid_key, nx: data.nx, ny: data.ny, baseDate: data.base_date, baseTime: data.base_time, sourceIssuedAt: data.source_issued_at, fetchedAt: data.fetched_at, lastSuccessfulAt: data.last_successful_at || data.fetched_at, httpStatus: data.http_status, cacheStatus: data.status, forecastData, ageMinutes: Math.round(ageMinutes * 10) / 10, stale });
  } catch (error) {
    console.error("[KMA WEATHER CACHE READ]", { message: error instanceof Error ? error.message : "unknown" });
    return json({ status: "ERROR", code: "CACHE_READ_FAILED", forecastData: null, stale: true });
  }
});
