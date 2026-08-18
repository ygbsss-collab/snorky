(function(){
"use strict";
const requests=new Map(),TIMEOUT_MS=6000;
async function request(pointId,latitude,longitude){const config=window.SNORKY_SUPABASE_CONFIG;if(!config?.url||!config?.publishableKey)return null;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);try{const response=await fetch(`${config.url.replace(/\/$/,"")}/functions/v1/open-meteo-marine-cache`,{method:"POST",signal:controller.signal,headers:{apikey:config.publishableKey,Authorization:`Bearer ${config.publishableKey}`,"Content-Type":"application/json"},body:JSON.stringify({pointId,latitude,longitude})});if(!response.ok)return null;const payload=await response.json();if(payload.status!=="READY"||payload.stale||!Array.isArray(payload.hourly?.time)||!payload.hourly.time.length)return null;return{hourly:payload.hourly,timezone:"Asia/Seoul",source:"supabase_open_meteo_marine_cache",fetchedAt:payload.fetchedAt}}catch(error){if(error?.name!=="AbortError")console.warn("[SNORKY MARINE CACHE] direct fallback",error?.message||String(error));return null}finally{clearTimeout(timer)}}
function fetchCache(pointId,latitude,longitude){
  const key=`${pointId||"coordinate"}:${Number(latitude).toFixed(4)}:${Number(longitude).toFixed(4)}`;
  if(!requests.has(key)){
    const promise=request(pointId,latitude,longitude).then(result=>{
      if(!result){requests.delete(key);return null;}
      return result;
    }).catch(error=>{
      requests.delete(key);
      return null;
    });
    requests.set(key,promise);
  }
  return requests.get(key);
}
window.SNORKYOpenMeteoMarineCache=Object.freeze({fetch:fetchCache,clear:()=>requests.clear()});
})();
