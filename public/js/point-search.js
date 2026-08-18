(function(){
"use strict";
const shell=document.getElementById("pointSearchShell"),mobileAnchor=document.getElementById("homeSearchAnchor")||document.getElementById("pointSearchMobileAnchor"),desktopActions=document.querySelector(".region-actions"),input=document.getElementById("pointSearchInput"),results=document.getElementById("pointSearchResults"),tabs=document.getElementById("pointTabsWrap"),mobileQuery=matchMedia("(max-width:700px)");
if(!shell||!mobileAnchor||!desktopActions||!input||!results||!tabs)return;
const escapeHtml=value=>String(value??"").replace(/[&<>"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[char]);
function allPoints(){return Array.isArray(window.SNORKY_ACTIVE_POINTS)?window.SNORKY_ACTIVE_POINTS:[]}
function render(){
  const query=input.value.trim(),matches=query?allPoints().filter(point=>`${point.name||point[0]||""} ${point.region||""}`.includes(query)).slice(0,10):[];
  tabs.classList.toggle("point-tabs-hidden",Boolean(query));results.hidden=!query;
  if(!query){results.innerHTML="";requestAnimationFrame(()=>window.updateAllHorizontalScrollHints?.());return}
  results.innerHTML=matches.length?matches.map(point=>`<button class="point-search-item" type="button" data-search-point-id="${escapeHtml(point.supabaseId||point.id)}"><span class="point-search-copy"><span class="point-search-name">${escapeHtml(point.name||point[0])}</span><span class="nearby-best-region">${escapeHtml(point.region||"")}</span></span><span class="nearby-best-chevron" aria-hidden="true">›</span></button>`).join(""):'<p class="point-search-empty">일치하는 포인트가 없습니다.</p>';
}
function placeSearch(){if(mobileQuery.matches){if(shell.parentElement!==mobileAnchor)mobileAnchor.appendChild(shell)}else if(shell.parentElement!==desktopActions){desktopActions.insertBefore(shell,document.getElementById("favoriteNavDesktop"))}}
function captureReturnState(){return{view:"pointSearch",query:input.value,resultsScrollTop:results.scrollTop,pageScrollY:window.scrollY}}
function restoreReturnState(saved){input.value=String(saved?.query||"");render();requestAnimationFrame(()=>{results.scrollTop=Number(saved?.resultsScrollTop)||0;input.focus()})}
function openDetail(button){const pointId=button.dataset.searchPointId,returnState=captureReturnState();if(!window.SNORKYPointDetail?.openBySupabaseId(pointId,"pointSearch",returnState))console.warn("[SNORKY Point Search] 상세 진입 실패",{pointId})}
input.addEventListener("input",render);
results.addEventListener("click",event=>{const button=event.target.closest("[data-search-point-id]");if(button)openDetail(button)});
mobileQuery.addEventListener?.("change",placeSearch);placeSearch();
window.SNORKYPointSearch={render,captureReturnState,restoreReturnState};
})();
