(function(){
"use strict";

const MAX_RESULTS=3;
const SNAPSHOT_TTL=20*60*1000;
const state={running:false,pendingRefresh:false,snapshot:null};

function escapeHtml(value){return String(value??"").replace(/[&<>"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[char])}
function grade(score){return window.getSnorkySeaConditionLabel?.(score)||"바다 상태를 확인할 수 없어요"}
function safetyFor(point){return window.SNORKYMarineSafety?.getPointMarineSafety(point)||{status:"UNKNOWN"}}
function validSnapshot(){return state.snapshot&&Date.now()-state.snapshot.createdAt<SNAPSHOT_TTL}
function stableSort(a,b){
  const scoreA = Number(a.v12?.conditionScore);
  const scoreB = Number(b.v12?.conditionScore);
  const validA = Number.isFinite(scoreA) ? scoreA : -Infinity;
  const validB = Number.isFinite(scoreB) ? scoreB : -Infinity;
  return validB - validA || a.sourceIndex - b.sourceIndex || String(a.region).localeCompare(String(b.region),"ko-KR") || String(a.name).localeCompare(String(b.name),"ko-KR") || String(a.id).localeCompare(String(b.id));
}

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
function isRecommendablePoint(point){
  const v12 = point?.v12;
  return Boolean(v12 && v12.safety === "PASS" && Number.isFinite(Number(v12.conditionScore)));
}
function casePolicy(eligible,rows){
  if(!eligible.length){
    return{caseName:"E",title:"오늘은 기상악화로 추천 포인트가 없습니다.",subtitle:"실내 다이빙센터 이용을 권합니다.",detail:"",rows:[],medals:false};
  }
  const topPoint=eligible[0];
  const highest=Number(topPoint?.v12?.conditionScore);
  const count=eligible.length;
  const subtitle=count>=3?"오늘 바다가 좋은 포인트를 골라봤어요.":`오늘 추천 가능한 ${count}개 포인트를 골라봤어요.`;
  return{caseName:highest>=80?"A":highest>=65?"B":"C",title:"",subtitle,rows:eligible.slice(0,10),medals:true};
}
async function evaluate(){
  if(state.running)return;state.running=true;setLoading("SNORKY 전체 포인트를 확인 중입니다.");
  try{
    const points=await waitForPoints();
    const resultReader = window.SNORKYEvaluationResults;
    if(!resultReader?.loadTodayResults)throw new Error("Result 조회 어댑터를 불러오지 못했습니다.");

    const todayMap = await resultReader.loadTodayResults();
    const rows = points.map((point, index) => {
      const pid = String(point.supabaseId || point.id);
      const res = todayMap.get(pid);

      const safety = res?.safety_status || "UNKNOWN";
      const hasScore = res && res.quality_status !== "UNKNOWN" && Number.isFinite(Number(res.condition_score));
      const score = hasScore ? Number(res.condition_score) : null;
      const isRecommendable = safety === "PASS" && hasScore;

      let reason = "";
      if (!res || !hasScore) reason = "데이터 확인 필요";
      else if (safety === "BLOCK") reason = (res.safety_reasons?.[0] || "공식 해상특보");
      else if (safety === "UNKNOWN") reason = "해상특보 확인 불가";

      const v12 = res ? {
        conditionScore: score,
        conditionStatus: res.condition_status,
        safety: res.safety_status,
        safetyReasons: res.safety_reasons || [],
        qualityStatus: res.quality_status,
        recommendation: res.recommendation,
        visibilityGrade: res.visibility_grade,
        visibilityScore: res.visibility_score,
        waveHeight: res.wave_height ?? res.metrics?.wave_height ?? null,
        seaTemperature: res.sea_temperature ?? res.metrics?.sea_temperature ?? null,
        windSpeed: res.wind_speed ?? res.metrics?.wind_speed ?? null,
      } : null;

      return {
        ...point,
        sourceIndex: index,
        score,
        kma: safety,
        hard: safety === "BLOCK" ? (res?.safety_reasons?.[0] || "BLOCK") : "NONE",
        included: isRecommendable,
        reason,
        wave_height: res?.wave_height ?? res?.metrics?.wave_height ?? null,
        visibility_grade: res?.visibility_grade ?? null,
        visibility_score: res?.visibility_score ?? null,
        sea_temperature: res?.sea_temperature ?? null,
        wind_speed: res?.wind_speed ?? null,
        res,
        v12,
      };
    });

    const eligible = rows.filter(p => p.included).sort((a, b) => (b.score || 0) - (a.score || 0) || a.sourceIndex - b.sourceIndex);
    const top10 = eligible.slice(0, 10);
    const policy = casePolicy(top10, rows);
    const sourceById = new Map(points.flatMap(point => [[String(point.supabaseId ?? ""), point], [String(point.id ?? ""), point]]));
    const homeRows = top10.map(point => ({ ...sourceById.get(String(point.id)), ...point, images: sourceById.get(String(point.id))?.images || [], v12: point.v12 }));
    const snapshot = { createdAt: Date.now(), pointsTotal: points.length, rows, eligible: top10, homeRows, policy, diagnostics: { source: "point_evaluation_results" } };
    state.snapshot = snapshot;
    render(snapshot);
    document.dispatchEvent(new CustomEvent("snorky:today-best-ready", { detail: snapshot }));
    logDevelopment(snapshot);
  }catch(error){console.error("[SNORKY TODAY BEST] 실행 실패",error);getDialog().querySelector(".today-best-results").innerHTML=`<p class="nearby-best-status error">${escapeHtml(error?.message||"오늘의 BEST를 불러오지 못했습니다.")}</p>`;document.dispatchEvent(new CustomEvent("snorky:today-best-error",{detail:error}))}
  finally{state.running=false;if(state.pendingRefresh){state.pendingRefresh=false;queueMicrotask(evaluate)}}
}
function render(snapshot){
  const {policy}=snapshot;
  const rows=policy.rows.map((point,index)=>{
    const v12=point.v12;
    const scoreVal=v12?.conditionScore!=null?Math.round(v12.conditionScore):null;
    const scoreText=scoreVal!=null?`${scoreVal}점`:"--";
    const conditionText=window.getSnorkyConditionStatus?.(point)||"보통";
    const rankLabel=index<3?["🥇","🥈","🥉"][index]:String(index+1);
    return`<li class="nearby-best-item today-best-item" data-supabase-point-id="${escapeHtml(point.id)}" role="button" tabindex="0" aria-label="${escapeHtml(point.name)} 상세 보기"><span class="nearby-best-rank">${rankLabel}</span><div class="nearby-best-content"><div class="nearby-best-title"><div class="nearby-best-name">${escapeHtml(point.name)}</div>${point.region?`<span class="nearby-best-region">${escapeHtml(point.region)}</span>`:""}</div><div class="nearby-best-meta">${scoreText} · ${escapeHtml(conditionText)}</div></div><span class="nearby-best-chevron" aria-hidden="true">›</span></li>`;
  }).join("");
  const recommendable=policy.caseName==="A"||policy.caseName==="B"||policy.caseName==="C",primary=recommendable?`<section class="nearby-recommendations-section">${policy.subtitle?`<p class="nearby-best-status">${policy.subtitle}</p>`:""}<h3>오늘 추천 포인트</h3><ol class="nearby-best-list">${rows}</ol></section>`:`<section class="nearby-recommendations-section"><p class="nearby-best-status"><strong>⚠️ ${policy.title}</strong>${policy.subtitle?`<br>${policy.subtitle}`:""}</p></section>`,reference=!recommendable&&rows?`<section class="nearby-points-section"><h3>${policy.sectionTitle||"참고 포인트"}</h3><ol class="nearby-best-list">${rows}</ol></section>`:"";
  getDialog().querySelector(".today-best-results").innerHTML=primary+reference;
}
function openPointDetail(row){const pointId=row.dataset.supabasePointId;closeDialog();if(typeof window.openPointOnMap==="function"){window.openPointOnMap(pointId,"todayBest");}else{const returnState=captureReturnState();if(!window.SNORKYPointDetail?.openBySupabaseId(pointId,"todayBest",returnState))console.warn("[SNORKY TODAY BEST] Point 상세 진입 실패",{pointId})}}
function logDevelopment(snapshot){
  if(!document.documentElement.classList.contains("admin-mode")&&!new URLSearchParams(window.location?.search||"").has("debug"))return;
  console.info("[SNORKY TODAY BEST]",{points:snapshot.pointsTotal,case:snapshot.policy.caseName,eligible:snapshot.eligible.length,weatherRequests:snapshot.diagnostics.weatherRequests,marineRequests:snapshot.diagnostics.marineRequests});
  console.table(snapshot.rows.map((row,index)=>({Rank:index+1,Region:row.region,Point:row.name,Score:row.v12?.conditionScore!=null?Math.round(row.v12.conditionScore):(Number.isFinite(row.score)?row.score:"--"),Recommendation:row.v12?.recommendation||"--",KMA:row.kma,HardSafety:row.hard,Included:row.included,Reason:row.reason})));
}

document.getElementById("todayBestButton")?.addEventListener("click",openDialog);
document.getElementById("todayBestButtonMobile")?.addEventListener("click",openDialog);
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&getDialog().classList.contains("open"))closeDialog()});
window.SNORKYTodayBest={open:openDialog,captureReturnState,restoreReturnState,getSnapshot:()=>state.snapshot,refresh:()=>{state.snapshot=null;if(state.running){state.pendingRefresh=true;return}return evaluate()}};
})();
