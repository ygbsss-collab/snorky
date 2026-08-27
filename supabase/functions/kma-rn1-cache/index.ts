import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Rn1HistoryItem } from "../_shared/evaluation-dto.ts";

export interface KmaRn1CacheRow {
  nx: number;
  ny: number;
  observed_at: string; // ISO or KST "YYYY-MM-DDTHH:mm:00+09:00"
  rn1: number;         // 1-hour precipitation in mm
  fetched_at: string;
  status: "fresh" | "stale";
}

/**
 * Loads recent RN1 observation history (up to 48 hours) for given grid nx, ny.
 * Sorted by hoursAgo ascending (1 = 1 hour ago, 2 = 2 hours ago, ...).
 */
export async function loadRn1History(
  client: SupabaseClient,
  nx: number,
  ny: number,
  referenceTimeIso: string,
  maxHours = 48
): Promise<Rn1HistoryItem[]> {
  const refMs = new Date(referenceTimeIso).getTime();
  const cutoffIso = new Date(refMs - (maxHours + 1) * 3600000).toISOString();

  const { data, error } = await client
    .from("kma_rn1_cache")
    .select("observed_at, rn1")
    .eq("nx", nx)
    .eq("ny", ny)
    .gte("observed_at", cutoffIso)
    .lte("observed_at", referenceTimeIso)
    .order("observed_at", { ascending: false });

  if (error || !data || !data.length) return [];

  const history: Rn1HistoryItem[] = [];
  let accum24h = 0;

  for (const row of data) {
    const rowMs = new Date(row.observed_at).getTime();
    const hoursAgo = Math.max(1, Math.round((refMs - rowMs) / 3600000));
    if (hoursAgo > maxHours) continue;

    const val = Number(row.rn1) || 0;
    if (hoursAgo <= 24) accum24h += val;

    history.push({
      hoursAgo,
      rn1: val,
      precipitation_accumulated_24h: Math.round(accum24h * 10) / 10,
    });
  }

  return history;
}

/**
 * Edge Function handler for RN1 collection.
 */
export async function fetchAndStoreKmaRn1(
  client: SupabaseClient,
  nx: number,
  ny: number,
  apiKey?: string
): Promise<{ ok: boolean; rn1?: number; observed_at?: string; error?: string }> {
  if (!apiKey) {
    return { ok: false, error: "MISSING_KMA_API_KEY" };
  }

  const now = new Date(new Date().getTime() + 9 * 3600000);
  const baseDate = now.toISOString().slice(0, 10).replace(/-/g, "");
  const baseTime = `${String(now.getUTCHours()).padStart(2, "0")}00`;

  const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${apiKey}&numOfRows=10&pageNo=1&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${nx}&ny=${ny}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `KMA_HTTP_${res.status}` };
    const json = await res.json();
    const items = json?.response?.body?.items?.item || [];
    const rn1Item = items.find((it: any) => it.category === "RN1");
    if (!rn1Item) return { ok: false, error: "RN1_CATEGORY_NOT_FOUND" };

    const rn1Val = parseFloat(rn1Item.obsrValue);
    const observedAt = `${now.toISOString().slice(0, 10)}T${String(now.getUTCHours()).padStart(2, "0")}:00:00+09:00`;
    const fetchedAt = new Date().toISOString();

    const row: KmaRn1CacheRow = {
      nx,
      ny,
      observed_at: observedAt,
      rn1: isNaN(rn1Val) ? 0 : rn1Val,
      fetched_at: fetchedAt,
      status: "fresh",
    };

    await client.from("kma_rn1_cache").upsert([row], { onConflict: "nx,ny,observed_at" });
    return { ok: true, rn1: row.rn1, observed_at: observedAt };
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
    const kmaKey = Deno.env.get("KMA_API_KEY");

    let body: any = {};
    if (request.method === "POST") {
      try { body = await request.json(); } catch (_) { body = {}; }
    }

    const nx = Number(body.nx || 92);
    const ny = Number(body.ny || 132);

    const result = await fetchAndStoreKmaRn1(client, nx, ny, kmaKey);
    return json(result, result.ok ? 200 : 500);
  });
}
