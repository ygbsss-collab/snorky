(function(){
"use strict";
const FAVORITES_KEY="snorky_favorites",CLIENT_ID_KEY="snorky_client_id";
let favorites=readFavorites(),favoritesMode=false,modalPointId=null,ratingRequest=0;

function readFavorites(){
  try{
    const value=JSON.parse(localStorage.getItem(FAVORITES_KEY)||"[]");
    return new Set(Array.isArray(value)?value.map(id=>String(id).trim()).filter(Boolean):[]);
  }catch(error){
    console.warn("[SNORKY] 즐겨찾기 데이터를 초기화합니다.",error);
    return new Set();
  }
}
function saveFavorites(){
  try{
    localStorage.setItem(FAVORITES_KEY,JSON.stringify([...favorites]));
  }catch(e){
    console.warn("[SNORKY] 즐겨찾기 저장 실패:",e);
  }
}
function allPoints(){
  if(Array.isArray(window.SNORKY_ACTIVE_POINTS)&&window.SNORKY_ACTIVE_POINTS.length)return window.SNORKY_ACTIVE_POINTS;
  if(typeof locations!=="undefined"&&locations&&typeof locations==="object")return Object.values(locations).flat();
  if(window.locations&&typeof window.locations==="object")return Object.values(window.locations).flat();
  return[];
}
function findMatchingPoint(pointOrId){
  if(pointOrId===undefined||pointOrId===null)return null;
  const list=allPoints();
  if(typeof pointOrId==="string"||typeof pointOrId==="number"){
    const target=String(pointOrId).trim();
    return list.find(p=>String(p.supabaseId||"")===target||String(p.id||"")===target||String(p.legacy_id||"")===target||String(p.legacyId||"")===target||p.name===target)||null;
  }
  if(typeof pointOrId==="object"){
    const sId=pointOrId.supabaseId!=null?String(pointOrId.supabaseId).trim():null;
    const id=pointOrId.id!=null?String(pointOrId.id).trim():null;
    const lId=(pointOrId.legacy_id!=null?String(pointOrId.legacy_id):(pointOrId.legacyId!=null?String(pointOrId.legacyId):null))?.trim()||null;
    return list.find(p=>(sId&&(String(p.supabaseId)===sId||String(p.id)===sId))||(id&&(String(p.id)===id||String(p.supabaseId)===id))||(lId&&(String(p.legacy_id)===lId||String(p.legacyId)===lId)))||null;
  }
  return null;
}
function getPointIds(point){
  if(point===undefined||point===null)return[];
  const ids=[];
  if(typeof point==="string"||typeof point==="number"){
    ids.push(String(point).trim());
  }else if(typeof point==="object"){
    if(point.supabaseId!=null)ids.push(String(point.supabaseId).trim());
    if(point.id!=null)ids.push(String(point.id).trim());
    if(point.legacy_id!=null)ids.push(String(point.legacy_id).trim());
    if(point.legacyId!=null)ids.push(String(point.legacyId).trim());
  }
  const matched=findMatchingPoint(point);
  if(matched&&matched!==point){
    if(matched.supabaseId!=null)ids.push(String(matched.supabaseId).trim());
    if(matched.id!=null)ids.push(String(matched.id).trim());
    if(matched.legacy_id!=null)ids.push(String(matched.legacy_id).trim());
    if(matched.legacyId!=null)ids.push(String(matched.legacyId).trim());
  }
  return [...new Set(ids.filter(Boolean))];
}
function pointId(point){
  const ids=getPointIds(point);
  return ids[0]||null;
}
function isFavorite(point){
  if(!point)return false;
  const ids=getPointIds(point);
  return ids.some(id=>favorites.has(id));
}
function navigationPoints(regionPoints){return favoritesMode?allPoints().filter(isFavorite):(regionPoints||[])}
function getClientId(){let id=localStorage.getItem(CLIENT_ID_KEY);if(id)return id;id=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${crypto.getRandomValues(new Uint32Array(4)).join("-")}`;localStorage.setItem(CLIENT_ID_KEY,id);return id}
function updateFavoriteNav(){document.querySelectorAll(".favorite-nav").forEach(button=>{button.classList.toggle("active",favoritesMode);button.setAttribute("aria-pressed",String(favoritesMode));button.textContent="♥ 즐겨찾기"})}
function enterFavorites(){favoritesMode=true;updateFavoriteNav();if(typeof window.openFavoritesOnMap==="function"){window.openFavoritesOnMap();}}
function exitFavorites(){favoritesMode=false;updateFavoriteNav()}
function toggleFavorite(point){
  const ids=getPointIds(point);
  const primaryId=point?.supabaseId!=null?String(point.supabaseId).trim():(point?.id!=null?String(point.id).trim():(ids[0]||null));
  if(!primaryId)return false;
  const currentlyFav=isFavorite(point);
  if(currentlyFav){
    ids.forEach(id=>favorites.delete(id));
    favorites.delete(primaryId);
  }else{
    favorites.add(primaryId);
  }
  saveFavorites();
  renderFavoriteButton(point);
  const newStatus=!currentlyFav;
  document.dispatchEvent(new CustomEvent("snorky:favorites-updated",{detail:{pointId:primaryId,isFavorite:newStatus,point}}));
  return newStatus;
}
function renderFavoriteButton(point){
  const button=document.getElementById("pointFavoriteToggle");
  if(!button)return;
  const active=isFavorite(point);
  button.classList.toggle("active",active);
  button.setAttribute("aria-pressed",String(active));
  button.innerHTML=`<svg class="heart-icon" viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="${active?'currentColor':'none'}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
}
async function getSupabase(){if(window.supabase?.createClient&&window.getSnorkySupabase)return window.getSnorkySupabase();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Supabase 로딩 시간 초과")),6000);window.addEventListener("snorky:supabase-ready",()=>{clearTimeout(timer);resolve()},{once:true})});return window.getSnorkySupabase()}
async function loadRating(point){const id=pointId(point),request=++ratingRequest;if(!id)return;try{const sb=await getSupabase(),clientId=getClientId(),{data,error}=await sb.from("point_ratings").select("rating,client_id").eq("point_id",id);if(error)throw error;if(request!==ratingRequest||modalPointId!==id)return;const rows=data||[],average=rows.length?rows.reduce((sum,row)=>sum+Number(row.rating||0),0)/rows.length:null,ratingEl=document.getElementById("pointModalRating");if(ratingEl){if(average!=null){ratingEl.textContent=`★ ${average.toFixed(1)}${rows.length?` (${rows.length})`:''}`}else{ratingEl.textContent="★ --"}}}catch(error){console.warn("[SNORKY Rating] 조회 실패",error);const ratingEl=document.getElementById("pointModalRating");if(ratingEl)ratingEl.textContent="★ --"}}
function enhanceModal(point){
  if(!point)return;
  const id=pointId(point);
  modalPointId=id;
  renderFavoriteButton(point);
  const favBtn=document.getElementById("pointFavoriteToggle");
  if(favBtn){
    favBtn.onclick=(e)=>{
      if(e){e.preventDefault();e.stopPropagation();}
      toggleFavorite(point);
    };
  }
  loadRating(point);
}
function init(){
  document.querySelectorAll(".favorite-nav").forEach(button=>{
    button.onclick=(e)=>{
      if(e){e.preventDefault();e.stopPropagation();}
      if(typeof window.openFavoritesOnMap==="function"){
        window.openFavoritesOnMap();
      }
    };
  });
  updateFavoriteNav();
  const baseRenderPointModal=renderPointModal;
  renderPointModal=function(){
    baseRenderPointModal();
    const point=getEffectivePoint(spot,region);
    if(point)enhanceModal(point);
  };
}
window.SNORKYEngagement={get favoritesMode(){return favoritesMode},navigationPoints,isFavorite,toggleFavorite,enterFavorites,exitFavorites,init};
init();
})();
