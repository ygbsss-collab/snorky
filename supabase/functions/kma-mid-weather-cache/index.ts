import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type MidWeatherSource = "KMA_MID_LAND" | "KMA_MID_TA";

export interface KmaMidWeatherCacheRow {
  source: MidWeatherSource;
  reg_id: string;   // e.g. "11D20000" (강원영동) or "11D20501" (강릉)
  tm_fc: string;    // e.g. "202608250600" or "202608251800"
  forecast_data: Record<string, any>;
  fetched_at: string;
}

export interface MidForecastSlot {
  target_date: string; // YYYY-MM-DD
  day_offset: number;  // 4, 5, or 6
  weather_am?: string | null;
  weather_pm?: string | null;
  pop_am?: number | null;
  pop_pm?: number | null;
  temp_min?: number | null;
  temp_max?: number | null;
  source_tm_fc: string;
}

function addDaysToDateStr(baseDateStr: string, days: number): string {
  const d = new Date(`${baseDateStr}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  const kst = new Date(d.getTime() + 9 * 3600000);
  return kst.toISOString().slice(0, 10);
}

/**
 * Extracts Mid Forecast for D+4, D+5, D+6 with 18시/06시 fallback preservation.
 * [CRITICAL] 18시 자료에 +4가 없으면 같은 날 06시 성공 Cache를 보존하며 null로 +4를 덮어쓰지 않는다.
 */
export async function loadMidWeatherForPoint(
  client: SupabaseClient,
  landRegId: string,
  tempRegId: string,
  baseDateKst: string // YYYY-MM-DD (e.g. "2026-08-25")
): Promise<{
  slots: Record<string, MidForecastSlot>; // Keyed by target_date (YYYY-MM-DD)
  landTmFc: string | null;
  tempTmFc: string | null;
}> {
  const dateCompact = baseDateKst.replace(/-/g, "");
  const tmFc06 = `${dateCompact}0600`;
  const tmFc18 = `${dateCompact}1800`;

  // Query both 18h and 06h caches for land and temp in parallel
  const [land18Res, land06Res, temp18Res, temp06Res] = await Promise.all([
    client.from("kma_mid_weather_cache").select("forecast_data, tm_fc").eq("source", "KMA_MID_LAND").eq("reg_id", landRegId).eq("tm_fc", tmFc18).maybeSingle(),
    client.from("kma_mid_weather_cache").select("forecast_data, tm_fc").eq("source", "KMA_MID_LAND").eq("reg_id", landRegId).eq("tm_fc", tmFc06).maybeSingle(),
    client.from("kma_mid_weather_cache").select("forecast_data, tm_fc").eq("source", "KMA_MID_TA").eq("reg_id", tempRegId).eq("tm_fc", tmFc18).maybeSingle(),
    client.from("kma_mid_weather_cache").select("forecast_data, tm_fc").eq("source", "KMA_MID_TA").eq("reg_id", tempRegId).eq("tm_fc", tmFc06).maybeSingle(),
  ]);

  const land18 = land18Res.data?.forecast_data;
  const land06 = land06Res.data?.forecast_data;
  const temp18 = temp18Res.data?.forecast_data;
  const temp06 = temp06Res.data?.forecast_data;

  const activeLandTmFc = land18 ? tmFc18 : (land06 ? tmFc06 : null);
  const activeTempTmFc = temp18 ? tmFc18 : (temp06 ? tmFc06 : null);

  const slots: Record<string, MidForecastSlot> = {};

  // For D+4, D+5, D+6
  for (const offset of [4, 5, 6]) {
    const targetDate = addDaysToDateStr(baseDateKst, offset);

    // Weather & PoP (MID_LAND)
    let weatherAm: string | null = null;
    let weatherPm: string | null = null;
    let popAm: number | null = null;
    let popPm: number | null = null;
    let usedLandTmFc = activeLandTmFc || "";

    // If offset === 4 and 18h lacks +4 forecast, use 06h forecast
    const landData = (offset === 4 && land06 && !land18?.[`wf${offset}Am`]) ? land06 : (land18 || land06);
    if (landData) {
      weatherAm = landData[`wf${offset}Am`] ?? landData[`wf${offset}`] ?? null;
      weatherPm = landData[`wf${offset}Pm`] ?? landData[`wf${offset}`] ?? null;
      popAm = landData[`rnSt${offset}Am`] != null ? Number(landData[`rnSt${offset}Am`]) : (landData[`rnSt${offset}`] != null ? Number(landData[`rnSt${offset}`]) : null);
      popPm = landData[`rnSt${offset}Pm`] != null ? Number(landData[`rnSt${offset}Pm`]) : (landData[`rnSt${offset}`] != null ? Number(landData[`rnSt${offset}`]) : null);
      usedLandTmFc = (landData === land06) ? tmFc06 : (activeLandTmFc || tmFc06);
    }

    // Min/Max Temperature (MID_TEMP)
    let tempMin: number | null = null;
    let tempMax: number | null = null;
    const tempData = (offset === 4 && temp06 && temp18?.[`taMin${offset}`] == null) ? temp06 : (temp18 || temp06);
    if (tempData) {
      tempMin = tempData[`taMin${offset}`] != null ? Number(tempData[`taMin${offset}`]) : null;
      tempMax = tempData[`taMax${offset}`] != null ? Number(tempData[`taMax${offset}`]) : null;
    }

    slots[targetDate] = {
      target_date: targetDate,
      day_offset: offset,
      weather_am: weatherAm,
      weather_pm: weatherPm,
      pop_am: popAm,
      pop_pm: popPm,
      temp_min: tempMin,
      temp_max: tempMax,
      source_tm_fc: usedLandTmFc,
    };
  }

  return {
    slots,
    landTmFc: activeLandTmFc,
    tempTmFc: activeTempTmFc,
  };
}

/**
 * Edge function handler to fetch and cache KMA Mid forecasts.
 */
export async function fetchAndStoreKmaMid(
  client: SupabaseClient,
  source: MidWeatherSource,
  regId: string,
  tmFc: string, // YYYYMMDD0600 or YYYYMMDD1800
  apiKey?: string
): Promise<{ ok: boolean; count?: number; error?: string }> {
  if (!apiKey) return { ok: false, error: "MISSING_DATA_GO_KR_API_KEY" };

  const endpoint = source === "KMA_MID_LAND" ? "getMidLandFcst" : "getMidTa";
  const url = `https://apis.data.go.kr/1360000/MidFcstInfoService/${endpoint}?serviceKey=${apiKey}&numOfRows=10&pageNo=1&dataType=JSON&regId=${regId}&tmFc=${tmFc}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `KMA_HTTP_${res.status}` };
    const json = await res.json();
    const items = json?.response?.body?.items?.item || [];
    const forecastData = items[0] || null;

    if (!forecastData) return { ok: false, error: "EMPTY_FORECAST_DATA" };

    const row: KmaMidWeatherCacheRow = {
      source,
      reg_id: regId,
      tm_fc: tmFc,
      forecast_data: forecastData,
      fetched_at: new Date().toISOString(),
    };

    await client.from("kma_mid_weather_cache").upsert([row], { onConflict: "source,reg_id,tm_fc" });
    return { ok: true, count: 1 };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-scheduler-token",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });

if (import.meta.main && typeof (globalThis as any).Deno !== "undefined" && (globalThis as any).Deno?.serve) {
  (globalThis as any).Deno.serve(async (request: Request) => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !key) return json({ ok: false, error: "CONFIG_ERROR" }, 500);

    // @ts-ignore
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const client = createClient(url, key);
    const dataGoKrKey = Deno.env.get("DATA_GO_KR_API_KEY") || Deno.env.get("KMA_API_KEY");

    let body: any = {};
    if (request.method === "POST") {
      try { body = await request.json(); } catch (_) { body = {}; }
    }

    const source: MidWeatherSource = body.source === "KMA_MID_TA" ? "KMA_MID_TA" : "KMA_MID_LAND";
    const regId = String(body.reg_id || (source === "KMA_MID_LAND" ? "11D20000" : "11D20501"));
    const now = new Date(new Date().getTime() + 9 * 3600000);
    const dateCompact = now.toISOString().slice(0, 10).replace(/-/g, "");
    const hour = now.getUTCHours();
    const tmFc = body.tm_fc || `${dateCompact}${hour < 18 ? "06" : "18"}00`;

    const result = await fetchAndStoreKmaMid(client, source, regId, tmFc, dataGoKrKey);
    return json(result, result.ok ? 200 : 500);
  });
}
