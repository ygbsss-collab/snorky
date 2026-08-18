import type{SupabaseClient}from"npm:@supabase/supabase-js@2";
import type{SnorkyPoint}from"./kma-grid.ts";

export async function loadActiveSnorkyPoints(client:SupabaseClient):Promise<SnorkyPoint[]>{
  const[{data:regions,error:regionError},{data:points,error:pointError}]=await Promise.all([
    client.from("regions").select("id,name"),client.from("points").select("id,name,region_id,lat,lng").order("id")
  ]);
  if(regionError||pointError)throw Object.assign(new Error("Supabase points query failed"),{code:"SUPABASE_QUERY"});
  const names=new Map((regions||[]).map(row=>[String(row.id),row.name]));
  // The current SNORKY source treats every row in points as an active point.
  return(points||[]).map(row=>({...row,region:names.get(String(row.region_id))||null}));
}
