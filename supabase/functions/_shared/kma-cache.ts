import type{SupabaseClient}from"npm:@supabase/supabase-js@2";
import type{NormalizedForecast}from"./kma-weather.ts";

const hydrate=(row:Record<string,any>):NormalizedForecast=>({...row.forecast_data,gridKey:row.grid_key,nx:row.nx,ny:row.ny,baseDate:row.base_date,baseTime:row.base_time,fetchedAt:row.fetched_at,rawMeta:{...(row.forecast_data?.rawMeta||{}),receivedBytes:row.response_bytes,itemCount:row.item_count}});

export function createKmaPersistentCache(client:SupabaseClient){
  return{
    async get(gridKey:string,baseDate:string,baseTime:string){const{data,error}=await client.from("kma_weather_cache").select("*").eq("grid_key",gridKey).eq("base_date",baseDate).eq("base_time",baseTime).eq("status","fresh").maybeSingle();if(error)throw error;return data?hydrate(data):null},
    async getLatestSuccessful(gridKey:string){const{data,error}=await client.from("kma_weather_cache").select("*").eq("grid_key",gridKey).eq("status","fresh").order("base_date",{ascending:false}).order("base_time",{ascending:false}).limit(1).maybeSingle();if(error)throw error;return data?hydrate(data):null},
    async upsert(value:NormalizedForecast){const{error}=await client.from("kma_weather_cache").upsert({grid_key:value.gridKey,nx:value.nx,ny:value.ny,base_date:value.baseDate,base_time:value.baseTime,forecast_data:{hourly:value.hourly,daily:value.daily,rawMeta:value.rawMeta},fetched_at:value.fetchedAt,updated_at:new Date().toISOString(),status:"fresh",response_bytes:value.rawMeta.receivedBytes,item_count:value.rawMeta.itemCount},{onConflict:"grid_key,base_date,base_time"});if(error)throw error},
    async acquireLock(ownerToken:string,ttlSeconds=600){const{data,error}=await client.rpc("try_acquire_kma_refresh_lock",{p_lock_name:"kma-village-refresh",p_owner_token:ownerToken,p_ttl_seconds:ttlSeconds});if(error)throw error;return data===true},
    async releaseLock(ownerToken:string){const{data,error}=await client.rpc("release_kma_refresh_lock",{p_lock_name:"kma-village-refresh",p_owner_token:ownerToken});if(error)throw error;return data===true}
  };
}
export type KmaPersistentCache=ReturnType<typeof createKmaPersistentCache>;
