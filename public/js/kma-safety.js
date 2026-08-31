(function(){
"use strict";

const TEST_MODE=false;
const EDGE_FUNCTION_NAME="kma-warnings";
const state={status:"UNKNOWN",warnings:[],updatedAt:null,error:null};
const registeredAreaCodes=new Set();

function snapshot(){return{status:state.status,warnings:[...state.warnings],updatedAt:state.updatedAt,error:state.error}}
function pointAreaCodes(point){
  const codes=[];
  const add=(value,pattern)=>{const code=String(value||"").trim();if(pattern.test(code)&&!codes.includes(code))codes.push(code)};
  add(point?.warningAreaCode||point?.warning_area_code,/^S\d{7}$/);
  const lat=Number(point?.lat??point?.[1]),lng=Number(point?.lng??point?.[2]);
  if(Number.isFinite(lat)&&Number.isFinite(lng)&&typeof window.SNORKYWarningZones?.resolveWarningAreaCode==="function"){
    const resolved=window.SNORKYWarningZones.resolveWarningAreaCode(lat,lng);
    add(resolved,/^S\d{7}$/);
  }
  add(point?.region?.warningAreaCode||point?.region?.warning_area_code,/^S\d{7}$/);
  add(point?.landWarningAreaCode||point?.land_warning_area_code,/^L\d{7}$/);
  add(point?.region?.landWarningAreaCode||point?.region?.land_warning_area_code,/^L\d{7}$/);
  return codes;
}
function pointAreaCode(point){return pointAreaCodes(point).find(code=>code.startsWith("S"))||null}
function warningPriority(item){
  const key=`${item?.warningName||""}${item?.levelName||""}`;
  if(key==="태풍경보")return 1;if(key==="태풍주의보")return 2;
  if(key==="풍랑경보")return 3;if(key==="풍랑주의보")return 4;
  if(item?.warningName==="폭풍해일"||item?.warningName==="지진해일")return 5;
  if(key==="호우경보")return 6;if(key==="호우주의보")return 7;
  if(key==="강풍경보")return 8;if(key==="강풍주의보")return 9;
  return 99;
}
function statusForCodes(codes,areaName=null){
  const valid=[...new Set((codes||[]).filter(code=>/^[LS]\d{7}$/.test(code||"")))];
  if(!valid.length)return{status:"UNKNOWN",warningAreaCode:null,warningAreaCodes:[],areaName,warning:null,warnings:[]};
  if(state.status!=="READY")return{status:"UNKNOWN",warningAreaCode:valid[0],warningAreaCodes:valid,areaName,warning:null,warnings:[]};
  const matched=state.warnings.filter(item=>{
    if(!item.active)return false;
    const matchedArea=valid.find(code=>item.regId===code||item.regUp===code);
    if(!matchedArea)return false;
    return !matchedArea.startsWith("L")||["호우","강풍","태풍"].includes(String(item.warningName||""));
  });
  const deduped=[];
  const seen=new Set();
  matched.sort((a,b)=>warningPriority(a)-warningPriority(b)).forEach(item=>{const key=`${item.warningName||""}:${item.levelName||""}`;if(!seen.has(key)){seen.add(key);deduped.push(item)}});
  const warning=deduped[0]||null;
  return{status:warning?"BLOCK":"PASS",warningAreaCode:valid[0],warningAreaCodes:valid,areaName:areaName||warning?.areaName||null,warning,warnings:deduped};
}
function statusForCode(code,areaName=null){return statusForCodes([code],areaName)}
function statusForPoint(point){return statusForCodes(pointAreaCodes(point),point?.warningAreaName||null)}
function isBlocked(point){return statusForPoint(point).status==="BLOCK"}
function passesRecommendationGate(point){return statusForPoint(point).status==="PASS"}
function registerPoints(points){for(const point of points||[])for(const code of pointAreaCodes(point))registeredAreaCodes.add(code);renderBanner()}

function ensureBanner(){
  let banner=document.getElementById("kmaSafetyBanner");
  if(banner)return banner;
  const mountAnchor=document.getElementById("kmaSafetyBannerAnchor")||document.querySelector(".masthead");
  if(!mountAnchor)return null;
  const style=document.createElement("style");
  style.textContent=".kma-safety-banner{display:none;align-items:center;justify-content:center;gap:9px;margin:-1px 0 10px;padding:11px 16px;border:1px solid #ef9a9a;border-radius:13px;background:#fff1f0;color:#a61b1b;font-size:14px;font-weight:900;box-shadow:0 5px 14px rgba(166,27,27,.08)}.kma-safety-banner.visible{display:flex}.kma-safety-banner.unknown{border-color:#cbd5e1;background:#f8fafc;color:#475569}@media(max-width:700px){.kma-safety-banner{align-items:flex-start;flex-direction:column;gap:3px;margin-top:0;font-size:13px}}";
  document.head.appendChild(style);banner=document.createElement("div");banner.id="kmaSafetyBanner";banner.className="kma-safety-banner";banner.setAttribute("role","status");mountAnchor.insertAdjacentElement("afterend",banner);return banner;
}
function renderBanner(){
  const banner=ensureBanner();if(!banner)return;
  const active=state.warnings.filter(item=>item.active&&(registeredAreaCodes.has(item.regId)||registeredAreaCodes.has(item.regUp)));
  banner.classList.remove("visible","unknown");banner.textContent="";
  if(state.status!=="READY")return;
  if(!active.length)return;
  banner.textContent=active.map(item=>`⚠️ ${item.areaName||item.regKo||item.regId} ${item.warningName}${item.levelName} 발효 중`).join(" · ");banner.classList.add("visible");
}
async function refresh(){
  state.status="LOADING";state.error=null;
  try{
    const started=Date.now();while((!window.supabase?.createClient||!window.getSnorkySupabase)&&Date.now()-started<10000)await new Promise(resolve=>setTimeout(resolve,100));
    if(!window.supabase?.createClient||!window.getSnorkySupabase)throw new Error("Supabase client unavailable");
    const {data:payload,error}=await window.getSnorkySupabase().functions.invoke(EDGE_FUNCTION_NAME,{method:"GET"});
    if(error)throw error;
    if(payload?.status!=="READY"||!Array.isArray(payload?.warnings))throw new Error(payload?.message||"KMA Edge Function unavailable");
    state.status="READY";state.warnings=payload.warnings;state.updatedAt=payload.updatedAt||new Date().toISOString();
  }catch(error){state.status="UNKNOWN";state.warnings=[];state.updatedAt=new Date().toISOString();state.error=error?.message||String(error)}
  renderBanner();document.dispatchEvent(new CustomEvent("snorky:kma-safety-updated",{detail:snapshot()}));return snapshot();
}

const ready=refresh();
window.SNORKYMarineSafety=Object.freeze({testMode:TEST_MODE,get activeWarnings(){return[...state.warnings]},get state(){return snapshot()},ready,refresh,pointAreaCode,pointAreaCodes,statusForCode,statusForCodes,statusForPoint,getPointMarineSafety:statusForPoint,isBlocked,passesRecommendationGate,registerPoints});
})();
