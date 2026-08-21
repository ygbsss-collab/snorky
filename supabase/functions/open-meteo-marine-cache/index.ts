import { createClient } from "npm:@supabase/supabase-js@2";
import { MARINE_HOURLY_FIELDS, coordinateKey, marineUrl, normalizeMarine } from "../_shared/open-meteo-marine.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const FIELDS = [...MARINE_HOURLY_FIELDS];

async function fetchFromOpenMeteo(latitude: number, longitude: number) {
  const url = marineUrl(latitude, longitude);
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const text = await response.text();
    const parsed = JSON.parse(text);
    const rows = normalizeMarine(parsed);
    if (!rows.length) return null;
    return { parsed, rows, bytes: new TextEncoder().encode(text).byteLength };
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "GET" && request.method !== "POST") return json({ status: "ERROR", code: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const input = request.method === "POST" ? await request.json().catch(() => ({})) : Object.fromEntries(new URL(request.url).searchParams),
          pointId = Number(input.pointId),
          url = Deno.env.get("SUPABASE_URL"),
          key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!Number.isInteger(pointId) || pointId < 1) return json({ status: "ERROR", code: "INVALID_POINT", hourly: null }, 400);
    if (!url || !key) throw new Error("server configuration unavailable");

    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
          pointResult = await db.from("points").select("id,lat,lng").eq("id", pointId).maybeSingle();
    if (pointResult.error) throw pointResult.error;

    let latitude = Number(pointResult.data?.lat), longitude = Number(pointResult.data?.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      latitude = Number(input.latitude);
      longitude = Number(input.longitude);
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return json({ status: "ERROR", code: "POINT_NOT_FOUND", hourly: null }, 404);

    const cacheKey = coordinateKey(latitude, longitude);
    const latest = await db.from("open_meteo_marine_cache")
      .select("issued_at,fetched_at")
      .eq("cache_key", cacheKey)
      .eq("status", "fresh")
      .eq("stale", false)
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.error) throw latest.error;

    // 1. Cache HIT
    if (latest.data) {
      const rows = await db.from("open_meteo_marine_cache")
        .select("forecast_at,normalized_data,fetched_at")
        .eq("cache_key", cacheKey)
        .eq("issued_at", latest.data.issued_at)
        .eq("status", "fresh")
        .order("forecast_at");
      if (rows.error) throw rows.error;
      const data = rows.data || [];
      if (data.length) {
        const ageMinutes = (Date.now() - new Date(latest.data.fetched_at).getTime()) / 60000;
        const cacheStatus = ageMinutes < 360 ? "fresh" : ageMinutes <= 720 ? "grace" : "stale";
        const hourly: any = { time: data.map(row => row.normalized_data?.forecastAt ?? row.forecast_at) };
        for (const field of FIELDS) {
          hourly[field] = data.map(row => row.normalized_data?.[field] ?? null);
        }
        return json({
          status: "READY",
          cacheStatus,
          lastSuccessfulAt: latest.data.fetched_at,
          fetchedAt: latest.data.fetched_at,
          source: "supabase_open_meteo_marine_cache",
          cacheKey,
          issuedAt: latest.data.issued_at,
          ageMinutes: Math.round(ageMinutes * 10) / 10,
          stale: cacheStatus === "stale",
          hourly
        });
      }
    }

    // 2. Cache MISS / EMPTY -> On-Demand Fetch & Upsert
    const onDemand = await fetchFromOpenMeteo(latitude, longitude);
    if (!onDemand) {
      return json({ status: "EMPTY", cacheKey, hourly: null, stale: false });
    }

    const issuedAt = new Date().toISOString();
    const records = onDemand.rows.map((row: any) => ({
      cache_key: cacheKey,
      latitude,
      longitude,
      issued_at: issuedAt,
      forecast_at: row.forecastAt,
      normalized_data: row,
      source_payload_meta: {
        timezone: onDemand.parsed.timezone ?? null,
        utcOffsetSeconds: onDemand.parsed.utc_offset_seconds ?? null,
        generationTimeMs: onDemand.parsed.generationtime_ms ?? null
      },
      fetched_at: issuedAt,
      status: "fresh",
      stale: false,
      response_bytes: onDemand.bytes,
      updated_at: issuedAt
    }));

    const writeResult = await db.from("open_meteo_marine_cache").upsert(records, { onConflict: "cache_key,issued_at,forecast_at" });
    if (writeResult.error) {
      console.warn("[OPEN METEO MARINE CACHE ON-DEMAND WRITE WARNING]", writeResult.error.message);
    }

    const onDemandHourly: any = { time: onDemand.rows.map((r: any) => r.forecastAt) };
    for (const field of FIELDS) {
      onDemandHourly[field] = onDemand.rows.map((r: any) => r[field] ?? null);
    }

    return json({
      status: "READY",
      cacheStatus: "fresh",
      lastSuccessfulAt: issuedAt,
      fetchedAt: issuedAt,
      source: "supabase_open_meteo_marine_cache",
      cacheKey,
      issuedAt,
      ageMinutes: 0,
      stale: false,
      hourly: onDemandHourly
    });

  } catch (error) {
    console.error("[OPEN METEO MARINE CACHE READ]", { message: error instanceof Error ? error.message : "unknown" });
    return json({ status: "ERROR", code: "CACHE_READ_FAILED", hourly: null, stale: true }, 502);
  }
});
