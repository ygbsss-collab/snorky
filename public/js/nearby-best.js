(function(){
"use strict";

const ALLOWED_RADII=[30,50,100,200,300];
const MIN_RECOMMENDATION_SCORE=50;
const MAX_RESULTS=3;
const POINT_PAGE_SIZE=1000;
const ENVIRONMENT_BATCH_SIZE=100;
const EVALUATION_CACHE_TTL=20*60*1000;
const evaluationCache=new Map();
let detailedFailureLogs=0;
const state={running:false,radius:100,coordinates:null};

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
function scoreLabel(score){const value=Number(score);if(!Number.isFinite(value))return"보통";if(value>=80)return"매우좋음";if(value>=65)return"좋음";if(value>=50)return"보통";if(value>=35)return"나쁨";return"매우나쁨"}
function activePoint(point){const points=Array.isArray(window.SNORKY_ACTIVE_POINTS)?window.SNORKY_ACTIVE_POINTS:[];return points.find(item=>String(item.supabaseId??item.id)===String(point.id))||point}
function pointImage(point){const images=Array.isArray(activePoint(point)?.images)?activePoint(point).images:[],primary=images.find(image=>image.isPrimary||image.is_primary)||images[0];return primary?.url||primary?.publicUrl||primary?.public_url||""}
function passesOfficialMarineAdvisoryGate(point){return (point.v12?.safety==="PASS")||(window.SNORKYMarineSafety?.statusForPoint(point).status==="PASS")}
function passesExistingHardSafetyGate(point){return point.v12?point.v12.safety!=="BLOCK":!point.hardLabel}
function selectRecommendablePoints(points,limit=MAX_RESULTS){
  return points
    .filter(point=>{
      const v12=point.v12;
      if(v12){
        return v12.safety==="PASS" && Number.isFinite(v12.conditionScore) && (v12.recommendation==="추천"||v12.recommendation==="주의");
      }
      return passesOfficialMarineAdvisoryGate(point)&&passesExistingHardSafetyGate(point)&&point.score>=MIN_RECOMMENDATION_SCORE;
    })
    .sort((a,b)=>{
      const distDiff=a.distance-b.distance;
      if(distDiff!==0)return distDiff;
      const scoreA=a.v12?.conditionScore??(Number.isFinite(a.score)?a.score:-Infinity);
      const scoreB=b.v12?.conditionScore??(Number.isFinite(b.score)?b.score:-Infinity);
      return scoreB-scoreA;
    })
    .slice(0,limit);
}
function valueAt(values,index){const value=values?.[index];return validCoordinate(value)?Number(value):null}

function createDialog(){
  const overlay=document.createElement("div");
  overlay.id="nearbyBestOverlay";
  overlay.className="nearby-best-overlay";
  overlay.setAttribute("aria-hidden","true");
  overlay.innerHTML=`<section class="nearby-best-dialog" role="dialog" aria-modal="true" aria-labelledby="nearbyBestTitle">
    <div class="nearby-best-head"><h2 id="nearbyBestTitle">🎯 내 주변 추천 BEST</h2><button class="nearby-best-close" type="button" aria-label="닫기">×</button></div>
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
function setRadius(radius){
  const next=Number(radius);if(!ALLOWED_RADII.includes(next))return state.radius;
  state.radius=next;
  const overlay=getDialog();
  overlay.querySelector(".nearby-best-radius-label").textContent=`${next}km`;
  overlay.querySelectorAll('input[name="nearbyBestRadius"]').forEach(input=>{input.checked=Number(input.value)===next});
  document.dispatchEvent(new CustomEvent("snorky:nearby-radius-change",{detail:{radius:next}}));
  return next;
}
function openAndSearch(radius){setRadius(radius);openDialog();requestLocation()}
function closeDialog(){const overlay=getDialog();overlay.classList.remove("open");overlay.setAttribute("aria-hidden","true");document.getElementById("nearbyBestButton")?.focus()}
function captureReturnState(){const dialog=getDialog().querySelector(".nearby-best-dialog");return{view:"nearbyBest",radius:state.radius,dialogScrollTop:dialog.scrollTop,pageScrollY:window.scrollY}}
function restoreReturnState(saved){openDialog();requestAnimationFrame(()=>{const dialog=getDialog().querySelector(".nearby-best-dialog");dialog.scrollTop=Number(saved?.dialogScrollTop)||0})}
function setStatus(message,isError=false){const results=getDialog().querySelector(".nearby-best-results");results.innerHTML=`<p class="nearby-best-status${isError?' error':''}">${escapeHtml(message)}</p>`}
function setLoading(message){getDialog().querySelector(".nearby-best-results").innerHTML=`<div class="best-loading">${escapeHtml(message)}</div>`}
function changeRadius(event){
  const radius=Number(event.target.value);if(!ALLOWED_RADII.includes(radius))return;
  setRadius(radius);
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

function createDiagnostics(){return{weatherRequests:0,marineRequests:0,weatherHttpErrors:0,marineHttpErrors:0,timeouts:0,status429:0,status403:0,status5xx:0}}
function stageError(stage,error,details={}){const wrapped=new Error(error?.message||String(error));wrapped.stage=stage;wrapped.cause=error;Object.assign(wrapped,details,error?.requestDetails?{requestDetails:error.requestDetails}:{});return wrapped}
async function fetchMarine(point,diagnostics){const cached=await window.SNORKYOpenMeteoMarineCache?.fetch(point.supabaseId??point.id,point.lat,point.lng);diagnostics.marineRequests+=1;if(cached)return cached;console.warn("[SNORKY NEARBY BEST] Marine 캐시 없음",point.name);return null}

function buildCurrentRow(marine,kmaCache){
  const marineTimes=marine?.hourly?.time||[],marineIndex=new Map(marineTimes.map((time,index)=>[time,index]));
  const kmaTimes=window.SNORKYKmaWeatherCache?.hourlyTimestamps(kmaCache)||[];
  const allTimes=[...new Set([...marineTimes,...kmaTimes])].sort();
  const now=Date.now(),available=allTimes.map(time=>({time,mIndex:marineIndex.get(time)})).filter(item=>item.mIndex!==undefined&&new Date(`${item.time}:00+09:00`).getTime()<=now);
  const selected=available.at(-1);if(!selected)throw new Error("현재 시간대의 해양 예보가 없습니다.");
  const mi=selected.mIndex;
  const kma=window.SNORKYKmaWeatherCache?.nearestHourly(kmaCache,selected.time);
  const merged=window.SNORKYKmaWeatherCache?.mergeWeatherData(kma,{});
  const row={
    date:selected.time.slice(0,10),hour:Number(selected.time.slice(11,13)),timestamp:selected.time,
    temperature:merged?.temperature??null,wind_speed:merged?.windSpeed??null,wind_direction_degree:merged?.windDirectionDegree??null,
    wave_height:valueAt(marine.hourly.wave_height,mi),waveDirectionDegree:valueAt(marine.hourly.wave_direction,mi),swell_height:valueAt(marine.hourly.swell_wave_height,mi),wave_period:valueAt(marine.hourly.wave_period,mi),swellDirectionDegree:valueAt(marine.hourly.swell_wave_direction,mi),swellPeriod:valueAt(marine.hourly.swell_wave_period,mi),current_speed:valueAt(marine.hourly.ocean_current_velocity,mi),current_direction:valueAt(marine.hourly.ocean_current_direction,mi),sea_temperature:valueAt(marine.hourly.sea_surface_temperature,mi),
    precipitation:merged?.precipitation??null,precipitation_probability:merged?.precipitationProbability??null,cloud_cover:null,pressure:null,precipitation_24h:null,isMockData:false,
    weather_source:kma?"kma_cache":"unavailable"
  };
  row.wind_direction=typeof window.degreeToKoreanWindDirection==="function"?window.degreeToKoreanWindDirection(row.wind_direction_degree):"--";
  const visibility=window.estimateUnderwaterVisibility(row);row.underwater_visibility_score=visibility.score;row.underwater_visibility_label=visibility.label;row.underwater_visibility_range=visibility.range;
  return row;
}
async function scoreCandidate(point,diagnostics){
  const cacheKey=String(point.id??point.supabaseId),cached=evaluationCache.get(cacheKey);
  if(cached&&Date.now()-cached.cachedAt<EVALUATION_CACHE_TTL)return{...point,...cached.result,fromCache:true};
  const kmaRequest=window.SNORKYKmaWeatherCache?.fetch(point.lat,point.lng)??Promise.resolve(null),[marineResult,kmaResult]=await Promise.allSettled([fetchMarine(point,diagnostics),kmaRequest]);
  if(marineResult.status==="rejected")throw stageError("marine",marineResult.reason);
  const marine=marineResult.value;
  if(!marine)throw stageError("marine",new Error("해양 데이터를 불러오지 못했습니다."));
  let row;
  try{row=buildCurrentRow(marine,kmaResult.status==="fulfilled"?kmaResult.value:null)}catch(error){throw stageError("environment",error)}
  let result;
  try{result=window.calculateEnvironmentComponentPreview({environment:point.environment},row)}catch(error){throw stageError("score",error)}
  if(!Number.isFinite(result?.score))throw stageError("score",new Error("Today 점수 결과가 유효하지 않습니다."));
  // V1.2 공통 평가 엔진 추가 호출 — 기존 score/hardLabel 흐름은 그대로 유지
  let v12=null;
  try{
    if(window.SNORKYEval?.evaluateWithMarineKma){
      v12=window.SNORKYEval.evaluateWithMarineKma(row,{...point,environment:point.environment},marine);
    }
  }catch(v12Err){console.warn("[SNORKYEval] scoreCandidate v12 평가 실패",v12Err?.message)}
  const scored={score:result.score,hardLabel:result.hardLabel,timestamp:row.timestamp,row,v12,_marineRef:marine};
  evaluationCache.set(cacheKey,{cachedAt:Date.now(),result:scored});
  return {...point,...scored,fromCache:false};
}
async function mapWithConcurrency(items,limit,worker){
  const results=new Array(items.length);let next=0;
  async function run(){while(next<items.length){const index=next++,point=items[index];try{results[index]=await worker(point)}catch(error){const stage=error?.stage||"unknown";if(detailedFailureLogs<3){detailedFailureLogs+=1;console.error("[NearbyBEST] point calculation failed",{pointId:point.id??point.supabaseId,pointName:point.name,latitude:point.lat,longitude:point.lng,stage,error:error?.message||String(error),requests:error?.requestResults||[error?.requestDetails].filter(Boolean)})}results[index]={...point,stage,error:error?.message||String(error)}}}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},run));return results;
}

function reusableTodayScores(){
  const snapshot=window.SNORKYTodayBest?.getSnapshot?.();
  if(!snapshot||Date.now()-Number(snapshot.createdAt)>EVALUATION_CACHE_TTL)return new Map();
  return new Map((snapshot.rows||[]).filter(point=>!point.error&&(Number.isFinite(point.v12?.conditionScore)||Number.isFinite(point.score))).map(point=>[String(point.id),point]));
}

async function runNearbyBest(latitude,longitude,radius){
  const diagnostics=createDiagnostics();
  detailedFailureLogs=0;
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
    const distanceSorted=[...points].sort((a,b)=>a.distance-b.distance),nearest=distanceSorted.slice(0,10),pointsInRadius=distanceSorted.filter(point=>point.distance<=radius);
    const candidates=pointsInRadius.filter(passesOfficialMarineAdvisoryGate);
    if(blockedByMarineSafety.length)console.info("[SNORKY NEARBY BEST] 해상특보 제외 Point",blockedByMarineSafety.map(point=>({point:point.name,region:point.region,status:"BLOCK"})));
    console.info("[SNORKY NEARBY BEST] 반경 내 등록 Point 수",pointsInRadius.length);
    console.info("[SNORKY NEARBY BEST] Safety 적용 후 BEST 후보 수",candidates.length);console.table(candidates.map(point=>({Point:point.name,Region:point.region,DistanceKm:Number(point.distance.toFixed(2))})));
    if(!pointsInRadius.length){renderNoCandidates(nearest,radius);publishHomeResults([],radius);logDiagnostics(diagnostics,[],[]);return}
    if(!candidates.length){renderResults([],[],0,radius,nearest);publishHomeResults([],radius);logDiagnostics(diagnostics,[],[]);return}
    setLoading("내 주변 포인트를 확인 중입니다.");
    const environments=await fetchCandidateEnvironments(sb,candidates);
    const environmentById=new Map(environments.map(point=>[String(point.id),point.environment]));
    const todayScores=reusableTodayScores();
    const prepared=candidates.map(point=>({...point,environment:environmentById.get(String(point.id))??null}));
    const reusable=prepared.filter(point=>todayScores.has(String(point.id))).map(point=>{const today=todayScores.get(String(point.id));return{...point,score:today.score,hardLabel:today.hardLabel,timestamp:today.timestamp,row:today.row,v12:today.v12,_marineRef:today._marineRef,fromTodaySnapshot:true}});
    const pending=prepared.filter(point=>!todayScores.has(String(point.id)));
    const evaluated=await mapWithConcurrency(pending,3,point=>scoreCandidate(point,diagnostics));
    const scored=prepared.map(point=>reusable.find(item=>String(item.id)===String(point.id))||evaluated.find(item=>String(item.id)===String(point.id)));
    const successful=scored.filter(point=>!point.error&&(Number.isFinite(point.v12?.conditionScore)||Number.isFinite(point.score)));
    const failed=scored.filter(point=>point.error);failed.forEach(point=>console.warn("[SNORKY NEARBY BEST] 후보 계산 실패",{pointId:point.id,pointName:point.name,stage:point.stage||"unknown",error:point.error}));
    console.info("[SNORKY NEARBY BEST] Today 계산 결과 재사용",reusable.length);
    console.info(`[NearbyBEST ${radius}km VERIFY]`,{candidates:candidates.length,snapshotHits:reusable.length,snapshotMisses:pending.length,apiRequests:diagnostics.weatherRequests+diagnostics.marineRequests,success:successful.length,failed:failed.length,weatherHttpErrors:diagnostics.weatherHttpErrors,marineHttpErrors:diagnostics.marineHttpErrors,timeouts:diagnostics.timeouts,status429:diagnostics.status429,status403:diagnostics.status403,status5xx:diagnostics.status5xx});
    console.table(scored.map(point=>({Point:point.name,DistanceKm:Number(point.distance.toFixed(2)),Score:point.v12?.conditionScore!=null?Math.round(point.v12.conditionScore):(Number.isFinite(point.score)?point.score:"--"),Recommendation:point.v12?.recommendation||"--",HardSafety:point.v12?.safety||point.hardLabel||"NONE",Error:point.error||""})));
    const homeRecommendations=selectRecommendablePoints(successful,100),recommendations=homeRecommendations.slice(0,MAX_RESULTS);
    renderResults(successful,homeRecommendations,failed.length,radius,nearest);publishHomeResults(homeRecommendations,radius);logDiagnostics(diagnostics,scored,recommendations);
  }catch(error){console.error("[SNORKY NEARBY BEST] 실행 실패",error);setStatus(error?.message||"내 주변 포인트를 확인하지 못했습니다. 기존 기능은 계속 사용할 수 있습니다.",true);document.dispatchEvent(new CustomEvent("snorky:nearby-best-error",{detail:error}));logDiagnostics(diagnostics,[],[])}
}
function publishHomeResults(recommendations,radius){
  const active=Array.isArray(window.SNORKY_ACTIVE_POINTS)?window.SNORKY_ACTIVE_POINTS:[],byId=new Map(active.flatMap(point=>[[String(point.supabaseId??""),point],[String(point.id??""),point]]));
  const rows=recommendations.map(point=>({...byId.get(String(point.id)),...point,images:byId.get(String(point.id))?.images||[],v12:point.v12}));
  document.dispatchEvent(new CustomEvent("snorky:nearby-best-ready",{detail:{rows,radius,coordinates:state.coordinates}}));
}
function renderNearbyPoints(points){
  if(!points.length)return"";
  return`<section class="nearby-points-section"><h3>📍 가까운 포인트</h3><ul class="nearby-best-list">${points.map((point,index)=>{const image=pointImage(point),safety=window.SNORKYMarineSafety?.statusForPoint(point),notice=safety?.status==="BLOCK"?" · 해상특보":safety?.status==="UNKNOWN"?" · 특보 확인 불가":"";return`<li class="nearby-best-item nearby-detail-card nearby-point-item" data-supabase-point-id="${escapeHtml(point.id)}" role="button" tabindex="0" aria-label="${escapeHtml(point.name)} 상세 보기"${index>=3?' hidden data-nearby-extra="points"':''}><span class="nearby-detail-photo">${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy">`:""}</span><div class="nearby-best-content"><div class="nearby-best-title"><div class="nearby-best-name">${escapeHtml(point.name)}</div>${point.region?`<span class="nearby-best-region">${escapeHtml(point.region)}</span>`:""}</div><div class="nearby-best-meta">${point.distance.toFixed(1)}km${notice}</div></div><span class="nearby-best-chevron" aria-hidden="true">›</span></li>`}).join("")}</ul>${points.length>3?'<div class="nearby-detail-actions"><button type="button" data-nearby-toggle="points">더보기 ›</button></div>':''}</section>`;
}
function renderNoCandidates(nearest,radius){
  getDialog().querySelector(".nearby-best-results").innerHTML=`<section class="nearby-recommendations-section"><h3>🏆 내 주변 추천 BEST</h3><p class="nearby-best-status"><strong>이 구역 내에는 추천할 포인트가 없어요</strong><br>범위를 넓혀보세요</p></section>${renderNearbyPoints(nearest)}`;
}
function renderResults(successful,recommendations,failedCount,radius,nearest){
  const results=getDialog().querySelector(".nearby-best-results");
  if(!successful.length&&failedCount){results.innerHTML=`<section class="nearby-recommendations-section"><h3>🏆 내 주변 추천 BEST</h3><p class="nearby-best-status error"><strong>이 구역 내에는 추천할 포인트가 없어요</strong><br>범위를 넓혀보세요</p></section>${renderNearbyPoints(nearest)}`;return}
  if(!recommendations.length){results.innerHTML=`<section class="nearby-recommendations-section"><h3>🏆 내 주변 추천 BEST</h3><p class="nearby-best-status"><strong>이 구역 내에는 추천할 포인트가 없어요</strong><br>범위를 넓혀보세요</p></section>${renderNearbyPoints(nearest)}`;return}
  results.innerHTML=`<section class="nearby-recommendations-section"><h3>🏆 내 주변 추천 BEST</h3><ol class="nearby-best-list">${recommendations.slice(0,3).map((point,index)=>{
    const image=pointImage(point);
    const v12=point.v12;
    const scoreVal=v12?.conditionScore!=null?Math.round(v12.conditionScore):(Number.isFinite(point.score)?point.score:null);
    const scoreText=scoreVal!=null?`${scoreVal}점`:"--";
    const recText=v12?.recommendation||(Number.isFinite(scoreVal)?scoreLabel(scoreVal):"보통");
    return`<li class="nearby-best-item nearby-detail-card" data-supabase-point-id="${escapeHtml(point.id)}" role="button" tabindex="0" aria-label="${escapeHtml(point.name)} 상세 보기"><span class="nearby-detail-rank rank-${index+1}">${index+1}</span><span class="nearby-detail-photo">${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy">`:""}</span><div class="nearby-best-content"><div class="nearby-best-title"><div class="nearby-best-name">${escapeHtml(point.name)}</div>${point.region?`<span class="nearby-best-region">${escapeHtml(point.region)}</span>`:""}</div><div class="nearby-best-meta">${scoreText} · ${escapeHtml(recText)} · ${point.distance.toFixed(1)}km</div></div><span class="nearby-best-chevron" aria-hidden="true">›</span></li>`;
  }).join("")}</ol>${failedCount?`<p class="nearby-best-status">일부 후보 ${failedCount}개의 예보를 불러오지 못했습니다.</p>`:""}</section>${renderNearbyPoints(nearest)}`;
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
function normalizeNearbyTitles(){document.querySelectorAll("#nearbyBestOverlay .nearby-recommendations-section h3").forEach(title=>{if(title.textContent.trim()!=="🏆 내 주변 추천 BEST")title.textContent="🏆 내 주변 추천 BEST"})}
new MutationObserver(normalizeNearbyTitles).observe(document.body,{childList:true,subtree:true});
document.addEventListener("click",event=>{const button=event.target.closest?.("#nearbyBestOverlay [data-nearby-toggle]");if(!button)return;const group=button.dataset.nearbyToggle,items=[...document.querySelectorAll(`#nearbyBestOverlay [data-nearby-extra="${group}"]`)],expand=items.some(item=>item.hidden);items.forEach(item=>item.hidden=!expand);button.textContent=expand?"접기 ∧":"더보기 ›"});
document.addEventListener("click",event=>{const row=event.target.closest?.("#nearbyBestOverlay [data-supabase-point-id]");if(row)openPointDetail(row)});
document.addEventListener("keydown",event=>{if(event.key!=="Enter"&&event.key!==" ")return;const row=event.target.closest?.("#nearbyBestOverlay [data-supabase-point-id]");if(!row)return;event.preventDefault();openPointDetail(row)});
function openPointDetail(row){const source=row.closest(".nearby-points-section")?"nearbyPoint":"nearbyBest",returnState=captureReturnState(),pointId=row.dataset.supabasePointId;closeDialog();if(!window.SNORKYPointDetail?.openBySupabaseId(pointId,source,returnState))console.warn("[SNORKY BEST] Point 상세 진입 실패",{pointId})}
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&getDialog().classList.contains("open"))closeDialog()});
async function evaluatePoints(points){
  const diagnostics=createDiagnostics(),normalized=points.filter(point=>isRecommendationActive(point)&&validPointCoordinates(point)).map(point=>({id:point.supabaseId||point.id,name:point.name||point[0],region:point.region||"",warningAreaCode:point.warningAreaCode||point.warning_area_code||null,lat:Number(point.lat??point[1]),lng:Number(point.lng??point[2]),environment:point.environment??null}));
  const scored=await mapWithConcurrency(normalized,3,point=>scoreCandidate(point,diagnostics));
  return{scored,diagnostics};
}
window.SNORKYNearbyBest={open:openDialog,openAndSearch,setRadius,getRadius:()=>state.radius,getCoordinates:()=>state.coordinates,requestLocation,runNearbyBest,haversineKm,captureReturnState,restoreReturnState,evaluatePoints,clearEvaluationCache:()=>evaluationCache.clear()};
})();
