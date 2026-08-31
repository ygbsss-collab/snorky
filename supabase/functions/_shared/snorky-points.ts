import type{SupabaseClient}from"npm:@supabase/supabase-js@2";
import type{SnorkyPoint}from"./kma-grid.ts";

function isMissingLandWarningColumn(error: any): boolean {
  return Boolean(error) && `${error.code || ""} ${error.message || ""} ${error.details || ""}`.includes("land_warning_area_code");
}

async function loadRegions(client: SupabaseClient) {
  let result = await client.from("regions").select("id, name, warning_area_code, land_warning_area_code");
  if (isMissingLandWarningColumn(result.error)) {
    result = await client.from("regions").select("id, name, warning_area_code");
  }
  return result;
}

async function loadPoints(client: SupabaseClient) {
  let result = await client.from("points").select("id, name, region_id, lat, lng, environment, warning_area_code, land_warning_area_code, updated_at").order("id");
  if (isMissingLandWarningColumn(result.error)) {
    result = await client.from("points").select("id, name, region_id, lat, lng, environment, warning_area_code, updated_at").order("id");
  }
  return result;
}

export async function loadActiveSnorkyPoints(client: SupabaseClient): Promise<SnorkyPoint[]> {
  const [{ data: regions, error: regionError }, { data: points, error: pointError }] = await Promise.all([
    loadRegions(client),
    loadPoints(client)
  ]);
  if (regionError || pointError) throw Object.assign(new Error("Supabase points query failed"), { code: "SUPABASE_QUERY" });
  const regionMap = new Map((regions || []).map(row => [String(row.id), row]));

  return (points || []).map(row => {
    const reg = regionMap.get(String(row.region_id));
    return {
      ...row,
      region: reg?.name || null,
      warning_area_code: row.warning_area_code || reg?.warning_area_code || null,
      land_warning_area_code: row.land_warning_area_code || reg?.land_warning_area_code || null,
      environment: row.environment || null,
      updated_at: row.updated_at || null
    };
  });
}
