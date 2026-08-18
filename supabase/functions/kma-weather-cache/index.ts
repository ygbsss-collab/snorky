import{createClient}from"npm:@supabase/supabase-js@2";
function toKmaGrid(latitude:number,longitude:number){const RE=6371.00877,GRID=5,SLAT1=30,SLAT2=60,OLON=126,OLAT=38,XO=43,YO=136,D=Math.PI/180,re=RE/GRID,s1=SLAT1*D,s2=SLAT2*D,o=OLON*D,ol=OLAT*D;let sn=Math.log(Math.cos(s1)/Math.cos(s2))/Math.log(Math.tan(Math.PI*.25+s2*.5)/Math.tan(Math.PI*.25+s1*.5)),sf=Math.pow(Math.tan(Math.PI*.25+s1*.5),sn)*Math.cos(s1)/sn,ro=re*sf/Math.pow(Math.tan(Math.PI*.25+ol*.5),sn),ra=re*sf/Math.pow(Math.tan(Math.PI*.25+latitude*D*.5),sn),theta=longitude*D-o;if(theta>Math.PI)theta-=2*Math.PI;if(theta< -Math.PI)theta+=2*Math.PI;theta*=sn;return{nx:Math.floor(ra*Math.sin(theta)+XO+.5),ny:Math.floor(ro-ra*Math.cos(theta)+YO+.5)}}

const CACHE_STALE_MINUTES=360;
const CORS_HEADERS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...CORS_HEADERS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const finite=(value:unknown)=>value===null||value===undefined||value===""?null:Number.isFinite(Number(value))?Number(value):null;

Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS_HEADERS});
  if(request.method!=="GET"&&request.method!=="POST")return json({status:"ERROR",code:"METHOD_NOT_ALLOWED",forecastData:null},200);
  try{
    const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!key)throw new Error("server configuration unavailable");
    let input:Record<string,unknown>={};if(request.method==="POST"){try{input=await request.json()}catch{input={}}}else input=Object.fromEntries(new URL(request.url).searchParams);
    let nx=finite(input.nx),ny=finite(input.ny);const latitude=finite(input.latitude),longitude=finite(input.longitude);
    if((nx===null||ny===null)&&latitude!==null&&longitude!==null)({nx,ny}=toKmaGrid(latitude,longitude));
    if(nx===null||ny===null||!Number.isInteger(nx)||!Number.isInteger(ny)||nx<1||nx>149||ny<1||ny>253)return json({status:"ERROR",code:"INVALID_GRID",forecastData:null});
    const gridKey=`${nx}:${ny}`,client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),{data,error}=await client.from("kma_weather_cache").select("grid_key,nx,ny,base_date,base_time,forecast_data,source_issued_at,fetched_at,last_successful_at,http_status,status").eq("grid_key",gridKey).eq("status","fresh").order("fetched_at",{ascending:false}).order("base_date",{ascending:false}).order("base_time",{ascending:false}).limit(1).maybeSingle();
    if(error)throw error;if(!data)return json({status:"EMPTY",gridKey,nx,ny,forecastData:null,stale:false});
    const ageMinutes=Math.max(0,(Date.now()-new Date(data.fetched_at).getTime())/60000),stale=!Number.isFinite(ageMinutes)||ageMinutes>CACHE_STALE_MINUTES,forecastData=data.forecast_data;
    if(!forecastData||!Array.isArray(forecastData.hourly)||!Array.isArray(forecastData.daily))return json({status:"ERROR",code:"MALFORMED_CACHE",gridKey,nx,ny,forecastData:null,stale:true});
    return json({status:"READY",gridKey:data.grid_key,nx:data.nx,ny:data.ny,baseDate:data.base_date,baseTime:data.base_time,sourceIssuedAt:data.source_issued_at,fetchedAt:data.fetched_at,lastSuccessfulAt:data.last_successful_at||data.fetched_at,httpStatus:data.http_status,cacheStatus:data.status,forecastData,ageMinutes:Math.round(ageMinutes*10)/10,stale});
  }catch(error){console.error("[KMA WEATHER CACHE READ]",{message:error instanceof Error?error.message:"unknown"});return json({status:"ERROR",code:"CACHE_READ_FAILED",forecastData:null,stale:true})}
});
