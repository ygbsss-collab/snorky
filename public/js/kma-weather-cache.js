(function(){
"use strict";
const FUNCTION_NAME="kma-weather-cache",TIMEOUT_MS=6000,gridRequests=new Map();
const finite=value=>value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));
function toGrid(latitude,longitude){const RE=6371.00877,GRID=5,SLAT1=30,SLAT2=60,OLON=126,OLAT=38,XO=43,YO=136,DEGRAD=Math.PI/180,re=RE/GRID,slat1=SLAT1*DEGRAD,slat2=SLAT2*DEGRAD,olon=OLON*DEGRAD,olat=OLAT*DEGRAD;let sn=Math.tan(Math.PI*.25+slat2*.5)/Math.tan(Math.PI*.25+slat1*.5);sn=Math.log(Math.cos(slat1)/Math.cos(slat2))/Math.log(sn);let sf=Math.tan(Math.PI*.25+slat1*.5);sf=Math.pow(sf,sn)*Math.cos(slat1)/sn;let ro=Math.tan(Math.PI*.25+olat*.5);ro=re*sf/Math.pow(ro,sn);let ra=Math.tan(Math.PI*.25+latitude*DEGRAD*.5);ra=re*sf/Math.pow(ra,sn);let theta=longitude*DEGRAD-olon;if(theta>Math.PI)theta-=2*Math.PI;if(theta< -Math.PI)theta+=2*Math.PI;theta*=sn;return{nx:Math.floor(ra*Math.sin(theta)+XO+.5),ny:Math.floor(ro-ra*Math.cos(theta)+YO+.5)}}
function normalizePayload(payload){if(payload?.status!=="READY"||payload.stale||!Array.isArray(payload?.forecastData?.hourly)||!Array.isArray(payload?.forecastData?.daily))return null;return payload}
async function requestGrid(nx,ny){
  const config=window.SNORKY_SUPABASE_CONFIG;if(!config?.url||!config?.publishableKey)return null;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try{const response=await fetch(`${config.url.replace(/\/$/,"")}/functions/v1/${FUNCTION_NAME}`,{method:"POST",signal:controller.signal,headers:{apikey:config.publishableKey,Authorization:`Bearer ${config.publishableKey}`,"Content-Type":"application/json"},body:JSON.stringify({nx,ny})});if(!response.ok)return null;return normalizePayload(await response.json())}catch(error){if(error?.name!=="AbortError")console.warn("[SNORKY KMA CACHE] fallback to Open-Meteo",error?.message||String(error));return null}finally{clearTimeout(timer)}
}
function fetchCache(latitude,longitude){
  if(!finite(latitude)||!finite(longitude))return Promise.resolve(null);
  const{nx,ny}=toGrid(Number(latitude),Number(longitude)),gridKey=`${nx}:${ny}`;
  if(!gridRequests.has(gridKey)){
    const promise=requestGrid(nx,ny).then(result=>{
      if(!result){gridRequests.delete(gridKey);return null;}
      return result;
    }).catch(error=>{
      gridRequests.delete(gridKey);
      return null;
    });
    gridRequests.set(gridKey,promise);
  }
  return gridRequests.get(gridKey);
}
function timestampMs(value){if(!value)return NaN;const text=String(value),withZone=/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)?text:`${text.length===13?text+":00":text}+09:00`;return new Date(withZone).getTime()}
function nearestHourly(cache,timestamp,maxMinutes=45){const rows=cache?.forecastData?.hourly;if(!Array.isArray(rows))return null;const target=timestampMs(timestamp);if(!Number.isFinite(target))return null;let best=null,difference=Infinity;for(const row of rows){const current=timestampMs(row?.datetime),delta=Math.abs(current-target);if(Number.isFinite(current)&&delta<difference&&delta<=maxMinutes*60000){best=row;difference=delta}}return best}
function hourlyTimestamps(cache){return(cache?.forecastData?.hourly||[]).map(row=>String(row?.datetime||"").slice(0,16)).filter(value=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))}
function dailyForDate(cache,date){const rows=cache?.forecastData?.daily;if(!Array.isArray(rows))return null;return rows.find(row=>String(row?.date||"").slice(0,10)===date)||null}
function number(primary,fallback){return finite(primary)?Number(primary):finite(fallback)?Number(fallback):null}
function precipitationMm(value){return finite(value?.mm)?Number(value.mm):finite(value)?Number(value):null}
function mergeWeatherData(kma,openMeteo={}){return{temperature:number(kma?.temperature,openMeteo.temperature),windSpeed:number(kma?.windSpeed,openMeteo.windSpeed),windDirectionDegree:number(kma?.windDirection,openMeteo.windDirectionDegree),precipitation:number(precipitationMm(kma?.precipitation),openMeteo.precipitation),precipitationProbability:number(kma?.precipitationProbability,openMeteo.precipitationProbability),cloudCover:number(null,openMeteo.cloudCover),pressure:number(null,openMeteo.pressure),source:kma?"kma_cache":"open_meteo"}}
function clearMemoryCache(){gridRequests.clear()}
window.SNORKYKmaWeatherCache=Object.freeze({fetch:fetchCache,toGrid,nearestHourly,hourlyTimestamps,dailyForDate,mergeWeatherData,clearMemoryCache,get requestCount(){return gridRequests.size}});
})();
