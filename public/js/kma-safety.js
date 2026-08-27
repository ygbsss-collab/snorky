(function(){
"use strict";

const TEST_MODE=false;
const EDGE_FUNCTION_NAME="kma-warnings";
const state={status:"UNKNOWN",warnings:[],updatedAt:null,error:null};
const registeredAreaCodes=new Set();

function snapshot(){return{status:state.status,warnings:[...state.warnings],updatedAt:state.updatedAt,error:state.error}}
function pointAreaCode(point){
  const code=String(point?.warningAreaCode||point?.warning_area_code||"").trim();
  if(/^S\d{7}$/.test(code))return code;
  const lat=Number(point?.lat??point?.[1]),lng=Number(point?.lng??point?.[2]);
  if(Number.isFinite(lat)&&Number.isFinite(lng)&&typeof window.SNORKYWarningZones?.resolveWarningAreaCode==="function"){
    const resolved=window.SNORKYWarningZones.resolveWarningAreaCode(lat,lng);
    if(/^S\d{7}$/.test(resolved||""))return resolved;
  }
  const regCode=String(point?.region?.warningAreaCode||point?.region?.warning_area_code||"").trim();
  if(/^S\d{7}$/.test(regCode))return regCode;
  return null;
}
function statusForCode(code,areaName=null){
  if(!/^S\d{7}$/.test(code||""))return{status:"UNKNOWN",warningAreaCode:null,areaName,warning:null};
  if(state.status!=="READY")return{status:"UNKNOWN",warningAreaCode:code,areaName,warning:null};
  const warning=state.warnings.find(item=>item.active&&(item.regId===code||item.regUp===code))||null;
  return{status:warning?"BLOCK":"PASS",warningAreaCode:code,areaName:areaName||warning?.areaName||null,warning};
}
function statusForPoint(point){return statusForCode(pointAreaCode(point),point?.warningAreaName||null)}
function isBlocked(point){return statusForPoint(point).status==="BLOCK"}
function passesRecommendationGate(point){return statusForPoint(point).status==="PASS"}
function registerPoints(points){for(const point of points||[]){const code=pointAreaCode(point);if(code)registeredAreaCodes.add(code)}renderBanner()}

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
window.SNORKYMarineSafety=Object.freeze({testMode:TEST_MODE,get activeWarnings(){return[...state.warnings]},get state(){return snapshot()},ready,refresh,pointAreaCode,statusForCode,statusForPoint,getPointMarineSafety:statusForPoint,isBlocked,passesRecommendationGate,registerPoints});
})();
