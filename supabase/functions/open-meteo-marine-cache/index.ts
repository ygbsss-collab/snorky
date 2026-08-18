import{createClient}from"npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const coordinateKey=(lat:number,lon:number)=>`${lat.toFixed(4)}:${lon.toFixed(4)}`;
Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(request.method!=="GET"&&request.method!=="POST")return json({status:"ERROR",code:"METHOD_NOT_ALLOWED"},405);
  try{
    const input=request.method==="POST"?await request.json().catch(()=>({})):Object.fromEntries(new URL(request.url).searchParams),pointId=Number(input.pointId),url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!Number.isInteger(pointId)||pointId<1)return json({status:"ERROR",code:"INVALID_POINT",hourly:null},400);
    if(!url||!key)throw new Error("server configuration unavailable");
    const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),pointResult=await db.from("points").select("id,lat,lng").eq("id",pointId).maybeSingle();
    if(pointResult.error)throw pointResult.error;
    const latitude=Number(pointResult.data?.lat),longitude=Number(pointResult.data?.lng);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return json({status:"ERROR",code:"POINT_NOT_FOUND",hourly:null},404);
    const cacheKey=coordinateKey(latitude,longitude),latest=await db.from("open_meteo_marine_cache").select("issued_at,fetched_at").eq("cache_key",cacheKey).eq("status","fresh").eq("stale",false).order("issued_at",{ascending:false}).limit(1).maybeSingle();
    if(latest.error)throw latest.error;
    if(!latest.data)return json({status:"EMPTY",cacheKey,hourly:null,stale:false});
    const rows=await db.from("open_meteo_marine_cache").select("forecast_at,normalized_data,fetched_at").eq("cache_key",cacheKey).eq("issued_at",latest.data.issued_at).eq("status","fresh").order("forecast_at");
    if(rows.error)throw rows.error;
    const data=rows.data||[],ageMinutes=(Date.now()-new Date(latest.data.fetched_at).getTime())/60000,cacheStatus=ageMinutes<360?"fresh":ageMinutes<=720?"grace":"stale",fields=["wave_height","wave_direction","wave_period","swell_wave_height","swell_wave_direction","swell_wave_period","ocean_current_velocity","ocean_current_direction","sea_surface_temperature","sea_level_height_msl"],hourly:any={time:data.map(row=>row.normalized_data?.forecastAt??row.forecast_at)};
    for(const field of fields)hourly[field]=data.map(row=>row.normalized_data?.[field]??null);
    return json({status:"READY",cacheStatus,lastSuccessfulAt:latest.data.fetched_at,fetchedAt:latest.data.fetched_at,source:"supabase_open_meteo_marine_cache",cacheKey,issuedAt:latest.data.issued_at,ageMinutes:Math.round(ageMinutes*10)/10,stale:cacheStatus==="stale",hourly});
  }catch(error){console.error("[OPEN METEO MARINE CACHE READ]",{message:error instanceof Error?error.message:"unknown"});return json({status:"ERROR",code:"CACHE_READ_FAILED",hourly:null,stale:true},502)}
});
