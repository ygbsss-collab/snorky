"use strict";

const EXACT_KEY=/^kma:village:(\d+):(\d+):(\d{8}):(\d{4})$/;
const LAST_GOOD_KEY=/^kma:village:(\d+):(\d+):last-known-good$/;
const LATEST_BASE_KEY="kma:village:latest-base";

function createSupabaseKmaCache({url=process.env.SUPABASE_URL||process.env.SNORKY_SUPABASE_URL,serviceRoleKey=process.env.SUPABASE_SERVICE_ROLE_KEY,fetchImpl=globalThis.fetch}={}){
  if(!url||!serviceRoleKey)throw Object.assign(new Error("Server-side Supabase cache configuration is missing"),{code:"CONFIG"});
  const rest=`${url.replace(/\/$/,"")}/rest/v1`,headers={apikey:serviceRoleKey,Authorization:`Bearer ${serviceRoleKey}`};
  async function request(path,{method="GET",body,prefer}={}){
    const response=await fetchImpl(`${rest}${path}`,{method,headers:{...headers,...(body?{"Content-Type":"application/json"}:{}),...(prefer?{Prefer:prefer}:{})},body:body?JSON.stringify(body):undefined});
    const text=await response.text();if(!response.ok)throw Object.assign(new Error(`Supabase KMA cache HTTP ${response.status}`),{code:"SUPABASE_HTTP",status:response.status});
    return text?JSON.parse(text):null;
  }
  function hydrate(row){if(!row)return null;const forecast=row.forecast_data;return{...forecast,gridKey:row.grid_key,nx:row.nx,ny:row.ny,baseDate:row.base_date,baseTime:row.base_time,fetchedAt:row.fetched_at,rawMeta:{...(forecast.rawMeta||{}),receivedBytes:row.response_bytes,itemCount:row.item_count}}}
  async function get(key){
    // Completion of a release is process-local until a dedicated refresh-run
    // record exists. Forecast rows alone cannot prove that every grid finished.
    if(key===LATEST_BASE_KEY)return null;
    const exact=key.match(EXACT_KEY);if(exact){const [,nx,ny,baseDate,baseTime]=exact,gridKey=`${nx}:${ny}`,rows=await request(`/kma_weather_cache?select=*&grid_key=eq.${encodeURIComponent(gridKey)}&base_date=eq.${baseDate}&base_time=eq.${baseTime}&status=eq.fresh&limit=1`);return hydrate(rows?.[0])}
    const latest=key.match(LAST_GOOD_KEY);if(latest){const gridKey=`${latest[1]}:${latest[2]}`,rows=await request(`/kma_weather_cache?select=*&grid_key=eq.${encodeURIComponent(gridKey)}&status=eq.fresh&order=base_date.desc,base_time.desc&limit=1`);return hydrate(rows?.[0])}
    return null;
  }
  async function set(key,value){
    if(key===LATEST_BASE_KEY||LAST_GOOD_KEY.test(key))return;
    const match=key.match(EXACT_KEY);if(!match)throw new TypeError("Unsupported KMA cache key");
    const row={grid_key:value.gridKey,nx:value.nx,ny:value.ny,base_date:value.baseDate,base_time:value.baseTime,forecast_data:{hourly:value.hourly,daily:value.daily,rawMeta:value.rawMeta},fetched_at:value.fetchedAt,status:"fresh",response_bytes:value.rawMeta?.receivedBytes||0,item_count:value.rawMeta?.itemCount||0,updated_at:new Date().toISOString()};
    await request("/kma_weather_cache?on_conflict=grid_key,base_date,base_time",{method:"POST",body:row,prefer:"resolution=merge-duplicates,return=minimal"});
  }
  async function acquireRefreshLock(ownerToken,ttlSeconds=600){const result=await request("/rpc/try_acquire_kma_refresh_lock",{method:"POST",body:{p_lock_name:"kma-village-refresh",p_owner_token:ownerToken,p_ttl_seconds:ttlSeconds}});return result===true}
  async function releaseRefreshLock(ownerToken){const result=await request("/rpc/release_kma_refresh_lock",{method:"POST",body:{p_lock_name:"kma-village-refresh",p_owner_token:ownerToken}});return result===true}
  return{get,set,acquireRefreshLock,releaseRefreshLock};
}

module.exports={createSupabaseKmaCache,_patterns:{EXACT_KEY,LAST_GOOD_KEY,LATEST_BASE_KEY}};
