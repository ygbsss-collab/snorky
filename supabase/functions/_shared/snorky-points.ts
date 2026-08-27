import type{SupabaseClient}from"npm:@supabase/supabase-js@2";
import type{SnorkyPoint}from"./kma-grid.ts";

export async function loadActiveSnorkyPoints(client: SupabaseClient): Promise<SnorkyPoint[]> {
  const [{ data: regions, error: regionError }, { data: points, error: pointError }] = await Promise.all([
    client.from("regions").select("id, name, warning_area_code"),
    client.from("points").select("id, name, region_id, lat, lng, environment, warning_area_code, updated_at").order("id")
  ]);
  if (regionError || pointError) throw Object.assign(new Error("Supabase points query failed"), { code: "SUPABASE_QUERY" });
  const regionMap = new Map((regions || []).map(row => [String(row.id), row]));

  return (points || []).map(row => {
    const reg = regionMap.get(String(row.region_id));
    return {
      ...row,
      region: reg?.name || null,
      warning_area_code: row.warning_area_code || reg?.warning_area_code || null,
      environment: row.environment || null,
      updated_at: row.updated_at || null
    };
  });
}
