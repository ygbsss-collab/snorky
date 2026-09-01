import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { KasiSunTimesInput } from "../_shared/evaluation-dto.ts";

export interface KasiSunTimesCacheRow {
  locdate: string;       // YYYY-MM-DD
  latitude: number;
  longitude: number;
  location_name?: string | null;
  sunrise: string;       // ISO or KST string
  sunset: string;        // ISO or KST string
  source: "KASI";
  fetched_at: string;
}

export interface KasiSunTimesLoadOptions {
  /** Custom/dryRun 요청에서만 사용하는 외부 KASI 호출 상한. 캐시 HIT에는 적용되지 않는다. */
  fetchTimeoutMs?: number;
}

/**
 * Loads KASI SunTimes strictly from KASI source.
 * [CRITICAL] 임의 일출·일몰 계산 fallback 금지. KASI 실패/누락 시 null 반환.
 */
export async function loadKasiSunTimes(
  client: SupabaseClient,
  latitude: number,
  longitude: number,
  dateStr: string, // YYYY-MM-DD
  apiKey?: string,
  options: KasiSunTimesLoadOptions = {}
): Promise<KasiSunTimesInput> {
  const roundLat = Math.round(latitude * 100) / 100;
  const roundLng = Math.round(longitude * 100) / 100;

  // 1. Check KASI Cache
  try {
    const { data, error } = await client
      .from("kasi_sun_times_cache")
      .select("sunrise, sunset, source")
      .eq("locdate", dateStr)
      .eq("latitude", roundLat)
      .eq("longitude", roundLng)
      .maybeSingle();

    if (!error && data?.sunrise && data?.sunset) {
      return {
        date: dateStr,
        sunrise: data.sunrise,
        sunset: data.sunset,
        source: "KASI",
      };
    }
  } catch (_) {
    // Non-blocking
  }

  // 2. KASI API on-demand fetch if apiKey provided
  if (apiKey) {
    const fetchTimeoutMs = Number(options.fetchTimeoutMs);
    const controller = Number.isFinite(fetchTimeoutMs) && fetchTimeoutMs > 0
      ? new AbortController()
      : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), fetchTimeoutMs)
      : null;
    try {
      const locdateParam = dateStr.replace(/-/g, "");
      const url = `https://apis.data.go.kr/B090041/openapi/service/RiseSetInfoService/getLCSunRiseSetInfo?serviceKey=${apiKey}&locdate=${locdateParam}&latitude=${roundLat}&longitude=${roundLng}&dnYn=N`;
      const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
      if (res.ok) {
        const text = await res.text();
        const sunriseMatch = text.match(/<sunrise>(\d{4})<\/sunrise>/);
        const sunsetMatch = text.match(/<sunset>(\d{4})<\/sunset>/);
        if (sunriseMatch && sunsetMatch) {
          const srH = sunriseMatch[1].slice(0, 2);
          const srM = sunriseMatch[1].slice(2, 4);
          const ssH = sunsetMatch[1].slice(0, 2);
          const ssM = sunsetMatch[1].slice(2, 4);
          const sunriseIso = `${dateStr}T${srH}:${srM}:00+09:00`;
          const sunsetIso = `${dateStr}T${ssH}:${ssM}:00+09:00`;

          const row: KasiSunTimesCacheRow = {
            locdate: dateStr,
            latitude: roundLat,
            longitude: roundLng,
            sunrise: sunriseIso,
            sunset: sunsetIso,
            source: "KASI",
            fetched_at: new Date().toISOString(),
          };

          await client.from("kasi_sun_times_cache").upsert([row], { onConflict: "locdate,latitude,longitude" });
          return {
            date: dateStr,
            sunrise: sunriseIso,
            sunset: sunsetIso,
            source: "KASI",
          };
        }
      }
    } catch (_) {
      // Fall through to null
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  }

  // 3. Strict KASI missing handling: NO calculated fallback
  return {
    date: dateStr,
    sunrise: null,
    sunset: null,
    source: "KASI",
  };
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
    const kasiKey = Deno.env.get("KASI_API_KEY");

    let body: any = {};
    if (request.method === "POST") {
      try { body = await request.json(); } catch (_) { body = {}; }
    }

    const lat = Number(body.latitude || 37.8055);
    const lng = Number(body.longitude || 128.8978);
    const dateStr = body.date || new Date().toISOString().slice(0, 10);

    const result = await loadKasiSunTimes(client, lat, lng, dateStr, kasiKey);
    return json({ ok: true, data: result }, 200);
  });
}
