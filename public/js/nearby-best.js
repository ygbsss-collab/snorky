(function(){
"use strict";

const ALLOWED_RADII=[30,50,100,200,300];
const MIN_RECOMMENDATION_SCORE=50;
const MAX_RESULTS=3;
const POINT_PAGE_SIZE=1000;
const ENVIRONMENT_BATCH_SIZE=100;
const EVALUATION_CACHE_TTL=20*60*1000;
const evaluationCache=new Map();
const state={running:false,radius:30,coordinates:null};

function escapeHtml(value){return String(value??"").replace(/[&<>"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[char])}
function toRadians(value){return value*Math.PI/180}
function haversineKm(lat1,lng1,lat2,lng2){
  const earthRadiusKm=6371,dLat=toRadians(lat2-lat1),dLng=toRadians(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRadians(lat1))*Math.cos(toRadians(lat2))*Math.sin(dLng/2)**2;
  return earthRadiusKm*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function validCoordinate(value){return value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value))}
function validPointCoordinates(point){return validCoordinate(point.lat)&&validCoordinate(point.lng)&&Number(point.lat)>=-90&&Number(point.lat)<=90&&Number(point.lng)>=-180&&Number(point.lng)<=180}
// When an active column is introduced, include it in POINT_LOCATION_COLUMNS and this predicate will exclude active=false rows.
function isRecommendationActive(point){return point.active!==false}
function scoreLabel(score){return window.getSnorkySeaConditionLabel?.(score)||"바다 상태를 확인할 수 없어요"}
function passesOfficialMarineAdvisoryGate(point){return window.SNORKYMarineSafety?.statusForPoint(point).status==="PASS"}
function passesExistingHardSafetyGate(point){return !point.hardLabel}
function selectRecommendablePoints(points){
  return points
    .filter(passesOfficialMarineAdvisoryGate)
    .filter(passesExistingHardSafetyGate)
    .filter(point=>point.score>=MIN_RECOMMENDATION_SCORE)
    .sort((a,b)=>b.score-a.score||a.distance-b.distance)
    .slice(0,MAX_RESULTS);
}
function valueAt(values,index){const value=values?.[index];return validCoordinate(value)?Number(value):null}

function createDialog(){
  const overlay=document.createElement("div");
  overlay.id="nearbyBestOverlay";
  overlay.className="nearby-best-overlay";
  overlay.setAttribute("aria-hidden","true");
  overlay.innerHTML=`<section class="nearby-best-dialog" role="dialog" aria-modal="true" aria-labelledby="nearbyBestTitle">
    <div class="nearby-best-head"><h2 id="nearbyBestTitle">🎯 내 주변 BEST</h2><button class="nearby-best-close" type="button" aria-label="닫기">×</button></div>
    <p class="nearby-best-subtitle">현재 위치 기준 <span class="nearby-best-radius-label">${state.radius}km</span></p>
    <fieldset class="nearby-best-radii"><legend>검색 반경</legend>${ALLOWED_RADII.map(radius=>`<label><input type="radio" name="nearbyBestRadius" value="${radius}"${radius===state.radius?' checked':''}><span>${radius}km</span></label>`).join("")}</fieldset>
    <div class="nearby-best-notice">위치는 주변 포인트 검색에만 사용되며 저장하지 않습니다.</div>
    <button class="nearby-best-use" type="button">현재 위치로 찾기</button>
    <div class="nearby-best-results" aria-live="polite"></div>
  </section>`;
  document.body.appendChild(overlay);
  overlay.querySelector(".nearby-best-close").addEventListener("click",closeDialog);
  overlay.addEventListener("click",event=>{if(event.target===overlay)closeDialog()});
  overlay.querySelector(".nearby-best-use").addEventListener("click",requestLocation);
  overlay.querySelectorAll('input[name="nearbyBestRadius"]').forEach(input=>input.addEventListener("change",changeRadius));
  return overlay;
}
function getDialog(){return document.getElementById("nearbyBestOverlay")||createDialog()}
function openDialog(){const overlay=getDialog();overlay.classList.add("open");overlay.setAttribute("aria-hidden","false");overlay.querySelector(".nearby-best-close").focus()}
function closeDialog(){const overlay=getDialog();overlay.classList.remove("open");overlay.setAttribute("aria-hidden","true");document.getElementById("nearbyBestButton")?.focus()}
function captureReturnState(){const dialog=getDialog().querySelector(".nearby-best-dialog");return{view:"nearbyBest",radius:state.radius,dialogScrollTop:dialog.scrollTop,pageScrollY:window.scrollY}}
function restoreReturnState(saved){openDialog();requestAnimationFrame(()=>{const dialog=getDialog().querySelector(".nearby-best-dialog");dialog.scrollTop=Number(saved?.dialogScrollTop)||0})}
function setStatus(message,isError=false){const results=getDialog().querySelector(".nearby-best-results");results.innerHTML=`<p class="nearby-best-status${isError?' error':''}">${escapeHtml(message)}</p>`}
function setLoading(message){getDialog().querySelector(".nearby-best-results").innerHTML=`<div class="best-loading">${escapeHtml(message)}</div>`}
function changeRadius(event){
  const radius=Number(event.target.value);if(!ALLOWED_RADII.includes(radius))return;
  state.radius=radius;getDialog().querySelector(".nearby-best-radius-label").textContent=`${radius}km`;
  if(!state.coordinates||state.running)return;
  state.running=true;const button=getDialog().querySelector(".nearby-best-use");button.disabled=true;button.textContent="내 주변 포인트를 확인 중입니다.";
  runNearbyBest(state.coordinates.latitude,state.coordinates.longitude,radius).finally(finishRun);
}

function requestLocation(){
  if(state.running)return;
  if(!navigator.geolocation){setStatus("이 브라우저에서는 현재 위치 기능을 사용할 수 없습니다. 지역을 직접 선택해주세요.",true);return}
  state.running=true;
  const button=getDialog().querySelector(".nearby-best-use");button.disabled=true;button.textContent="현재 위치 확인 중…";setStatus("브라우저의 위치 권한을 확인하고 있습니다.");
  navigator.geolocation.getCurrentPosition(
    position=>{state.coordinates={latitude:position.coords.latitude,longitude:position.coords.longitude};runNearbyBest(state.coordinates.latitude,state.coordinates.longitude,state.radius).finally(finishRun)},
    error=>{setStatus(locationErrorMessage(error),true);finishRun()},
    {enableHighAccuracy:false,timeout:10000,maximumAge:5*60*1000}
  );
}
function finishRun(){state.running=false;const button=getDialog().querySelector(".nearby-best-use");button.disabled=false;button.textContent="현재 위치로 다시 찾기"}
function locationErrorMessage(error){
  if(error?.code===1)return "현재 위치를 사용할 수 없습니다. 지역을 직접 선택해주세요.";
  if(error?.code===2)return "현재 위치를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.";
  if(error?.code===3)return "현재 위치 확인 시간이 초과되었습니다. 다시 시도해주세요.";
  return "현재 위치를 가져오는 중 오류가 발생했습니다. 기존 지역 선택 기능은 계속 사용할 수 있습니다.";
}

async function waitForSupabase(){
  const started=Date.now();
  while(Date.now()-started<10000){
    try{if(window.supabase?.createClient&&window.getSnorkySupabase)return window.getSnorkySupabase()}catch(error){throw error}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error("포인트 정보를 불러올 준비가 되지 않았습니다. 잠시 후 다시 시도해주세요.");
}
async function selectOrThrow(query){const result=await query;if(result.error)throw result.error;return result.data||[]}
async function fetchAllPointLocations(sb){
  const rows=[];
  for(let from=0;;from+=POINT_PAGE_SIZE){
    const page=await selectOrThrow(sb.from("points").select("id,region_id,name,lat,lng,warning_area_code").order("id",{ascending:true}).range(from,from+POINT_PAGE_SIZE-1));
    rows.push(...page);if(page.length<POINT_PAGE_SIZE)return rows;
  }
}
async function fetchCandidateEnvironments(sb,candidates){
  const rows=[];
  for(let index=0;index<candidates.length;index+=ENVIRONMENT_BATCH_SIZE){
    rows.push(...await selectOrThrow(sb.from("points").select("id,environment").in("id",candidates.slice(index,index+ENVIRONMENT_BATCH_SIZE).map(point=>point.id))));
  }
  return rows;
}

function weatherUrl(point){return `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lng}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,precipitation_probability,cloud_cover,pressure_msl&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,cloud_cover_mean,sunrise,sunset&wind_speed_unit=ms&timezone=Asia%2FSeoul&forecast_days=7`}
function marineUrl(point,legacy=false){const fields=legacy?"wave_height,wave_period,swell_wave_height,swell_wave_direction,ocean_current_velocity,ocean_current_direction,sea_surface_temperature":"wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,ocean_current_velocity,ocean_current_direction,sea_surface_temperature";return `https://marine-api.open-meteo.com/v1/marine?latitude=${point.lat}&longitude=${point.lng}&hourly=${fields}&velocity_unit=ms&timezone=Asia%2FSeoul&forecast_days=7`}
async function fetchApi(url,type,diagnostics){diagnostics[type+"Requests"]+=1;const response=await fetch(url);if(!response.ok)throw new Error(`${type} API 오류 (${response.status})`);return response.json()}
async function fetchMarine(point,diagnostics){try{return await fetchApi(marineUrl(point),"marine",diagnostics)}catch(firstError){console.warn("[SNORKY NEARBY BEST] Marine 확장 필드 재시도",point.name,firstError);return fetchApi(marineUrl(point,true),"marine",diagnostics)}}

function buildCurrentRow(weather,marine){
  const weatherTimes=weather?.hourly?.time||[],marineTimes=marine?.hourly?.time||[],marineIndex=new Map(marineTimes.map((time,index)=>[time,index]));
  const now=Date.now(),available=weatherTimes.map((time,index)=>({time,index,mIndex:marineIndex.get(time)})).filter(item=>item.mIndex!==undefined&&new Date(`${item.time}:00+09:00`).getTime()<=now);
  const selected=available.at(-1);if(!selected)throw new Error("현재 시간대의 해양 예보가 없습니다.");
  const wi=selected.index,mi=selected.mIndex,previousRain=(weather.hourly.precipitation||[]).slice(Math.max(0,wi-23),wi+1).filter(value=>Number.isFinite(value));
  const row={
    date:selected.time.slice(0,10),hour:Number(selected.time.slice(11,13)),timestamp:selected.time,
    temperature:valueAt(weather.hourly.temperature_2m,wi),wind_speed:valueAt(weather.hourly.wind_speed_10m,wi),wind_direction_degree:valueAt(weather.hourly.wind_direction_10m,wi),
    wave_height:valueAt(marine.hourly.wave_height,mi),waveDirectionDegree:valueAt(marine.hourly.wave_direction,mi),swell_height:valueAt(marine.hourly.swell_wave_height,mi),wave_period:valueAt(marine.hourly.wave_period,mi),swellDirectionDegree:valueAt(marine.hourly.swell_wave_direction,mi),swellPeriod:valueAt(marine.hourly.swell_wave_period,mi),current_speed:valueAt(marine.hourly.ocean_current_velocity,mi),current_direction:valueAt(marine.hourly.ocean_current_direction,mi),sea_temperature:valueAt(marine.hourly.sea_surface_temperature,mi),
    precipitation:valueAt(weather.hourly.precipitation,wi),precipitation_probability:valueAt(weather.hourly.precipitation_probability,wi),cloud_cover:valueAt(weather.hourly.cloud_cover,wi),pressure:valueAt(weather.hourly.pressure_msl,wi),precipitation_24h:previousRain.length?previousRain.reduce((sum,value)=>sum+value,0):null,isMockData:false
  };
  row.wind_direction=typeof window.degreeToKoreanWindDirection==="function"?window.degreeToKoreanWindDirection(row.wind_direction_degree):"--";
  const visibility=window.estimateUnderwaterVisibility(row);row.underwater_visibility_score=visibility.score;row.underwater_visibility_label=visibility.label;row.underwater_visibility_range=visibility.range;
  return row;
}
async function scoreCandidate(point,diagnostics){
  const cacheKey=String(point.id??point.supabaseId),cached=evaluationCache.get(cacheKey);
  if(cached&&Date.now()-cached.cachedAt<EVALUATION_CACHE_TTL)return{...point,...cached.result,fromCache:true};
  const [weather,marine]=await Promise.all([fetchApi(weatherUrl(point),"weather",diagnostics),fetchMarine(point,diagnostics)]);
  const row=buildCurrentRow(weather,marine),result=window.calculateEnvironmentComponentPreview({environment:point.environment},row);
  const scored={score:result.score,hardLabel:result.hardLabel,timestamp:row.timestamp,row};
  evaluationCache.set(cacheKey,{cachedAt:Date.now(),result:scored});
  return {...point,...scored,fromCache:false};
}
async function mapWithConcurrency(items,limit,worker){
  const results=new Array(items.length);let next=0;
  async function run(){while(next<items.length){const index=next++;try{results[index]=await worker(items[index])}catch(error){results[index]={...items[index],error:error?.message||String(error)}}}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},run));return results;
}

async function runNearbyBest(latitude,longitude,radius){
  const diagnostics={weatherRequests:0,marineRequests:0};
  try{
    console.info("[SNORKY NEARBY BEST] 현재 위치",{latitude,longitude});console.info("[SNORKY NEARBY BEST] 선택 반경",`${radius}km`);setLoading("내 주변 포인트를 확인 중입니다.");
    const sb=await waitForSupabase();
    await window.SNORKYMarineSafety?.ready;
    const [regions,pointRows]=await Promise.all([selectOrThrow(sb.from("regions").select("id,name,warning_area_code")),fetchAllPointLocations(sb)]);
    const regionById=new Map(regions.map(region=>[String(region.id),region]));
    const invalidPoints=pointRows.filter(point=>!validPointCoordinates(point));
    invalidPoints.forEach(point=>console.warn("[SNORKY NEARBY BEST] INVALID_COORDINATE",{id:point.id,name:point.name,lat:point.lat,lng:point.lng}));
    const points=pointRows.filter(point=>isRecommendationActive(point)&&validPointCoordinates(point)).map(point=>{const regionItem=regionById.get(String(point.region_id));return{id:point.id,name:point.name,region:regionItem?.name||"",warningAreaCode:point.warning_area_code||regionItem?.warning_area_code||null,lat:Number(point.lat),lng:Number(point.lng),distance:haversineKm(latitude,longitude,Number(point.lat),Number(point.lng))}});
    window.SNORKYMarineSafety?.registerPoints(points);
    console.info("[SNORKY NEARBY BEST] Supabase 전체 Point 수",pointRows.length);
    const blockedByMarineSafety=points.filter(point=>point.distance<=radius&&!passesOfficialMarineAdvisoryGate(point));
    const distanceSorted=[...points].sort((a,b)=>a.distance-b.distance),nearest=distanceSorted.slice(0,3),pointsInRadius=distanceSorted.filter(point=>point.distance<=radius);
    const candidates=pointsInRadius.filter(passesOfficialMarineAdvisoryGate);
    if(blockedByMarineSafety.length)console.info("[SNORKY NEARBY BEST] 해상특보 제외 Point",blockedByMarineSafety.map(point=>({point:point.name,region:point.region,status:"BLOCK"})));
    console.info("[SNORKY NEARBY BEST] 반경 내 등록 Point 수",pointsInRadius.length);
    console.info("[SNORKY NEARBY BEST] Safety 적용 후 BEST 후보 수",candidates.length);console.table(candidates.map(point=>({Point:point.name,Region:point.region,DistanceKm:Number(point.distance.toFixed(2))})));
    if(!pointsInRadius.length){renderNoCandidates(nearest,radius);logDiagnostics(diagnostics,[],[]);return}
    if(!candidates.length){renderResults([],[],0,radius,nearest);logDiagnostics(diagnostics,[],[]);return}
    setLoading("내 주변 포인트를 확인 중입니다.");
    const environments=await fetchCandidateEnvironments(sb,candidates);
    const environmentById=new Map(environments.map(point=>[String(point.id),point.environment]));
    const scored=await mapWithConcurrency(candidates,4,point=>scoreCandidate({...point,environment:environmentById.get(String(point.id))??null},diagnostics));
    const successful=scored.filter(point=>!point.error&&Number.isFinite(point.score));
    const failed=scored.filter(point=>point.error);failed.forEach(point=>console.warn("[SNORKY NEARBY BEST] 후보 계산 실패",point.name,point.error));
    console.table(scored.map(point=>({Point:point.name,DistanceKm:Number(point.distance.toFixed(2)),Score:Number.isFinite(point.score)?point.score:"--",HardSafety:point.hardLabel||"NONE",Error:point.error||""})));
    const recommendations=selectRecommendablePoints(successful);
    renderResults(successful,recommendations,failed.length,radius,nearest);logDiagnostics(diagnostics,scored,recommendations);
  }catch(error){console.error("[SNORKY NEARBY BEST] 실행 실패",error);setStatus(error?.message||"내 주변 포인트를 확인하지 못했습니다. 기존 기능은 계속 사용할 수 있습니다.",true);logDiagnostics(diagnostics,[],[])}
}
function renderNearbyPoints(points){
  if(!points.length)return"";
  return`<section class="nearby-points-section"><h3>📍 가까운 포인트</h3><ul class="nearby-best-list">${points.map(point=>{const safety=window.SNORKYMarineSafety?.statusForPoint(point),notice=safety?.status==="BLOCK"?" · ⚠️ 해상특보":safety?.status==="UNKNOWN"?" · 특보 확인 불가":"";return`<li class="nearby-best-item nearby-point-item" data-supabase-point-id="${escapeHtml(point.id)}" role="button" tabindex="0" aria-label="${escapeHtml(point.name)} 상세 보기"><span class="nearby-best-rank">📍</span><div class="nearby-best-content"><div class="nearby-best-title"><div class="nearby-best-name">${escapeHtml(point.name)}</div>${point.region?`<span class="nearby-best-region">${escapeHtml(point.region)}</span>`:""}</div><div class="nearby-best-meta">${point.distance.toFixed(1)}km${notice}</div></div><span class="nearby-best-chevron" aria-hidden="true">›</span></li>`}).join("")}</ul></section>`;
}
function renderNoCandidates(nearest,radius){
  const expandMessage=radius===30?'50km, 100km, 200km 또는 300km로 반경을 넓혀보세요.':radius===50?'100km, 200km 또는 300km로 반경을 넓혀보세요.':radius===100?'200km 또는 300km로 반경을 넓혀보세요.':radius===200?'300km로 반경을 넓혀보세요.':'현재 선택할 수 있는 최대 반경입니다.';
  getDialog().querySelector(".nearby-best-results").innerHTML=`<section class="nearby-recommendations-section"><h3>🏆 내 주변 BEST</h3><p class="nearby-best-status"><strong>현재 추천할 만한 포인트가 없습니다</strong><br>현재 위치 기준 ${radius}km 이내에 등록된 포인트가 없습니다.<br>${expandMessage}</p></section>${renderNearbyPoints(nearest)}`;
}
function renderResults(successful,recommendations,failedCount,radius,nearest){
  const results=getDialog().querySelector(".nearby-best-results");
  if(!successful.length&&failedCount){results.innerHTML=`<section class="nearby-recommendations-section"><h3>🏆 내 주변 BEST</h3><p class="nearby-best-status error"><strong>현재 추천할 만한 포인트가 없습니다</strong><br>주변 후보의 현재 조건을 계산하지 못했습니다.</p><p class="nearby-best-status">계산 실패 ${failedCount}개</p></section>${renderNearbyPoints(nearest)}`;return}
  if(!recommendations.length){const detail=radius===300?'300km 범위에서도 추천 조건을 만족하는 포인트가 없어요.':`선택한 ${radius}km 범위의 바다 조건이 좋지 않습니다.`;results.innerHTML=`<section class="nearby-recommendations-section"><h3>🏆 내 주변 BEST</h3><p class="nearby-best-status"><strong>현재 추천할 만한 포인트가 없습니다</strong><br>${detail}</p></section>${renderNearbyPoints(nearest)}`;return}
  const medals=["🥇","🥈","🥉"];
  results.innerHTML=`<section class="nearby-recommendations-section"><h3>🏆 내 주변 BEST</h3><ol class="nearby-best-list">${recommendations.map((point,index)=>`<li class="nearby-best-item" data-supabase-point-id="${escapeHtml(point.id)}" role="button" tabindex="0" aria-label="${escapeHtml(point.name)} 상세 보기"><span class="nearby-best-rank">${medals[index]}</span><div class="nearby-best-content"><div class="nearby-best-title"><div class="nearby-best-name">${escapeHtml(point.name)}</div>${point.region?`<span class="nearby-best-region">${escapeHtml(point.region)}</span>`:""}</div><div class="nearby-best-meta">${point.score}점 · ${scoreLabel(point.score)} · ${point.distance.toFixed(1)}km</div></div><span class="nearby-best-chevron" aria-hidden="true">›</span></li>`).join("")}</ol>${failedCount?`<p class="nearby-best-status">일부 후보 ${failedCount}개의 예보를 불러오지 못했습니다.</p>`:""}</section>${renderNearbyPoints(nearest)}`;
}
function logDiagnostics(diagnostics,scored,recommendations){
  console.info("[SNORKY NEARBY BEST] 실제 Weather 요청 수",diagnostics.weatherRequests);
  console.info("[SNORKY NEARBY BEST] 실제 Marine 요청 수",diagnostics.marineRequests);
  console.info("[SNORKY NEARBY BEST] 추천 기준 통과 Point 수",recommendations.length);
  console.info(`RECOMMENDABLE_POINTS: ${recommendations.length}`);
  console.table(scored.map(point=>({Point:point.name,DistanceKm:Number(point.distance?.toFixed(2)),Score:Number.isFinite(point.score)?point.score:"--",HardSafety:point.hardLabel||"NONE"})));
  const medals=["🥇","🥈","🥉"];
  console.table(recommendations.map((point,index)=>({Medal:medals[index],Point:point.name,Score:point.score,DistanceKm:Number(point.distance.toFixed(2)),HardSafety:point.hardLabel||"NONE"})));
}

document.getElementById("nearbyBestButton")?.addEventListener("click",openDialog);
document.getElementById("nearbyBestButtonMobile")?.addEventListener("click",openDialog);
document.addEventListener("click",event=>{const row=event.target.closest?.("#nearbyBestOverlay [data-supabase-point-id]");if(row)openPointDetail(row)});
document.addEventListener("keydown",event=>{if(event.key!=="Enter"&&event.key!==" ")return;const row=event.target.closest?.("#nearbyBestOverlay [data-supabase-point-id]");if(!row)return;event.preventDefault();openPointDetail(row)});
function openPointDetail(row){const source=row.closest(".nearby-points-section")?"nearbyPoint":"nearbyBest",returnState=captureReturnState(),pointId=row.dataset.supabasePointId;closeDialog();if(!window.SNORKYPointDetail?.openBySupabaseId(pointId,source,returnState))console.warn("[SNORKY BEST] Point 상세 진입 실패",{pointId})}
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&getDialog().classList.contains("open"))closeDialog()});
async function evaluatePoints(points){
  const diagnostics={weatherRequests:0,marineRequests:0},normalized=points.filter(point=>isRecommendationActive(point)&&validPointCoordinates(point)).map(point=>({id:point.supabaseId||point.id,name:point.name||point[0],region:point.region||"",warningAreaCode:point.warningAreaCode||point.warning_area_code||null,lat:Number(point.lat??point[1]),lng:Number(point.lng??point[2]),environment:point.environment??null}));
  const scored=await mapWithConcurrency(normalized,4,point=>scoreCandidate(point,diagnostics));
  return{scored,diagnostics};
}
window.SNORKYNearbyBest={haversineKm,captureReturnState,restoreReturnState,evaluatePoints,clearEvaluationCache:()=>evaluationCache.clear()};
})();
