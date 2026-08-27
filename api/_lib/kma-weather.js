"use strict";

const {buildKmaGridRegistry}=require("./kma-grid");
const KMA_VILLAGE_ENDPOINT="https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst";
const KMA_BUOY_CACHE_KEY="kma:buoy:latest";
const KMA_LATEST_BASE_CACHE_KEY="kma:village:latest-base";
const ISSUE_HOURS=[2,5,8,11,14,17,20,23];
const memoryStore=new Map(),lastKnownGood=new Map(),inFlight=new Map(),cooldowns=new Map();
let latestRefreshedBase=null;
const stats={date:null,requestCount:0,successCount:0,failureCount:0,receivedBytes:0,cacheHit:0,cacheMiss:0,inFlightReuse:0,http429:0,http403:0,http5xx:0,timeout:0};
let persistentCache=null;

const numberOrNull=value=>value===null||value===undefined||value===""||!Number.isFinite(Number(value))?null:Number(value);
const envNumber=(name,fallback)=>{const value=Number(process.env[name]);return Number.isFinite(value)&&value>=0?value:fallback};
function kstParts(date=new Date()){
  const pieces=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
  return Object.fromEntries(pieces.map(part=>[part.type,part.value]));
}
function resetStatsIfNeeded(date=new Date()){
  const p=kstParts(date),key=`${p.year}${p.month}${p.day}`;
  if(stats.date!==key)Object.assign(stats,{date:key,requestCount:0,successCount:0,failureCount:0,receivedBytes:0,cacheHit:0,cacheMiss:0,inFlightReuse:0,http429:0,http403:0,http5xx:0,timeout:0});
}
function getLatestAvailableKmaBaseTime(now=new Date(),delayMinutes=envNumber("KMA_BASE_DELAY_MINUTES",40)){
  const p=kstParts(now),localMinutes=Number(p.hour)*60+Number(p.minute)-delayMinutes;
  let date=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day)));
  let available=ISSUE_HOURS.filter(hour=>hour*60<=localMinutes).at(-1);
  if(available===undefined){date=new Date(date.getTime()-86400000);available=23}
  return{baseDate:`${date.getUTCFullYear()}${String(date.getUTCMonth()+1).padStart(2,"0")}${String(date.getUTCDate()).padStart(2,"0")}`,baseTime:`${String(available).padStart(2,"0")}00`};
}
function cacheKey(gridKey,baseDate,baseTime){return`kma:village:${gridKey}:${baseDate}:${baseTime}`}
function lastKnownGoodKey(gridKey){return`kma:village:${gridKey}:last-known-good`}
async function cacheGet(key){
  if(memoryStore.has(key))return{value:memoryStore.get(key),level:"l1"};
  if(!persistentCache)return{value:null,level:null};
  const value=await persistentCache.get(key);if(value!==null&&value!==undefined){memoryStore.set(key,value);return{value,level:"supabase"}}
  return{value:null,level:null};
}
async function cacheSet(key,value){memoryStore.set(key,value);if(persistentCache)await persistentCache.set(key,value)}
function parseKmaPcp(value){
  const raw=value===null||value===undefined?null:String(value).trim();if(!raw)return{raw,mm:null,hasRain:null};
  if(raw==="강수없음"||raw==="0"||raw==="0.0")return{raw,mm:0,hasRain:false};
  if(/미만|~|이상/.test(raw))return{raw,mm:null,hasRain:true};
  const match=raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*(?:mm)?$/i);if(!match)return{raw,mm:null,hasRain:null};
  const mm=Number(match[1]);return{raw,mm,hasRain:mm>0};
}
function normalizeKmaSky(value){const code=numberOrNull(value),labels={1:"맑음",3:"구름많음",4:"흐림"};return{code,label:labels[code]??null}}
function normalizeKmaPty(value){const code=numberOrNull(value),labels={0:"없음",1:"비",2:"비/눈",3:"눈",4:"소나기",5:"빗방울",6:"빗방울/눈날림",7:"눈날림"};return{code,label:labels[code]??null}}
function normalizeItems(items,{nx,ny,baseDate,baseTime,fetchedAt,receivedBytes}){
  const hourlyMap=new Map(),dailyMap=new Map();
  for(const item of items){
    const date=String(item.fcstDate||""),time=String(item.fcstTime||"").padStart(4,"0"),datetime=date&&time?`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${time.slice(0,2)}:${time.slice(2,4)}:00+09:00`:null;
    if(["TMX","TMN"].includes(item.category)){if(!dailyMap.has(date))dailyMap.set(date,{date:`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`,tempMax:null,tempMin:null});dailyMap.get(date)[item.category==="TMX"?"tempMax":"tempMin"]=numberOrNull(item.fcstValue);continue}
    if(!datetime)continue;if(!hourlyMap.has(datetime))hourlyMap.set(datetime,{datetime,temperature:null,windSpeed:null,windDirection:null,precipitation:null,precipitationProbability:null,sky:null,precipitationType:null});
    const row=hourlyMap.get(datetime),value=item.fcstValue;
    if(item.category==="TMP")row.temperature=numberOrNull(value);else if(item.category==="WSD")row.windSpeed=numberOrNull(value);else if(item.category==="VEC")row.windDirection=numberOrNull(value);else if(item.category==="PCP")row.precipitation=parseKmaPcp(value);else if(item.category==="POP")row.precipitationProbability=numberOrNull(value);else if(item.category==="SKY")row.sky=normalizeKmaSky(value);else if(item.category==="PTY")row.precipitationType=normalizeKmaPty(value);
  }
  return{gridKey:`${nx}:${ny}`,nx,ny,baseDate,baseTime,fetchedAt,hourly:[...hourlyMap.values()].sort((a,b)=>a.datetime.localeCompare(b.datetime)),daily:[...dailyMap.values()].sort((a,b)=>a.date.localeCompare(b.date)),rawMeta:{itemCount:items.length,receivedBytes}};
}
function recordFailure(error){stats.failureCount++;const status=error?.status;if(status===429)stats.http429++;if(status===403)stats.http403++;if(status>=500&&status<600)stats.http5xx++;if(error?.code==="TIMEOUT")stats.timeout++}
function enforceSoftLimits(){
  resetStatsIfNeeded();const requestLimit=envNumber("KMA_DAILY_REQUEST_SOFT_LIMIT",Infinity),byteLimit=envNumber("KMA_DAILY_BYTES_SOFT_LIMIT",Infinity);
  if(stats.requestCount>=requestLimit||stats.receivedBytes>=byteLimit){const error=new Error("KMA daily soft limit reached");error.code="SOFT_LIMIT";throw error}
}
async function fetchKmaVillageForecast(nx,ny,baseDate,baseTime,{fetchImpl=globalThis.fetch}={}){
  const apiKey=process.env.KMA_API_KEY;if(!apiKey)throw Object.assign(new Error("KMA_API_KEY is not configured"),{code:"CONFIG"});if(typeof fetchImpl!=="function")throw new Error("fetch is unavailable");
  enforceSoftLimits();stats.requestCount++;const controller=new AbortController(),timeoutMs=envNumber("KMA_FETCH_TIMEOUT_MS",15000),timer=setTimeout(()=>controller.abort(),timeoutMs),started=Date.now();
  try{
    const url=new URL(KMA_VILLAGE_ENDPOINT);for(const [key,value] of Object.entries({pageNo:1,numOfRows:1000,dataType:"JSON",base_date:baseDate,base_time:baseTime,nx,ny,authKey:apiKey}))url.searchParams.set(key,String(value));
    const response=await fetchImpl(url,{signal:controller.signal,headers:{Accept:"application/json"}}),body=await response.text(),receivedBytes=Buffer.byteLength(body,"utf8");stats.receivedBytes+=receivedBytes;
    if(!response.ok)throw Object.assign(new Error(`KMA HTTP ${response.status}`),{status:response.status,code:"HTTP"});
    let payload;try{payload=JSON.parse(body)}catch(cause){throw Object.assign(new Error("KMA JSON parsing failed",{cause}),{code:"PARSE"})}
    const header=payload?.response?.header;if(String(header?.resultCode)!=="00")throw Object.assign(new Error(`KMA ${header?.resultCode||"UNKNOWN"}: ${header?.resultMsg||"Unknown error"}`),{code:"KMA_RESULT"});
    const items=payload?.response?.body?.items?.item;if(!Array.isArray(items))throw Object.assign(new Error("KMA forecast items are missing"),{code:"SHAPE"});
    stats.successCount++;return{...normalizeItems(items,{nx,ny,baseDate,baseTime,fetchedAt:new Date().toISOString(),receivedBytes}),elapsedMs:Date.now()-started};
  }catch(error){if(error?.name==="AbortError")Object.assign(error,{code:"TIMEOUT"});recordFailure(error);throw error}finally{clearTimeout(timer)}
}
async function getKmaForecast(nx,ny,baseDate,baseTime,options={}){
  resetStatsIfNeeded();const gridKey=`${nx}:${ny}`,key=cacheKey(gridKey,baseDate,baseTime),cached=await cacheGet(key);if(cached.value){stats.cacheHit++;return{...cached.value,cacheStatus:"fresh",cacheLevel:cached.level}}
  stats.cacheMiss++;if(inFlight.has(key)){stats.inFlightReuse++;return inFlight.get(key)}
  if((cooldowns.get(gridKey)||0)>Date.now()){const stored=await cacheGet(lastKnownGoodKey(gridKey)),stale=lastKnownGood.get(gridKey)||stored.value;if(stale)return{...stale,cacheStatus:"stale",cacheLevel:stored.level||"l1"};throw Object.assign(new Error("KMA grid is cooling down"),{code:"COOLDOWN"})}
  const promise=fetchKmaVillageForecast(nx,ny,baseDate,baseTime,options).then(async value=>{await cacheSet(key,value);memoryStore.set(lastKnownGoodKey(gridKey),value);lastKnownGood.set(gridKey,value);cooldowns.delete(gridKey);return{...value,cacheStatus:"fresh",cacheLevel:"upstream"}}).catch(async error=>{if(["TIMEOUT","HTTP","PARSE","KMA_RESULT","SHAPE"].includes(error?.code))cooldowns.set(gridKey,Date.now()+envNumber("KMA_FAILURE_COOLDOWN_MS",900000));const stored=await cacheGet(lastKnownGoodKey(gridKey)),stale=lastKnownGood.get(gridKey)||stored.value;if(stale)return{...stale,cacheStatus:"stale",cacheLevel:stored.level||"l1",refreshError:{code:error.code,status:error.status??null}};throw error}).finally(()=>inFlight.delete(key));
  inFlight.set(key,promise);return promise;
}
async function workerPool(items,limit,task){let cursor=0;const results=new Array(items.length);async function worker(){while(true){const index=cursor++;if(index>=items.length)return;try{results[index]={status:"fulfilled",value:await task(items[index])}}catch(reason){results[index]={status:"rejected",reason}}}}await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return results}
async function refreshKmaForecastCache({points,registry,now=new Date(),fetchImpl=globalThis.fetch,concurrency=envNumber("KMA_REFRESH_CONCURRENCY",3)}={}){
  const gridRegistry=registry||buildKmaGridRegistry(points||[]),base=getLatestAvailableKmaBaseTime(now),baseKey=`${base.baseDate}:${base.baseTime}`;
  const before=stats.requestCount,settled=await workerPool(gridRegistry.grids,Math.max(1,Math.min(5,concurrency)),grid=>getKmaForecast(grid.nx,grid.ny,base.baseDate,base.baseTime,{fetchImpl}));
  const success=settled.filter(item=>item.status==="fulfilled").length,failed=settled.length-success,apiCalls=stats.requestCount-before;
  if(failed===0){latestRefreshedBase=baseKey;await cacheSet(KMA_LATEST_BASE_CACHE_KEY,baseKey)}
  return{status:apiCalls===0?"unchanged":"refreshed",base,...gridRegistry,apiCalls,success,failed,failures:settled.map((item,index)=>item.status==="rejected"?{gridKey:gridRegistry.grids[index].gridKey,code:item.reason?.code||"UNKNOWN",status:item.reason?.status??null}:null).filter(Boolean)};
}
function setCacheAdapter(adapter){if(!adapter||typeof adapter.get!=="function"||typeof adapter.set!=="function")throw new TypeError("Cache adapter requires get/set");persistentCache=adapter}
function getTrafficStats(){resetStatsIfNeeded();return{...stats,inFlight:inFlight.size,cooldownGrids:cooldowns.size}}
function resetRuntimeState(){memoryStore.clear();lastKnownGood.clear();inFlight.clear();cooldowns.clear();latestRefreshedBase=null;stats.date=null;resetStatsIfNeeded()}

module.exports={KMA_VILLAGE_ENDPOINT,KMA_BUOY_CACHE_KEY,KMA_LATEST_BASE_CACHE_KEY,ISSUE_HOURS,parseKmaPcp,normalizeKmaSky,normalizeKmaPty,normalizeItems,getLatestAvailableKmaBaseTime,cacheKey,lastKnownGoodKey,fetchKmaVillageForecast,getKmaForecast,refreshKmaForecastCache,setCacheAdapter,getTrafficStats,resetRuntimeState,_runtime:{memoryStore,lastKnownGood,inFlight,cooldowns}};
