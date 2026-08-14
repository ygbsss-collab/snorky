(function(){
"use strict";

const MAX_RESULTS=3;
const SNAPSHOT_TTL=20*60*1000;
const state={running:false,snapshot:null};

function escapeHtml(value){return String(value??"").replace(/[&<>"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[char])}
function grade(score){return window.getSnorkySeaConditionLabel?.(score)||"바다 상태를 확인할 수 없어요"}
function safetyFor(point){return window.SNORKYMarineSafety?.getPointMarineSafety(point)||{status:"UNKNOWN"}}
function validSnapshot(){return state.snapshot&&Date.now()-state.snapshot.createdAt<SNAPSHOT_TTL}
function stableSort(a,b){return b.score-a.score||a.sourceIndex-b.sourceIndex||String(a.region).localeCompare(String(b.region),"ko-KR")||String(a.name).localeCompare(String(b.name),"ko-KR")||String(a.id).localeCompare(String(b.id))}

function createDialog(){
  const overlay=document.createElement("div");
  overlay.id="todayBestOverlay";overlay.className="nearby-best-overlay";overlay.setAttribute("aria-hidden","true");
  overlay.innerHTML=`<section class="nearby-best-dialog" role="dialog" aria-modal="true" aria-labelledby="todayBestTitle"><div class="nearby-best-head"><h2 id="todayBestTitle">🏆 오늘의 BEST</h2><button class="nearby-best-close" type="button" aria-label="닫기">×</button></div><div class="today-best-results" aria-live="polite"></div></section>`;
  document.body.appendChild(overlay);
  overlay.querySelector(".nearby-best-close").addEventListener("click",closeDialog);
  overlay.addEventListener("click",event=>{if(event.target===overlay)closeDialog()});
  overlay.addEventListener("click",event=>{const row=event.target.closest("[data-supabase-point-id]");if(row)openPointDetail(row)});
  overlay.addEventListener("keydown",event=>{if((event.key==="Enter"||event.key===" ")&&event.target.closest("[data-supabase-point-id]")){event.preventDefault();openPointDetail(event.target.closest("[data-supabase-point-id]"))}});
  return overlay;
}
function getDialog(){return document.getElementById("todayBestOverlay")||createDialog()}
function openDialog(){const overlay=getDialog();overlay.classList.add("open");overlay.setAttribute("aria-hidden","false");overlay.querySelector(".nearby-best-close").focus();if(validSnapshot())render(state.snapshot);else evaluate()}
function closeDialog(){const overlay=getDialog();overlay.classList.remove("open");overlay.setAttribute("aria-hidden","true");document.getElementById("todayBestButtonMobile")?.focus()}
function captureReturnState(){const dialog=getDialog().querySelector(".nearby-best-dialog");return{view:"todayBest",dialogScrollTop:dialog.scrollTop,pageScrollY:window.scrollY}}
function restoreReturnState(saved){openDialog();requestAnimationFrame(()=>{getDialog().querySelector(".nearby-best-dialog").scrollTop=Number(saved?.dialogScrollTop)||0})}
function setLoading(message){getDialog().querySelector(".today-best-results").innerHTML=`<div class="best-loading">${escapeHtml(message)}</div>`}

async function waitForPoints(){
  const started=Date.now();
  while(Date.now()-started<10000){if(Array.isArray(window.SNORKY_ACTIVE_POINTS)&&window.SNORKY_ACTIVE_POINTS.length)return window.SNORKY_ACTIVE_POINTS;await new Promise(resolve=>setTimeout(resolve,100))}
  throw new Error("전체 포인트 정보를 불러오지 못했습니다.");
}
function casePolicy(eligible,rows){
  const highest=eligible[0]?.score;
  if(highest>=80)return{caseName:"A",title:"",subtitle:"오늘 바다가 좋은 포인트를 골라봤어요.",rows:eligible.slice(0,MAX_RESULTS),medals:true};
  if(highest>=65)return{caseName:"B",title:"",subtitle:"오늘 가볼 만한 포인트를 골라봤어요.",rows:eligible.slice(0,MAX_RESULTS),medals:true};
  const evaluableWithoutHardSafety=rows.filter(point=>!point.error&&Number.isFinite(point.score)&&!point.hardLabel),blocked=evaluableWithoutHardSafety.filter(point=>point.kma==="BLOCK").length,unknown=evaluableWithoutHardSafety.filter(point=>point.kma==="UNKNOWN").length,pass=evaluableWithoutHardSafety.filter(point=>point.kma==="PASS").length;
  if(!pass&&(blocked||unknown)){
    const subtitle=blocked&&unknown?"공식 해상특보가 발효 중이거나 특보 정보를 확인할 수 없어 안전을 위해 추천하지 않습니다.":blocked?"공식 해상특보가 발효 중인 포인트는 추천에서 제외했습니다.":"해상특보 정보를 확인할 수 없어 안전을 위해 추천하지 않습니다.";
    return{caseName:"KMA",title:"현재 추천할 만한 포인트가 없습니다.",subtitle,detail:"해상특보 상태가 정상화된 뒤 다시 확인해 주세요.",rows:[],medals:false};
  }
  if(highest>=50)return{caseName:"C",title:"현재 해상 상태로 추천할 만한 포인트가 없습니다.",subtitle:"그래도 지금 상태가 나은 포인트를 모아봤어요.",sectionTitle:"참고 포인트",rows:eligible.slice(0,MAX_RESULTS),medals:false};
  if(highest>=35)return{caseName:"D",title:"현재 해상 상태로 추천할 만한 포인트가 없습니다.",subtitle:"오늘 바다는 전반적으로 많이 아쉬워요.",sectionTitle:"참고 포인트",rows:eligible.slice(0,MAX_RESULTS),medals:false};
  return{caseName:"E",title:"오늘은 추천할 만한 포인트가 없습니다.",subtitle:"오늘은 바다 쉬어가는 게 좋겠어요.",sectionTitle:"참고 포인트",rows:eligible.slice(0,MAX_RESULTS),medals:false};
}
async function evaluate(){
  if(state.running)return;state.running=true;setLoading("SNORKY 전체 포인트를 확인 중입니다.");
  try{
    await window.SNORKYMarineSafety?.ready;
    const points=await waitForPoints(),service=window.SNORKYNearbyBest;
    if(!service?.evaluatePoints)throw new Error("기존 Today 평가 엔진을 사용할 수 없습니다.");
    const {scored,diagnostics}=await service.evaluatePoints(points);
    const rows=scored.map((point,index)=>{const safety=safetyFor(point),hard=point.hardLabel||"NONE",success=!point.error&&Number.isFinite(point.score),included=success&&safety.status==="PASS"&&!point.hardLabel;let reason="";if(!success)reason=point.error||"평가 실패";else if(safety.status==="BLOCK")reason="공식 해상특보";else if(safety.status==="UNKNOWN")reason="해상특보 확인 불가";else if(point.hardLabel)reason=point.hardLabel;return{...point,sourceIndex:index,kma:safety.status,hard,included,reason}}).sort(stableSort);
    const eligible=rows.filter(row=>row.included),policy=casePolicy(eligible,rows),snapshot={createdAt:Date.now(),pointsTotal:points.length,rows,eligible,policy,diagnostics};state.snapshot=snapshot;render(snapshot);logDevelopment(snapshot);
  }catch(error){console.error("[SNORKY TODAY BEST] 실행 실패",error);getDialog().querySelector(".today-best-results").innerHTML=`<p class="nearby-best-status error">${escapeHtml(error?.message||"오늘의 BEST를 계산하지 못했습니다.")}</p>`}
  finally{state.running=false}
}
function render(snapshot){
  const {policy}=snapshot,icons=policy.medals?["🥇","🥈","🥉"]:["1","2","3"];
  const rows=policy.rows.map((point,index)=>`<li class="nearby-best-item today-best-item" data-supabase-point-id="${escapeHtml(point.id)}" role="button" tabindex="0" aria-label="${escapeHtml(point.name)} 상세 보기"><span class="nearby-best-rank">${icons[index]}</span><div class="nearby-best-content"><div class="nearby-best-title"><div class="nearby-best-name">${escapeHtml(point.name)}</div>${point.region?`<span class="nearby-best-region">${escapeHtml(point.region)}</span>`:""}</div><div class="nearby-best-meta">${point.score}점 · ${escapeHtml(grade(point.score))}</div></div><span class="nearby-best-chevron" aria-hidden="true">›</span></li>`).join("");
  const recommendable=policy.caseName==="A"||policy.caseName==="B",primary=recommendable?`<section class="nearby-recommendations-section">${policy.subtitle?`<p class="nearby-best-status">${policy.subtitle}</p>`:""}<h3>오늘 추천 포인트</h3><ol class="nearby-best-list">${rows}</ol></section>`:`<section class="nearby-recommendations-section"><p class="nearby-best-status"><strong>⚠️ ${policy.title}</strong>${policy.subtitle?`<br>${policy.subtitle}`:""}${policy.detail?`<br>${policy.detail}`:""}</p></section>`,reference=!recommendable&&rows?`<section class="nearby-points-section"><h3>${policy.sectionTitle||"참고 포인트"}</h3><ol class="nearby-best-list">${rows}</ol></section>`:"";
  getDialog().querySelector(".today-best-results").innerHTML=primary+reference;
}
function openPointDetail(row){const pointId=row.dataset.supabasePointId,returnState=captureReturnState();closeDialog();if(!window.SNORKYPointDetail?.openBySupabaseId(pointId,"todayBest",returnState))console.warn("[SNORKY TODAY BEST] Point 상세 진입 실패",{pointId})}
function logDevelopment(snapshot){
  if(!document.documentElement.classList.contains("admin-mode")&&!new URLSearchParams(location.search).has("debug"))return;
  console.info("[SNORKY TODAY BEST]",{points:snapshot.pointsTotal,case:snapshot.policy.caseName,eligible:snapshot.eligible.length,weatherRequests:snapshot.diagnostics.weatherRequests,marineRequests:snapshot.diagnostics.marineRequests});
  console.table(snapshot.rows.map((row,index)=>({Rank:index+1,Region:row.region,Point:row.name,Score:Number.isFinite(row.score)?row.score:"--",Grade:Number.isFinite(row.score)?grade(row.score):"--",KMA:row.kma,HardSafety:row.hard,Included:row.included,Reason:row.reason})));
}

document.getElementById("todayBestButton")?.addEventListener("click",openDialog);
document.getElementById("todayBestButtonMobile")?.addEventListener("click",openDialog);
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&getDialog().classList.contains("open"))closeDialog()});
window.SNORKYTodayBest={open:openDialog,captureReturnState,restoreReturnState,getSnapshot:()=>state.snapshot,refresh:()=>{state.snapshot=null;return evaluate()}};
})();
