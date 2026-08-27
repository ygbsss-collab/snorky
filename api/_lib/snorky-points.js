"use strict";

async function loadActiveSnorkyPoints({fetchImpl=globalThis.fetch}={}){
  const base=process.env.SUPABASE_URL||process.env.SNORKY_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SNORKY_SUPABASE_PUBLISHABLE_KEY;
  if(!base||!key)throw Object.assign(new Error("Server-side Supabase URL/publishable key is not configured"),{code:"CONFIG"});
  const headers={apikey:key,Authorization:`Bearer ${key}`},[regionsResponse,pointsResponse]=await Promise.all([
    fetchImpl(`${base.replace(/\/$/,"")}/rest/v1/regions?select=id,name`,{headers}),
    fetchImpl(`${base.replace(/\/$/,"")}/rest/v1/points?select=id,name,region_id,lat,lng&order=id.asc`,{headers})
  ]);
  if(!regionsResponse.ok||!pointsResponse.ok)throw Object.assign(new Error(`Supabase points query failed (${regionsResponse.status}/${pointsResponse.status})`),{code:"SUPABASE_HTTP"});
  const regions=await regionsResponse.json(),points=await pointsResponse.json(),names=new Map(regions.map(region=>[String(region.id),region.name]));
  // The current points source treats all rows in points as active snorkeling points.
  return points.map(point=>({...point,region:names.get(String(point.region_id))||null}));
}

module.exports={loadActiveSnorkyPoints};
