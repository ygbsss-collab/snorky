(function(){
"use strict";
const directPointRequest=document.documentElement.classList.contains("snorky-direct-point-detail");
const state={todayExpanded:false,todayRows:[],nearbyExpanded:false,nearbyRows:[],nearbyRadius:300,nearestExpanded:false,hasLocation:false,userCoords:null};
const section=document.createElement("section");section.className="home-v2 home-reference";section.setAttribute("aria-label","SNORKY 홈");
section.innerHTML=`<section id="homeHero" class="home-hero" style="background-image:url('./public/images/snorky-hero-freediving.jpg')"><div class="home-hero-shade"></div><div class="home-hero-content"><div class="home-hero-header" style="display:flex;justify-content:space-between;align-items:center;width:100%"><div class="home-hero-brand brand-mark" role="button" tabindex="0" aria-label="SNORKY 로고" style="cursor:pointer"><img src="./public/images/snorky-symbol.png" alt="SNORKY" class="home-hero-logo"><span class="home-hero-brand-name">SNORKY</span></div><a id="homeAccountLink" class="home-account-link" href="./login.html" aria-label="로그인"><span id="homeAccountAvatarWrap" class="home-account-avatar-wrap"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"></circle><path d="M5.5 20c.5-4 2.7-6 6.5-6s6 2 6.5 6"></path></svg></span><span id="homeAccountName" class="home-account-name">로그인</span></a></div><div class="home-hero-body"><h1 class="home-hero-title">오늘, 어디 바다로 갈까?</h1><p class="home-hero-subtitle">스노클링 · 프리다이빙 포인트를 바다 컨디션으로 추천해드려요!</p></div></div></section><section id="homeMarineWarning" class="home-marine-warning" aria-live="polite" hidden style="display:none"></section><section class="home-discovery"><div id="homeSearchAnchor" class="home-search-anchor"></div></section><div class="home-filter-row" aria-label="포인트 필터"><label class="home-filter-chip active"><span>⌖ 지역</span><select id="homeRegionFilter" aria-label="지역 선택" multiple size="1"><option value="">전체</option></select></label><label class="home-filter-chip"><span>♒ 지형</span><select id="homeTerrainFilter" aria-label="지형 선택" multiple size="1"><option value="">전체</option></select></label><label class="home-filter-chip"><span>☆ 추천조건</span><select id="homeRecommendFilter" aria-label="추천조건 선택" multiple size="1"><option value="">전체</option></select></label></div><button id="homeSearchButton" class="home-search-submit" type="button">검색</button><div id="homeQuickActionsCard" class="home-quick-actions-card" role="navigation" aria-label="빠른 메뉴"><button id="quickNavMySpots" class="home-quick-action-item" type="button" aria-label="나만의 스팟"><div class="home-quick-action-icon"><svg viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden="true"><circle cx="14" cy="14" r="13" fill="#1570ef"/><path d="M14 6.5C11.5 6.5 9.5 8.5 9.5 11c0 3.8 4.5 9.5 4.5 9.5s4.5-5.7 4.5-9.5c0-2.5-2-4.5-4.5-4.5zm0 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" fill="#ffffff"/></svg></div><span class="home-quick-action-label">나만의 스팟</span></button><a id="quickNavIndoorDiving" class="home-quick-action-item" href="./indoor-diving.html" aria-label="실내 다이빙" style="text-decoration:none"><div class="home-quick-action-icon"><svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-hidden="true"><circle cx="9" cy="20" r="3.5" fill="#1570ef"/><path d="M7 18.5c-.8 0-1.5-.7-1.5-1.5v-4c0-.8.7-1.5 1.5-1.5h1.2" stroke="#1570ef" stroke-width="1.8" stroke-linecap="round"/><path d="M11 18l5-5c1.2-1.2 3.1-1.2 4.3 0l2 2" stroke="#1570ef" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.5 16.5l2.5 2.5" stroke="#1570ef" stroke-width="2" stroke-linecap="round"/><path d="M20.5 11.5l4.5-4.8c.7-.7 1.9-.4 2.2.5l.6 3.2-5 1.8z" fill="#1570ef"/><path d="M22.5 14.5l4.5-2.2c.9-.4 2 .2 2.1 1.2l.2 3-5 .8z" fill="#1570ef"/></svg></div><span class="home-quick-action-label">실내 다이빙</span></a><button id="quickNavBuddy" class="home-quick-action-item" type="button" aria-label="버디찾기"><div class="home-quick-action-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="#1570ef" aria-hidden="true"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></div><span class="home-quick-action-label">버디찾기</span></button></div><section class="home-section home-best-section"><div class="home-reference-head"><h2>오늘의 추천 BEST</h2><button class="home-inline-more" type="button" data-toggle-today hidden>더보기 ›</button></div><div id="homeTodayBest" aria-live="polite"><div class="home-empty"><strong>오늘의 바다를 확인하고 있어요.</strong>잠시만 기다려 주세요.</div></div></section><section class="home-section home-nearby-section"><div class="home-reference-head"><h2>내 주변 추천 BEST</h2><button class="home-inline-more" type="button" data-toggle-nearby hidden>더보기 ›</button></div><div id="homeNearbyBest" aria-live="polite"></div></section><section class="home-section home-nearest-section"><div class="home-reference-head"><h2>가까운 포인트</h2><button class="home-inline-more" type="button" data-toggle-nearest hidden>더보기 ›</button></div><div id="homeNearestBest" aria-live="polite"></div></section><section class="home-section home-inquiry-box-section" style="margin-top:20px;margin-bottom:6px"><button id="homeInquiryTrigger" class="home-inquiry-box" type="button" aria-label="문의하기"><div class="home-inquiry-box-content"><div class="home-inquiry-box-title"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><strong>문의하기</strong></div><p class="home-inquiry-box-desc">포인트 정보 수정 · 포인트 제보 · 기타 문의</p></div><span class="home-inquiry-box-arrow" aria-hidden="true">›</span></button></section><div id="homeAccountFooterLinks" class="home-account-footer-links" style="display:none;justify-content:center;align-items:center;gap:18px;margin:14px auto 8px;padding:6px 0;font-size:13px;color:#788b9b;"><button id="homeFooterLogoutBtn" class="home-account-footer-btn" type="button" style="border:0;background:transparent;color:#788b9b;font-size:13px;font-weight:600;cursor:pointer;padding:4px 8px;text-decoration:none;">로그아웃</button><span style="color:#cfd8dc;user-select:none;">·</span><a id="homeFooterDeleteAccountBtn" class="home-account-footer-btn" href="./account-delete.html" style="border:0;background:transparent;color:#788b9b;font-size:13px;font-weight:600;cursor:pointer;padding:4px 8px;text-decoration:none;">회원탈퇴</a></div><div class="home-policy-footer-links" style="display:flex;justify-content:center;align-items:center;gap:12px;margin:8px auto 26px;font-size:12px;color:#94a3b8;"><a href="./terms.html" style="color:#94a3b8;text-decoration:none;">SNORKY 이용약관</a><span style="color:#cbd5e1;user-select:none;">·</span><a href="./privacy.html" style="color:#94a3b8;text-decoration:none;">개인정보처리방침</a></div>`;
const homeMountRoot=document.getElementById("homeV2Root")||document.querySelector(".app")||document.body;
homeMountRoot.appendChild(section);
try{window.SNORKYRenderHomeProfile?.();window.dispatchEvent(new CustomEvent("snorky:auth-changed"))}catch(_){}
window.SNORKYAdmin?.bindSecretEntry?.();
let heroLogoClicks=[];
document.addEventListener("click",event=>{
  const brand=event.target.closest(".home-hero-brand, .brand-mark, #adminEntry");
  if(brand){
    const now=Date.now();
    heroLogoClicks=heroLogoClicks.filter(time=>now-time<=3000);
    heroLogoClicks.push(now);
    if(heroLogoClicks.length>=5){
      heroLogoClicks=[];
      if(typeof openAdminLogin==="function")openAdminLogin();
      else if(typeof window.openAdminLogin==="function")window.openAdminLogin();
      else document.getElementById("adminLoginModal")?.classList.add("open");
    }
  }
});
const bottom=window.SNORKYBottomNav.mount({active:"home",navigation:false,spacer:false});
const setBottomActive=target=>window.SNORKYBottomNav.setActive(target);

document.getElementById("quickNavMySpots")?.addEventListener("click",()=>{location.href="./my-spots.html";});
document.getElementById("quickNavBuddy")?.addEventListener("click",()=>{location.href="./buddy.html";});


function getAllActivePoints(){if(Array.isArray(window.SNORKY_ACTIVE_POINTS)&&window.SNORKY_ACTIVE_POINTS.length)return window.SNORKY_ACTIVE_POINTS;if(typeof locations!=="undefined"&&locations&&typeof locations==="object")return Object.values(locations).flat();if(window.locations&&typeof window.locations==="object")return Object.values(window.locations).flat();return[]}
const escapeHtml=value=>String(value??"").replace(/[&<>"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[char]);
function pointImage(point){const images=Array.isArray(point?.images)?point.images:[],primary=images.find(image=>image.isPrimary||image.is_primary)||images[0];return primary?.url||primary?.publicUrl||primary?.public_url||""}
function grade(score){const value=Number(score);if(!Number.isFinite(value))return"보통";if(value>=80)return"매우좋음";if(value>=65)return"좋음";if(value>=50)return"보통";if(value>=35)return"나쁨";return"매우나쁨"}
function rankClass(index){return index<3?` rank-${index+1}`:" rank-neutral"}
function openPoint(id,point=null){
  const isMapOpen=mapScreen&&mapScreen.classList.contains("open");
  const source=isMapOpen?"map":"home";
  const returnState=isMapOpen?captureMapReturnState():{view:"home",pageScrollY:window.scrollY};
  const openById=window.SNORKYPointDetail?.openBySupabaseId;
  if(typeof openById==="function"&&openById(id,source,returnState))return true;

  // 지도 요약 행은 canonical locations에 아직 반영되지 않을 수 있으므로 객체로 재시도한다.
  if(point&&typeof openPointModal==="function"){
    if(point.regionId!=null)selectedRegionId=point.regionId;
    if(point.region)region=point.region;
    spot=point;
    if(typeof renderNav==="function")renderNav();
    if(typeof load==="function")load(point);
    if(typeof pointDetailNavigation!=="undefined")pointDetailNavigation={source,returnState};
    openPointModal(source,returnState,point);
    return true;
  }
  console.warn("[SNORKY Map] Point detail entry failed",{id});
  return false;
}
function isRecommendablePoint(point){
  const v12=point?.v12;
  return Boolean(v12 && v12.safety==="PASS" && Number.isFinite(Number(v12.conditionScore)) && Number(v12.conditionScore)>=50);
}
function formatPointScore(point){
  const v12=point?.v12;
  if(!v12 || v12.safety==="BLOCK" || v12.safety==="UNKNOWN")return"--";
  const raw=v12.conditionScore;
  return Number.isFinite(Number(raw))?`${Math.round(Number(raw))}점`:"--";
}
function formatPointCondition(point){
  return window.getSnorkyConditionStatus?.(point) || (function(){
    const v12=point?.v12;
    const safety=v12?.safety||point?.kma;
    if(safety==="BLOCK")return"입수 금지";
    if(safety==="UNKNOWN")return"확인 필요";
    const raw=v12?.conditionScore;
    if(!Number.isFinite(Number(raw)))return"확인 필요";
    if(raw>=80)return"좋음";
    if(raw>=65)return"보통";
    if(raw>=50)return"주의";
    return"나쁨";
  })();
}
function todayCard(point,index){
  const image=pointImage(point);
  const scoreDisplay=formatPointScore(point);
  const conditionDisplay=formatPointCondition(point);
  return`<button class="home-top-card" type="button" data-home-point="${escapeHtml(point.supabaseId||point.id)}">${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy">`:'<span class="home-card-fallback"></span>'}<span class="home-card-rank${rankClass(index)}">${index+1}</span><span class="home-top-info"><strong>${escapeHtml(point.name)}</strong><span class="home-score-badge">${escapeHtml(scoreDisplay)}</span><small>${escapeHtml(point.region||"전국")}</small><em>🌊 ${escapeHtml(conditionDisplay)}</em></span></button>`;
}
function listCard(point,index){
  const image=pointImage(point);
  const scoreDisplay=formatPointScore(point);
  const conditionDisplay=formatPointCondition(point);
  return`<button class="home-rank-row" type="button" data-home-point="${escapeHtml(point.supabaseId||point.id)}"><span class="home-list-rank rank-neutral">${index+1}</span><span class="home-list-photo${image?'':' home-best-fallback'}">${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy">`:""}</span><span class="home-list-copy"><strong>${escapeHtml(point.name)}</strong><small>${escapeHtml(point.region||"전국")}</small><span>${escapeHtml(scoreDisplay)} · ${escapeHtml(conditionDisplay)}</span></span><span class="home-list-chevron">›</span></button>`;
}
function nearbyCard(point,index){
  const image=pointImage(point),distance=Number.isFinite(point.distance)?point.distance.toFixed(1):"--";
  const scoreDisplay=formatPointScore(point);
  const conditionDisplay=formatPointCondition(point);
  return`<button class="home-top-card" type="button" data-home-point="${escapeHtml(point.supabaseId||point.id)}" data-home-lat="${escapeHtml(point.lat)}" data-home-lng="${escapeHtml(point.lng)}">${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy">`:'<span class="home-card-fallback"></span>'}<span class="home-card-rank${rankClass(index)}">${index+1}</span><span class="home-top-info"><strong>${escapeHtml(point.name)}</strong><span class="home-score-badge">${escapeHtml(scoreDisplay)}</span><small>${escapeHtml(point.region||"전국")} · ${distance}km</small><em>🌊 ${escapeHtml(conditionDisplay)}</em></span></button>`;
}
function nearbyListCard(point,index){
  const image=pointImage(point),distance=Number.isFinite(point.distance)?point.distance.toFixed(1):"--";
  const scoreDisplay=formatPointScore(point);
  const conditionDisplay=formatPointCondition(point);
  return`<button class="home-rank-row" type="button" data-home-point="${escapeHtml(point.supabaseId||point.id)}" data-home-lat="${escapeHtml(point.lat)}" data-home-lng="${escapeHtml(point.lng)}"><span class="home-list-rank rank-neutral">${index+1}</span><span class="home-list-photo${image?'':' home-best-fallback'}">${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy">`:""}</span><span class="home-list-copy"><strong>${escapeHtml(point.name)}</strong><small>${escapeHtml(point.region||"전국")} · ${distance}km</small><span>${escapeHtml(scoreDisplay)} · ${escapeHtml(conditionDisplay)}</span></span><span class="home-list-chevron">›</span></button>`;
}
function nearestCard(point){const image=pointImage(point),distance=Number.isFinite(point.distance)?point.distance.toFixed(1):"--";return`<button class="home-top-card" type="button" data-home-point="${escapeHtml(point.supabaseId||point.id)}" data-home-lat="${escapeHtml(point.lat)}" data-home-lng="${escapeHtml(point.lng)}">${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy">`:'<span class="home-card-fallback"></span>'}<span class="home-distance-badge">${distance}km</span><span class="home-top-info"><strong>${escapeHtml(point.name)}</strong><small>${escapeHtml(point.region||"전국")} · ${distance}km</small></span></button>`}
function nearestListCard(point){const image=pointImage(point),distance=Number.isFinite(point.distance)?point.distance.toFixed(1):"--";return`<button class="home-rank-row home-nearest-row" type="button" data-home-point="${escapeHtml(point.supabaseId||point.id)}" data-home-lat="${escapeHtml(point.lat)}" data-home-lng="${escapeHtml(point.lng)}"><span class="home-list-photo${image?'':' home-best-fallback'}">${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy">`:""}</span><span class="home-list-copy"><strong>${escapeHtml(point.name)}</strong><small>${escapeHtml(point.region||"전국")} · ${distance}km</small></span><span class="home-list-chevron">›</span></button>`}
function setHeroImage(){const hero=document.getElementById("homeHero");if(hero){hero.style.backgroundImage="url('./public/images/snorky-hero-freediving.jpg')"}}
function renderToday(){
  const host=document.getElementById("homeTodayBest"),toggle=section.querySelector("[data-toggle-today]");
  setHeroImage();
  const eligible=state.todayRows.filter(isRecommendablePoint);
  if(!eligible.length){
    const activePoints=getAllActivePoints();
    if(activePoints.length>0){
      host.innerHTML=`<div class="home-empty">
        <strong>오늘은 기상악화로 추천 포인트가 없습니다.</strong>
        <p style="margin:4px 0 0;font-size:13.5px;color:#64748b">실내 다이빙센터 이용을 권합니다.</p>
      </div>`;
    }else{
      host.innerHTML='<div class="home-empty"><strong>등록된 포인트가 없습니다.</strong></div>';
    }
    if(toggle)toggle.hidden=true;
    return;
  }
  const topCount=Math.min(3,eligible.length);
  const topCards=eligible.slice(0,topCount).map((point,index)=>todayCard(point,index)).join("");
  const restCards=eligible.slice(3,10);
  host.innerHTML=`<div class="home-top-grid">${topCards}</div>${state.todayExpanded&&restCards.length?`<div class="home-rank-list">${restCards.map((point,index)=>listCard(point,index+3)).join("")}</div>`:""}`;
  if(toggle){
    toggle.hidden=eligible.length<=3;
    toggle.textContent=state.todayExpanded?"접기 ‹":"더보기 ›";
  }
}
function haversineKm(lat1,lng1,lat2,lng2){const toRad=deg=>deg*Math.PI/180,R=6371;const dLat=toRad(lat2-lat1),dLng=toRad(lng2-lng1);const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
function getPointsCountInRadius(coords, radius){
  if(!coords || coords.latitude==null || coords.longitude==null) return 0;
  const active=getAllActivePoints();
  const haversine=window.SNORKYNearbyBest?.haversineKm || haversineKm;
  let count=0;
  for(const p of active){
    const lat=Number(p.lat);
    const lng=Number(p.lng);
    if(!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const d=haversine(coords.latitude, coords.longitude, lat, lng);
    if(d <= radius) count++;
  }
  return count;
}
function getNearestPoints(){
  if(!state.userCoords)return[];
  const active=Array.isArray(window.SNORKY_ACTIVE_POINTS)?window.SNORKY_ACTIVE_POINTS:[];
  return active
    .filter(p=>p&&p.lat!=null&&p.lng!=null&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)))
    .filter(p=>window.SNORKYMarineSafety?.statusForPoint(p)?.status!=="BLOCK")
    .map(p=>{
      const distance=window.SNORKYNearbyBest?.haversineKm?.(state.userCoords.latitude,state.userCoords.longitude,Number(p.lat),Number(p.lng))??haversineKm(state.userCoords.latitude,state.userCoords.longitude,Number(p.lat),Number(p.lng));
      return {...p, distance};
    })
    .sort((a,b)=>(a.distance-b.distance));
}
function renderNearbySection(errorMessage=""){
  const host=document.getElementById("homeNearbyBest"),toggle=section.querySelector(".home-nearby-section [data-toggle-nearby]");
  if(!host)return;
  const radius=state.nearbyRadius||100;
  if(state.hasLocation&&state.userCoords){
    const radiiHtml=`<div class="home-nearby-radii-scroll"><fieldset class="home-nearby-radii" aria-label="검색 반경 선택">${[30,50,100,200,300].map(r=>`<label><input type="radio" name="homeNearbyRadius" value="${r}"${r===radius?' checked':''}><span>${r}km</span></label>`).join("")}</fieldset></div>`;
    const eligible=state.nearbyRows.filter(isRecommendablePoint);
    if(eligible.length>0){
      const topCount=Math.min(3,eligible.length);
      const topCards=eligible.slice(0,topCount).map((point,index)=>nearbyCard(point,index)).join("");
      const restCards=eligible.slice(3,10);
      host.innerHTML=`${radiiHtml}<div class="home-top-grid">${topCards}</div>${state.nearbyExpanded&&restCards.length?`<div class="home-rank-list">${restCards.map((point,index)=>nearbyListCard(point,index+3)).join("")}</div>`:""}`;
      if(toggle){
        toggle.hidden=eligible.length<=3;
        toggle.textContent=state.nearbyExpanded?"접기 ‹":"더보기 ›";
      }
    }else{
      const totalInRadius = Number.isFinite(state.nearbyTotalInRadius)
        ? state.nearbyTotalInRadius
        : getPointsCountInRadius(state.userCoords, radius);
      let emptyContent = "";
      if(totalInRadius === 0){
        const subNotice = radius < 300 ? '<p style="margin:4px 0 0;font-size:13.5px;color:#64748b">범위를 넓혀보세요.</p>' : '';
        emptyContent = `<strong>선택한 범위 내 포인트가 없습니다.</strong>${subNotice}`;
      } else {
        emptyContent = `<strong>오늘은 기상악화로 추천 포인트가 없습니다.</strong>`;
      }
      host.innerHTML=`${radiiHtml}<div class="home-empty" style="margin-top:12px">${emptyContent}</div>`;
      if(toggle){
        toggle.hidden=true;
      }
    }
  }else{
    if(toggle)toggle.hidden=true;
    host.innerHTML=`<div class="home-nearby-card-box">
      <div class="home-nearby-head-text">
        <strong class="home-nearby-main-title">가까운 포인트를 찾아보세요</strong>
        <p class="home-nearby-sub-title">${escapeHtml(errorMessage||"위치 사용 시 가까운 포인트를 더 정확하게 추천합니다.")}</p>
      </div>
      <div class="home-nearby-radius-section">
        <span class="home-nearby-radius-title">검색 반경</span>
        <div class="home-nearby-radii-scroll">
          <fieldset class="home-nearby-radii" aria-label="검색 반경 선택">
            ${[30,50,100,200,300].map(r=>`<label><input type="radio" name="homeNearbyRadius" value="${r}"${r===radius?' checked':''}><span>${r}km</span></label>`).join("")}
          </fieldset>
        </div>
      </div>
      <button id="homeNearbyStart" class="home-nearby-action-btn" type="button">위치 사용 / 내 주변 보기</button>
    </div>`;
  }
}
function renderNearestSection(){
  const host=document.getElementById("homeNearestBest"),toggle=section.querySelector("[data-toggle-nearest]");
  if(!host)return;
  if(state.hasLocation&&state.userCoords){
    const nearestList=getNearestPoints();
    if(nearestList.length>0){
      const top3=nearestList.slice(0,3),rest=nearestList.slice(3,10);
      host.innerHTML=`<div class="home-top-grid">${top3.map(nearestCard).join("")}</div>${state.nearestExpanded&&rest.length?`<div class="home-rank-list">${rest.map(nearestListCard).join("")}</div>`:""}`;
      if(toggle){
        toggle.hidden=nearestList.length<=3;
        toggle.textContent=state.nearestExpanded?"접기 ‹":"더보기 ›";
      }
    }else{
      host.innerHTML='<div class="home-empty"><strong>주변 포인트를 확인할 수 없습니다.</strong></div>';
      if(toggle)toggle.hidden=true;
    }
  }else{
    host.innerHTML='';
    if(toggle)toggle.hidden=true;
  }
}
function requestNearbyWithLocation(radius=100,silent=false){
  if(!navigator.geolocation){
    if(!silent)renderNearbySection("현재 브라우저에서 위치 정보를 지원하지 않습니다.");
    return;
  }
  if(!silent){
    const host=document.getElementById("homeNearbyBest");
    if(host)host.innerHTML='<div class="home-empty"><strong>내 주변 포인트를 확인하고 있어요...</strong>잠시만 기다려 주세요.</div>';
  }
  navigator.geolocation.getCurrentPosition(position=>{
    state.userCoords={latitude:position.coords.latitude,longitude:position.coords.longitude};
    state.hasLocation=true;
    state.nearbyRadius=radius;
    state.nearbyExpanded=false;
    state.nearestExpanded=false;
    window.SNORKYNearbyBest?.setRadius(radius);
    window.SNORKYNearbyBest?.runNearbyBest(position.coords.latitude,position.coords.longitude,radius);
    renderNearestSection();
  },error=>{
    state.hasLocation=false;
    if(!silent)renderNearbySection(error?.code===1?"위치 권한이 차단되었습니다. 브라우저 설정에서 허용해주세요.":"현재 위치를 확인할 수 없습니다.");
    renderNearestSection();
  },{enableHighAccuracy:false,timeout:10000,maximumAge:5*60*1000});
}
function checkInitialPermission(){
  if(navigator.permissions?.query){
    navigator.permissions.query({name:"geolocation"}).then(res=>{
      if(res.state==="granted")requestNearbyWithLocation(state.nearbyRadius||100,true);
    }).catch(()=>{});
  }
}
function populateRegions(){const select=document.getElementById("homeRegionFilter"),regions=Array.isArray(window.SNORKY_SUPABASE_REGIONS)?window.SNORKY_SUPABASE_REGIONS:[];if(!regions.length||select.options.length>1)return false;select.insertAdjacentHTML("beforeend",regions.map(region=>`<option value="${escapeHtml(region.id)}">${escapeHtml(region.name)}</option>`).join(""));populateMapRegions();setHeroImage();return true}
function renderWarning(){
  const host=document.getElementById("homeMarineWarning");
  if(!host)return;
  const safetyState=window.SNORKYMarineSafety?.state;
  if(safetyState?.status==="LOADING"||safetyState?.status==="UNKNOWN"){
    host.className="home-marine-warning";
    host.hidden=true;
    host.style.display="none";
    host.innerHTML="";
    host.onclick=null;
    return;
  }
  const allPoints=getAllActivePoints();
  const blockedPoints=allPoints.filter(point=>window.SNORKYMarineSafety?.statusForPoint(point)?.status==="BLOCK");
  if(blockedPoints.length>0){
    host.className="home-marine-warning is-warning";
    host.hidden=false;
    host.style.display="flex";
    host.innerHTML=`<span class="home-warning-text">⚠️ 일부 포인트에 해상특보가 발효 중입니다 · 확인하기</span><span class="home-warning-chevron">›</span>`;
    host.onclick=()=>{
      openWarningPointsOnMap();
    };
  }else{
    host.className="home-marine-warning";
    host.hidden=true;
    host.style.display="none";
    host.innerHTML="";
    host.onclick=null;
  }
}
section.addEventListener("click",event=>{
  const point=event.target.closest("[data-home-point]");
  if(point){
    const pointId=point.dataset.homePoint;
    const isToday=Boolean(point.closest("#homeTodayBest")||point.closest(".home-best-section"));
    const isNearby=Boolean(point.closest("#homeNearbyBest")||point.closest(".home-nearby-section")||point.closest("#homeNearestBest")||point.closest(".home-nearest-section"));
    const source=isToday?"todayBest":(isNearby?"nearby":"home");
    openPointOnMap(pointId,source,{lat:Number(point.dataset.homeLat),lng:Number(point.dataset.homeLng)});
    return;
  }
  if(event.target.closest("[data-toggle-today]")){state.todayExpanded=!state.todayExpanded;renderToday();return}
  if(event.target.closest("[data-toggle-nearby]")){state.nearbyExpanded=!state.nearbyExpanded;renderNearbySection();return}
  if(event.target.closest("[data-toggle-nearest]")){state.nearestExpanded=!state.nearestExpanded;renderNearestSection();return}
  if(event.target.closest("#homeNearbyStart")){requestNearbyWithLocation(state.nearbyRadius||100,false);return}
});
section.addEventListener("change",event=>{
  if(event.target.name==="homeNearbyRadius"){
    const radius=Number(event.target.value);
    state.nearbyRadius=radius;
    state.nearbyExpanded=false;
    state.nearbyTotalInRadius=undefined;
    window.SNORKYNearbyBest?.setRadius(radius);
    if(state.hasLocation&&state.userCoords){
      const host=document.getElementById("homeNearbyBest");
      if(host)host.innerHTML='<div class="home-empty"><strong>내 주변 포인트를 확인하고 있어요...</strong>잠시만 기다려 주세요.</div>';
      window.SNORKYNearbyBest?.runNearbyBest(state.userCoords.latitude,state.userCoords.longitude,radius);
    }
  }
});
const homeRegionSelect=document.getElementById("homeRegionFilter");
if(homeRegionSelect){
  homeRegionSelect.onchange=event=>{
    const val=event.target.value;
    if(!val){
      openPointOnMap(null,"all");
      return;
    }
    const regionName=event.target.options[event.target.selectedIndex]?.text||val;
    openPointOnMap(null,"region",{region:regionName});
  };
}
section.querySelectorAll("[data-home-target]").forEach(button=>button.onclick=()=>{
  const target=button.dataset.homeTarget;
  if(target==="favorites"){
    if(!window.SNORKYAuthSession?.isLoggedIn?.()){
      window.SNORKYAuthSession?.showLoginPrompt?.("즐겨찾기는 로그인 후 이용할 수 있어요.");
      return;
    }
    if(typeof openFavoritesOnMap==="function")openFavoritesOnMap();
    else openMapScreen();
  }else if(target==="today"){
    openPointOnMap(null,"todayBest");
  }else if(target==="forecast"){
    openPointOnMap(null,"all");
  }
});

const mapScreen=document.createElement("section");
mapScreen.id="snorkyMapScreen";
mapScreen.className="snorky-map-screen";
mapScreen.setAttribute("role","region");
mapScreen.setAttribute("aria-label","SNORKY 지도 화면");
mapScreen.innerHTML=`
  <header class="snorky-map-header">
    <button id="snorkyMapBackBtn" class="snorky-map-back" type="button" aria-label="뒤로가기">‹</button>
    <div class="snorky-map-title-wrap">
      <h1 id="snorkyMapTitle">SNORKY 지도</h1>
      <p id="snorkyMapSubTitle">스노클링 · 프리다이빙 포인트 탐색</p>
    </div>
  </header>
  <nav id="snorkyMapChipsBar" class="snorky-map-chips-bar" aria-label="지도 포인트 필터">
    <button class="snorky-map-chip active" type="button" data-map-filter="전체">전체</button>
    <button class="snorky-map-chip" type="button" data-map-filter="오늘의 베스트">오늘의 베스트</button>
    <button class="snorky-map-chip" type="button" data-map-filter="내 주변 추천">내 주변 추천</button>
    <button id="snorkyMapRegionBtn" class="snorky-map-chip snorky-map-region-chip" type="button" data-map-filter="지역">
      <span id="snorkyMapRegionLabel">지역</span>
    </button>
  </nav>
  <div id="snorkyMapRegionDropdown" class="snorky-map-region-dropdown" aria-hidden="true">
    <div class="snorky-map-region-dropdown-head">
      <span>지역 선택</span>
      <button id="snorkyMapRegionClose" type="button" aria-label="닫기">×</button>
    </div>
    <div id="snorkyMapRegionList" class="snorky-map-region-list"></div>
  </div>
  <div id="snorkyMapCanvas" class="snorky-map-canvas"></div>
  <div class="snorky-map-controls">
    <button id="snorkyMapLayerToggle" class="snorky-map-ctrl-btn" type="button" aria-label="지도 종류 변경" title="위성지도 보기">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2"/>
        <polyline points="2 17 12 22 22 17"/>
        <polyline points="2 12 12 17 22 12"/>
      </svg>
    </button>
    <button id="snorkyMapMyLocation" class="snorky-map-ctrl-btn" type="button" aria-label="내 위치 찾기" title="내 위치">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="7"/>
        <line x1="12" y1="1" x2="12" y2="4"/>
        <line x1="12" y1="20" x2="12" y2="23"/>
        <line x1="1" y1="12" x2="4" y2="12"/>
        <line x1="20" y1="12" x2="23" y2="12"/>
        <circle cx="12" cy="12" r="2" fill="currentColor"/>
      </svg>
    </button>
    <div class="snorky-map-zoom-group" role="group" aria-label="지도 확대 축소 바">
      <button id="snorkyMapZoomIn" class="snorky-map-zoom-btn" type="button" aria-label="지도 확대" title="확대">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
      <div id="snorkyMapZoomTrack" class="snorky-map-zoom-track" role="slider" aria-label="확대 축소 레벨" aria-valuemin="1" aria-valuemax="14" tabindex="0">
        <div class="snorky-map-zoom-rail">
          <div id="snorkyMapZoomThumb" class="snorky-map-zoom-thumb"></div>
        </div>
      </div>
      <button id="snorkyMapZoomOut" class="snorky-map-zoom-btn" type="button" aria-label="지도 축소" title="축소">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
  </div>
  <div id="snorkyMapBottomPanel" class="snorky-map-bottom-panel">
    <div id="snorkyMapSheetHandle" class="snorky-map-sheet-handle"></div>
    <div class="snorky-map-bottom-content">
      <div id="snorkyMapNearestBox">
        <div class="snorky-map-panel-head">
          <h3 id="snorkyMapPanelTitle">가까운 포인트</h3>
          <button id="snorkyMapToggleMore" class="home-inline-more" type="button">더보기 ›</button>
        </div>
        <div id="snorkyMapCardsTrack" class="snorky-map-cards-track"></div>
      </div>
      <div id="snorkyMapWarningBox" hidden>
        <div id="snorkyMapWarningCards" class="snorky-map-cards-track"></div>
      </div>
      <div id="snorkyMapPreviewCard" class="snorky-map-preview-card"></div>
    </div>
  </div>
`;
document.body.appendChild(mapScreen);

let snorkyMap=null;
let snorkyMapMarkers=[];
let snorkyUserOverlay=null;
let snorkyUserAccuracyCircle=null;
let snorkyMapActiveFilter="전체";
let snorkyMapWarningMode=false;
let snorkyMapSelectedRegion="";
let snorkyMapSelectedPoint=null;
let snorkyMapExpanded=false;
let snorkyMapPreviewRequestId=0;
let lastMapExpandedState=false;
let snorkyMapLayerType="roadmap";
let snorkyMapActiveWarningIndex=0;
let snorkyMapWarningOverlays=[];

function resetSnorkyMapToGeneral(){
  snorkyMapWarningMode=false;
  snorkyMapActiveFilter="전체";
  snorkyMapSelectedRegion="";
  snorkyMapSelectedPoint=null;
  snorkyMapExpanded=false;
  lastMapExpandedState=false;
  snorkyMapActiveWarningIndex=0;
  snorkyMapWarningOverlays.forEach(o=>o.setMap(null));
  snorkyMapWarningOverlays=[];

  const preview=document.getElementById("snorkyMapPreviewCard");
  const nearestBox=document.getElementById("snorkyMapNearestBox");
  const warningBox=document.getElementById("snorkyMapWarningBox");
  const panel=document.getElementById("snorkyMapBottomPanel");
  if(preview)preview.classList.remove("open");
  if(panel)panel.classList.remove("has-preview","expanded");
  if(nearestBox)nearestBox.style.display="";
  if(warningBox)warningBox.hidden=true;
}

function populateMapRegions(){
  const listEl=document.getElementById("snorkyMapRegionList");
  if(!listEl)return;
  const regions=Array.isArray(window.SNORKY_SUPABASE_REGIONS)?window.SNORKY_SUPABASE_REGIONS:[];
  let regionNames=[];
  if(snorkyMapActiveFilter==="즐겨찾기"){
    const favPoints=getFilteredPoints();
    regionNames=[...new Set(favPoints.map(p=>p.region).filter(Boolean))];
  }else if(regions.length){
    regionNames=regions.map(r=>r.name||r.id).filter(Boolean);
  }else{
    const points=Array.isArray(window.SNORKY_ACTIVE_POINTS)?window.SNORKY_ACTIVE_POINTS:[];
    regionNames=[...new Set(points.map(p=>p.region).filter(Boolean))];
  }
  const allOpt=`<button type="button" class="snorky-map-region-opt${!snorkyMapSelectedRegion?' active':''}" data-map-region-val="">전체</button>`;
  const itemsHtml=regionNames.map(name=>{
    const isActive=(snorkyMapSelectedRegion===name)?' active':'';
    return `<button type="button" class="snorky-map-region-opt${isActive}" data-map-region-val="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
  }).join("");
  listEl.innerHTML=allOpt+itemsHtml;
}

function renderSnorkyMapChipsBar(){
  const chipsBar=document.getElementById("snorkyMapChipsBar");
  const titleEl=document.getElementById("snorkyMapTitle");
  const subTitleEl=document.getElementById("snorkyMapSubTitle");
  if(!chipsBar)return;

  if(snorkyMapWarningMode&&snorkyMapActiveFilter==="해상특보"){
    if(titleEl)titleEl.textContent="SNORKY 지도";
    if(subTitleEl)subTitleEl.textContent="스노클링 · 프리다이빙 포인트 탐색";
    chipsBar.style.display="";
    chipsBar.innerHTML='<span class="snorky-map-warning-filter-label" style="display:inline-flex;align-items:center;min-height:34px;padding:0 13px;color:#183650;font-size:13px;font-weight:900;white-space:nowrap;">특보 영향 포인트</span>';
  }else if(snorkyMapActiveFilter==="즐겨찾기"){
    if(titleEl)titleEl.textContent="SNORKY 즐겨찾기";
    const favPoints=getFilteredPoints();
    if(subTitleEl)subTitleEl.textContent=`저장된 포인트 ${favPoints.length}개`;
    chipsBar.style.display="none";
    chipsBar.innerHTML="";
  }else{
    chipsBar.style.display="";
    if(titleEl)titleEl.textContent="SNORKY 지도";
    if(subTitleEl)subTitleEl.textContent="스노클링 · 프리다이빙 포인트 탐색";

    const isAll=snorkyMapActiveFilter==="전체";
    const isToday=snorkyMapActiveFilter==="오늘의 베스트";
    const isNearby=snorkyMapActiveFilter==="내 주변 추천";
    const isRegion=snorkyMapActiveFilter==="지역";

    chipsBar.innerHTML=`
      <button class="snorky-map-chip${isAll?' active':''}" type="button" data-map-filter="전체">전체</button>
      <button class="snorky-map-chip${isToday?' active':''}" type="button" data-map-filter="오늘의 베스트">오늘의 베스트</button>
      <button class="snorky-map-chip${isNearby?' active':''}" type="button" data-map-filter="내 주변 추천">내 주변 추천</button>
      <button id="snorkyMapRegionBtn" class="snorky-map-chip snorky-map-region-chip${isRegion?' active':''}" type="button" data-map-filter="지역">
        <span id="snorkyMapRegionLabel">${snorkyMapSelectedRegion||'지역'}</span>
      </button>
    `;
  }
}

function renderSnorkyUserLocation(){
  if(!snorkyMap||!window.kakao?.maps)return;
  if(snorkyUserOverlay){
    snorkyUserOverlay.setMap(null);
    snorkyUserOverlay=null;
  }
  if(snorkyUserAccuracyCircle){
    snorkyUserAccuracyCircle.setMap(null);
    snorkyUserAccuracyCircle=null;
  }
  if(state.hasLocation&&state.userCoords&&Number.isFinite(state.userCoords.latitude)&&Number.isFinite(state.userCoords.longitude)){
    const position=new kakao.maps.LatLng(state.userCoords.latitude,state.userCoords.longitude);
    const accRadius=Math.max(Number(state.userCoords.accuracy)||100,50);
    snorkyUserAccuracyCircle=new kakao.maps.Circle({
      center:position,
      radius:accRadius,
      strokeWeight:1.5,
      strokeColor:"#007aff",
      strokeOpacity:0.45,
      strokeStyle:"solid",
      fillColor:"#007aff",
      fillOpacity:0.1,
      zIndex:50
    });
    snorkyUserAccuracyCircle.setMap(snorkyMap);

    const content=document.createElement("div");
    content.className="snorky-my-location-marker";
    content.innerHTML='<div class="snorky-my-location-pulse"></div><div class="snorky-my-location-dot"></div><div class="snorky-my-location-label">내 위치</div>';
    snorkyUserOverlay=new kakao.maps.CustomOverlay({
      map:snorkyMap,
      position:position,
      content:content,
      yAnchor:0.5,
      xAnchor:0.5,
      zIndex:60
    });
  }
}

function applySnorkyMapInitialViewport(includeUser=false){
  if(!snorkyMap||!window.kakao?.maps)return;
  const filtered=getFilteredPoints();
  const allPoints=getAllActivePoints();
  const valid=allPoints.filter(p=>p&&p.lat!=null&&p.lng!=null&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)));
  if(!valid.length)return;

  const bounds=new kakao.maps.LatLngBounds();

  if(snorkyMapWarningMode&&snorkyMapActiveFilter==="해상특보"){
    const warningCards=getSnorkyMapWarningCards(filtered);
    const activeCard=warningCards[snorkyMapActiveWarningIndex]||warningCards[0];
    const targetPoints=activeCard?.points?.length?activeCard.points:filtered;
    if(targetPoints.length>0){
      targetPoints.forEach(p=>bounds.extend(new kakao.maps.LatLng(Number(p.lat),Number(p.lng))));
      snorkyMap.setBounds(bounds,115,40,225,40);
    }
    return;
  }

  if(snorkyMapActiveFilter==="즐겨찾기"){
    if(filtered.length>0){
      filtered.forEach(p=>bounds.extend(new kakao.maps.LatLng(Number(p.lat),Number(p.lng))));
      snorkyMap.setBounds(bounds,115,40,225,40);
    }else{
      snorkyMap.setCenter(new kakao.maps.LatLng(37.5, 128.0));
      snorkyMap.setLevel(11);
    }
    return;
  }

  if(snorkyMapActiveFilter==="전체"){
    if(state.hasLocation&&state.userCoords&&Number.isFinite(Number(state.userCoords.latitude))&&Number.isFinite(Number(state.userCoords.longitude))){
      bounds.extend(new kakao.maps.LatLng(Number(state.userCoords.latitude),Number(state.userCoords.longitude)));
    }
    valid.forEach(p=>bounds.extend(new kakao.maps.LatLng(Number(p.lat),Number(p.lng))));
    snorkyMap.setBounds(bounds,115,40,225,40);
    return;
  }

  if((includeUser||snorkyMapActiveFilter==="내 주변 추천")&&state.hasLocation&&state.userCoords){
    bounds.extend(new kakao.maps.LatLng(state.userCoords.latitude,state.userCoords.longitude));
    const targetPoints=filtered.length>0?filtered.slice(0,12):valid.slice(0,5);
    targetPoints.forEach(p=>bounds.extend(new kakao.maps.LatLng(Number(p.lat),Number(p.lng))));
    snorkyMap.setBounds(bounds,115,40,225,40);
    return;
  }

  const targetPoints=filtered.length>0?filtered:(valid.filter(p=>p.region==="강릉"||p.regionId==="region-gangneung"||String(p.region).includes("강릉")).slice(0,8));
  if(targetPoints.length>0){
    targetPoints.forEach(p=>bounds.extend(new kakao.maps.LatLng(Number(p.lat),Number(p.lng))));
    snorkyMap.setBounds(bounds,115,40,225,40);
  }
}

function openMapScreen(){
  mapScreen.classList.add("open");
  document.body.classList.remove("home-show-legacy");
  setBottomActive(snorkyMapActiveFilter==="즐겨찾기"?"favorites":"map");
  populateMapRegions();
  renderSnorkyMapChipsBar();
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      state.userCoords={
        latitude:pos.coords.latitude,
        longitude:pos.coords.longitude,
        accuracy:pos.coords.accuracy
      };
      state.hasLocation=true;
      if(snorkyMap){
        renderSnorkyUserLocation();
        if(snorkyMapSelectedPoint){
          renderSnorkyMapMarkers();
          focusSelectedPointAndUser(snorkyMapSelectedPoint);
        }else if(snorkyMapActiveFilter==="내 주변 추천"){
          renderSnorkyMapMarkers();
          renderSnorkyMapBottomCards();
          applySnorkyMapInitialViewport(true);
        }
      }
    },err=>{
      console.warn("[Map Screen] GPS 확인 불가:",err?.message);
    },{enableHighAccuracy:false,timeout:5000,maximumAge:60000});
  }
  initOrUpdateSnorkyMap();
  updateSnorkyMapZoomBar();
  requestAnimationFrame(()=>{
    if(snorkyMap){
      snorkyMap.relayout();
      if(!snorkyMapSelectedPoint)applySnorkyMapInitialViewport(state.hasLocation&&!!state.userCoords);
    }
  });
}

function openPointOnMap(pointId,source="home",options={}){
  const allPoints=[...getAllActivePoints(),...(state.nearbyRows||[]),...(state.todayRows||[])];
  const matchedPoint=allPoints.find(p=>String(p.supabaseId||p.id||"")===String(pointId)||String(p.id||"")===String(pointId)||String(p.legacy_id||p.legacyId||"")===String(pointId)||p.name===pointId);
  const optionLat=Number(options.lat),optionLng=Number(options.lng);
  const targetPoint=matchedPoint&&Number.isFinite(optionLat)&&Number.isFinite(optionLng)?{...matchedPoint,lat:optionLat,lng:optionLng}:matchedPoint;
  if(!targetPoint){
    console.warn("[SNORKY openPointOnMap] Point not found:",pointId);
    return false;
  }

  snorkyMapWarningMode=false;

  // 1. Determine filter and region based on source and options
  if(source==="todayBest"||options.filter==="오늘의 베스트"){
    snorkyMapActiveFilter="오늘의 베스트";
    snorkyMapSelectedRegion="";
  }else if(source==="nearby"||source==="nearbyBest"||source==="nearbyPoint"||source==="nearest"||options.filter==="내 주변 추천"){
    snorkyMapActiveFilter="내 주변 추천";
    snorkyMapSelectedRegion="";
  }else if(source==="favorites"||options.filter==="즐겨찾기"){
    snorkyMapActiveFilter="즐겨찾기";
    snorkyMapSelectedRegion="";
  }else if(source==="search"||source==="pointSearch"||source==="region"||options.filter==="지역"){
    const regionName=options.region||targetPoint.region||"";
    snorkyMapActiveFilter="지역";
    snorkyMapSelectedRegion=regionName;
  }else{
    if(targetPoint.region){
      snorkyMapActiveFilter="지역";
      snorkyMapSelectedRegion=targetPoint.region;
    }else{
      snorkyMapActiveFilter="전체";
      snorkyMapSelectedRegion="";
    }
  }


  // 3. Open Map Screen
  openMapScreen();

  // 4. Render markers and bottom cards
  renderSnorkyMapMarkers();
  renderSnorkyMapBottomCards();

  // 5. Select point on map (centers map, zooms to level 3, displays preview card at bottom)
  selectPointOnMap(targetPoint);
  return true;
}

function openFavoritesOnMap(){
  if(!window.SNORKYAuthSession?.isLoggedIn?.()){
    window.SNORKYAuthSession?.showLoginPrompt?.("즐겨찾기는 로그인 후 이용할 수 있어요.");
    return;
  }
  document.body.classList.remove("home-show-legacy");
  snorkyMapWarningMode=false;
  snorkyMapActiveFilter="즐겨찾기";
  snorkyMapSelectedRegion="";
  const regionLabel=document.getElementById("snorkyMapRegionLabel");
  if(regionLabel)regionLabel.textContent="지역";
  snorkyMapSelectedPoint=null;
  snorkyMapExpanded=false;
  const preview=document.getElementById("snorkyMapPreviewCard");
  const nearestBox=document.getElementById("snorkyMapNearestBox");
  const panel=document.getElementById("snorkyMapBottomPanel");
  if(preview)preview.classList.remove("open");
  if(panel)panel.classList.remove("has-preview");
  if(nearestBox)nearestBox.style.display="";
  openMapScreen();
  renderSnorkyMapMarkers();
  renderSnorkyMapBottomCards();
  applySnorkyMapInitialViewport(false);
}

function openWarningPointsOnMap(){
  document.body.classList.remove("home-show-legacy");
  snorkyMapWarningMode=true;
  snorkyMapActiveFilter="해상특보";
  snorkyMapSelectedRegion="";
  snorkyMapActiveWarningIndex=0;
  const regionLabel=document.getElementById("snorkyMapRegionLabel");
  if(regionLabel)regionLabel.textContent="지역";
  snorkyMapSelectedPoint=null;
  snorkyMapExpanded=false;
  const preview=document.getElementById("snorkyMapPreviewCard");
  const nearestBox=document.getElementById("snorkyMapNearestBox");
  const panel=document.getElementById("snorkyMapBottomPanel");
  if(preview)preview.classList.remove("open");
  if(panel)panel.classList.remove("has-preview");
  if(nearestBox)nearestBox.style.display="";
  openMapScreen();
  renderSnorkyMapMarkers();
  renderSnorkyMapBottomCards();
  applySnorkyMapInitialViewport(false);
}

window.openMapScreen=openMapScreen;
window.closeMapScreen=closeMapScreen;
window.selectPointOnMap=selectPointOnMap;
window.openPointOnMap=openPointOnMap;
window.openFavoritesOnMap=openFavoritesOnMap;
window.openWarningPointsOnMap=openWarningPointsOnMap;
window.getAllActivePoints=getAllActivePoints;
window.renderHomeWarning=renderWarning;
window.getFilteredPoints=getFilteredPoints;
window.getSnorkyMapPanelTitle=getSnorkyMapPanelTitle;

function closeMapScreen(){
  mapScreen.classList.remove("open");
  document.body.classList.remove("home-show-legacy");
  resetSnorkyMapToGeneral();
  setBottomActive("home");
}

function makeGoldMarkerSvg(rank,active){
  const size=active?46:38;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
    <defs>
      <linearGradient id="goldG_${rank}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fbbf24"/>
        <stop offset="100%" stop-color="#d97706"/>
      </linearGradient>
    </defs>
    <path fill="url(#goldG_${rank})" stroke="#ffffff" stroke-width="3" d="M24 3C14.1 3 6 11.1 6 21c0 12.4 18 24 18 24s18-11.6 18-24C42 11.1 33.9 3 24 3z"/>
    <circle cx="24" cy="20" r="10" fill="#ffffff"/>
    <text x="24" y="24" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="12" font-weight="900" fill="#92400e" text-anchor="middle">${rank}</text>
  </svg>`;
  return new kakao.maps.MarkerImage(`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,new kakao.maps.Size(size,size),{offset:new kakao.maps.Point(size/2,size)});
}

function makeBlueMarkerSvg(active){
  const size=active?44:34;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
    <defs>
      <linearGradient id="blueG" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#3b82f6"/>
        <stop offset="100%" stop-color="#1d4ed8"/>
      </linearGradient>
    </defs>
    <path fill="url(#blueG)" stroke="#ffffff" stroke-width="3" d="M24 3C14.1 3 6 11.1 6 21c0 12.4 18 24 18 24s18-11.6 18-24C42 11.1 33.9 3 24 3z"/>
    <circle cx="24" cy="20" r="6.5" fill="#ffffff"/>
    <circle cx="24" cy="20" r="3" fill="#1d4ed8"/>
  </svg>`;
  return new kakao.maps.MarkerImage(`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,new kakao.maps.Size(size,size),{offset:new kakao.maps.Point(size/2,size)});
}

function makeWarningMarkerSvg(active){
  const size=active?48:36;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
    <defs>
      <linearGradient id="warnG_${active?'act':'std'}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${active?'#ef4444':'#f87171'}"/>
        <stop offset="100%" stop-color="${active?'#b91c1c':'#dc2626'}"/>
      </linearGradient>
    </defs>
    <path fill="url(#warnG_${active?'act':'std'})" stroke="#ffffff" stroke-width="${active?3.5:2.5}" d="M24 3C14.1 3 6 11.1 6 21c0 12.4 18 24 18 24s18-11.6 18-24C42 11.1 33.9 3 24 3z"/>
    <circle cx="24" cy="20" r="${active?8:6}" fill="#ffffff"/>
    <text x="24" y="${active?25:23}" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="${active?14:11}" font-weight="900" fill="${active?'#b91c1c':'#dc2626'}" text-anchor="middle">!</text>
  </svg>`;
  return new kakao.maps.MarkerImage(`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,new kakao.maps.Size(size,size),{offset:new kakao.maps.Point(size/2,size)});
}

function getFilteredPoints(){
  const allPoints=getAllActivePoints();
  const valid=allPoints.filter(p=>p&&p.lat!=null&&p.lng!=null&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)));
  
  const todaySnapshot=window.SNORKYTodayBest?.getSnapshot?.();
  const todayRows=todaySnapshot?.homeRows||state.todayRows||[];
  const todayMap=new Map();
  todayRows.forEach(r=>{
    todayMap.set(String(r.supabaseId||r.id),r);
  });

  const withDistance=valid.map(p=>{
    let distance=Infinity;
    if(state.userCoords){
      distance=haversineKm(state.userCoords.latitude,state.userCoords.longitude,Number(p.lat),Number(p.lng));
    }
    const todayMatch=todayMap.get(String(p.supabaseId||p.id));
    const score=todayMatch?.score!=null?todayMatch.score:p.score;
    return{...p,distance,score};
  });

  if(snorkyMapWarningMode&&snorkyMapActiveFilter==="해상특보"){
    return withDistance.filter(p=>window.SNORKYMarineSafety?.statusForPoint(p)?.status==="BLOCK");
  }

  if(snorkyMapActiveFilter==="오늘의 베스트"){
    const todaySnapshot=window.SNORKYTodayBest?.getSnapshot?.();
    const todayRows=todaySnapshot?.homeRows||state.todayRows||[];
    if(todayRows.length>0){
      return [...todayRows];
    }
    return withDistance.filter(p=>p.score&&p.score>=50).sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,10);
  }

  if(snorkyMapActiveFilter==="내 주변 추천"){
    const nearbySnapshotRows=state.nearbyRows||[];
    if(nearbySnapshotRows.length>0){
      return [...nearbySnapshotRows];
    }
    const radius=state.nearbyRadius||100;
    return withDistance
      .filter(p=>p.distance<=radius&&p.score&&p.score>=50)
      .sort((a,b)=>(a.distance-b.distance)||(b.score||0)-(a.score||0))
      .slice(0,10);
  }

  if(snorkyMapActiveFilter==="지역"&&snorkyMapSelectedRegion){
    return withDistance.filter(p=>p.region===snorkyMapSelectedRegion||p.regionId===snorkyMapSelectedRegion||String(p.region).includes(snorkyMapSelectedRegion));
  }

  if(snorkyMapActiveFilter==="즐겨찾기"){
    const isFav=p=>{
      if(typeof window.SNORKYEngagement?.isFavorite==="function"){
        return window.SNORKYEngagement.isFavorite(p)||
               window.SNORKYEngagement.isFavorite(String(p.id))||
               (p.supabaseId&&window.SNORKYEngagement.isFavorite(String(p.supabaseId)));
      }
      try{
        const favs=JSON.parse(localStorage.getItem("snorky_favorites")||"[]");
        const set=new Set(favs);
        return set.has(String(p.id))||(p.supabaseId&&set.has(String(p.supabaseId)));
      }catch(_){
        return false;
      }
    };
    return withDistance.filter(isFav);
  }

  return withDistance;
}

function initOrUpdateSnorkyMap(){
  if(!window.kakao?.maps){
    setTimeout(initOrUpdateSnorkyMap,300);
    return;
  }
  const container=document.getElementById("snorkyMapCanvas");
  if(!container)return;
  
  const allPoints=getAllActivePoints();
  const initialLat=state.userCoords?.latitude||(allPoints[0]?Number(allPoints[0].lat):37.795);
  const initialLng=state.userCoords?.longitude||(allPoints[0]?Number(allPoints[0].lng):128.919);
  const center=new kakao.maps.LatLng(initialLat,initialLng);
  
  if(!snorkyMap){
    snorkyMap=new kakao.maps.Map(container,{center,level:8});
    snorkyMap.setMapTypeId(snorkyMapLayerType==="hybrid"?kakao.maps.MapTypeId.HYBRID:kakao.maps.MapTypeId.ROADMAP);
    
    kakao.maps.event.addListener(snorkyMap,"click",()=>{
      const preview=document.getElementById("snorkyMapPreviewCard");
      const nearestBox=document.getElementById("snorkyMapNearestBox");
      const panel=document.getElementById("snorkyMapBottomPanel");
      if(preview&&preview.classList.contains("open")){
        preview.classList.remove("open");
        if(panel)panel.classList.remove("has-preview");
        if(nearestBox)nearestBox.style.display="";
        snorkyMapSelectedPoint=null;
        renderSnorkyMapMarkers();
        renderSnorkyMapBottomCards();
        applySnorkyMapInitialViewport(snorkyMapActiveFilter==="내 주변 추천");
      }
      if(snorkyMapExpanded){
        snorkyMapExpanded=false;
        renderSnorkyMapBottomCards();
      }
    });

    kakao.maps.event.addListener(snorkyMap,"zoom_changed",()=>{
      updateSnorkyMapZoomBar();
    });
  }else{
    snorkyMap.relayout();
  }
  applySnorkyMapInitialViewport(state.hasLocation&&!!state.userCoords);
  renderSnorkyMapMarkers();
  renderSnorkyMapBottomCards();
  attachSnorkyMapZoomEvents();
  updateSnorkyMapZoomBar();
}

function updateSnorkyMapZoomBar(){
  if(!snorkyMap||!window.kakao?.maps)return;
  const thumb=document.getElementById("snorkyMapZoomThumb");
  const track=document.getElementById("snorkyMapZoomTrack");
  if(!thumb)return;
  const level=snorkyMap.getLevel();
  const clamped=Math.max(1,Math.min(14,Number(level)||8));
  const percent=((clamped-1)/(14-1))*100;
  thumb.style.top=`${percent}%`;
  if(track){
    track.setAttribute("aria-valuenow",clamped);
  }
}

function attachSnorkyMapZoomEvents(){
  const track=document.getElementById("snorkyMapZoomTrack");
  if(!track||track.dataset.zoomBound)return;
  track.dataset.zoomBound="true";

  let isDragging=false;

  const setLevelFromEvent=event=>{
    if(!snorkyMap||!window.kakao?.maps)return;
    const rail=track.querySelector(".snorky-map-zoom-rail")||track;
    const rect=rail.getBoundingClientRect();
    const clientY=event.touches?event.touches[0].clientY:event.clientY;
    const offset=Math.max(0,Math.min(rect.height,clientY-rect.top));
    const ratio=rect.height>0?offset/rect.height:0.5;
    const targetLevel=Math.round(1+ratio*13);
    const clamped=Math.max(1,Math.min(14,targetLevel));
    snorkyMap.setLevel(clamped,{animate:{duration:120}});
    updateSnorkyMapZoomBar();
  };

  track.addEventListener("pointerdown",event=>{
    event.stopPropagation();
    event.preventDefault();
    isDragging=true;
    track.setPointerCapture?.(event.pointerId);
    setLevelFromEvent(event);
  });

  track.addEventListener("pointermove",event=>{
    if(!isDragging)return;
    event.stopPropagation();
    event.preventDefault();
    setLevelFromEvent(event);
  });

  const stopDrag=event=>{
    if(isDragging){
      isDragging=false;
      try{track.releasePointerCapture?.(event.pointerId)}catch(_){}
    }
  };

  track.addEventListener("pointerup",stopDrag);
  track.addEventListener("pointercancel",stopDrag);
}

function renderSnorkyMapMarkers(){
  if(!snorkyMap||!window.kakao?.maps)return;
  snorkyMapMarkers.forEach(m=>m.setMap(null));
  snorkyMapMarkers=[];
  snorkyMapWarningOverlays.forEach(o=>o.setMap(null));
  snorkyMapWarningOverlays=[];

  const filtered=getFilteredPoints();

  if(snorkyMapWarningMode&&snorkyMapActiveFilter==="해상특보"){
    const warningCards=getSnorkyMapWarningCards(filtered);
    if(snorkyMapActiveWarningIndex>=warningCards.length){
      snorkyMapActiveWarningIndex=0;
    }
    
    warningCards.forEach((card,cardIdx)=>{
      const isActiveCard=cardIdx===snorkyMapActiveWarningIndex;
      let sumLat=0,sumLng=0,validCount=0;

      card.points.forEach(point=>{
        const lat=Number(point.lat),lng=Number(point.lng);
        if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
        sumLat+=lat;
        sumLng+=lng;
        validCount++;

        const isSelected=snorkyMapSelectedPoint&&String(snorkyMapSelectedPoint.supabaseId||snorkyMapSelectedPoint.id)===String(point.supabaseId||point.id);
        const markerImage=makeWarningMarkerSvg(isActiveCard||isSelected);
        const marker=new kakao.maps.Marker({
          map:snorkyMap,
          position:new kakao.maps.LatLng(lat,lng),
          image:markerImage,
          title:`[${card.typeLevel}] ${point.name}`,
          zIndex:isActiveCard?35:(isSelected?30:10)
        });
        kakao.maps.event.addListener(marker,"click",()=>{
          setActiveWarningIndex(cardIdx,true,false);
        });
        snorkyMapMarkers.push(marker);
      });

      if(validCount>0){
        const centerLat=sumLat/validCount;
        const centerLng=sumLng/validCount;
        const badgeDiv=document.createElement("div");
        badgeDiv.className=`snorky-map-warning-overlay-badge${isActiveCard?' is-active':''}`;
        badgeDiv.setAttribute("role","button");
        badgeDiv.setAttribute("tabindex","0");
        badgeDiv.style.cssText=isActiveCard
          ? "display:inline-flex;align-items:center;gap:5px;padding:6px 12px;background:#b42318;color:#fff;border:2px solid #fff;border-radius:20px;font-size:12.5px;font-weight:900;box-shadow:0 4px 16px rgba(180,35,24,.4);cursor:pointer;transform:scale(1.06);transition:all .15s ease;white-space:nowrap;user-select:none;"
          : "display:inline-flex;align-items:center;gap:4px;padding:4px 9px;background:rgba(255,255,255,.94);color:#b42318;border:1.5px solid #fecdca;border-radius:16px;font-size:11.5px;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,.15);cursor:pointer;transition:all .15s ease;white-space:nowrap;user-select:none;";
        badgeDiv.innerHTML=`<span style="font-size:13px;line-height:1;">⚠️</span><span>${escapeHtml(card.typeLevel)}</span><small style="opacity:${isActiveCard?'.9':'.75'};font-size:${isActiveCard?'11px':'10.5px'};margin-left:2px;">${escapeHtml(card.areaName)}</small>`;

        badgeDiv.addEventListener("click",(e)=>{
          e.stopPropagation();
          setActiveWarningIndex(cardIdx,true,true);
        });

        const overlay=new kakao.maps.CustomOverlay({
          map:snorkyMap,
          position:new kakao.maps.LatLng(centerLat,centerLng),
          content:badgeDiv,
          yAnchor:1.4,
          xAnchor:0.5,
          zIndex:isActiveCard?100:20
        });
        snorkyMapWarningOverlays.push(overlay);
      }
    });

    renderSnorkyUserLocation();
    return;
  }

  const selectedId=snorkyMapSelectedPoint?String(snorkyMapSelectedPoint.supabaseId||snorkyMapSelectedPoint.id):null;
  const selectedHasCoordinates=snorkyMapSelectedPoint&&Number.isFinite(Number(snorkyMapSelectedPoint.lat))&&Number.isFinite(Number(snorkyMapSelectedPoint.lng));
  const markerPoints=selectedHasCoordinates&&!filtered.some(point=>String(point.supabaseId||point.id)===selectedId)
    ? [...filtered,snorkyMapSelectedPoint]
    : filtered;
  const todaySnapshot=window.SNORKYTodayBest?.getSnapshot?.();
  const topToday=(todaySnapshot?.homeRows||[]).slice(0,3);
  const topRankMap=new Map();
  topToday.forEach((p,idx)=>{
    topRankMap.set(String(p.supabaseId||p.id),idx+1);
  });

  markerPoints.forEach(point=>{
    const pointIdStr=String(point.supabaseId||point.id);
    const rank=topRankMap.get(pointIdStr);
    const isSelected=snorkyMapSelectedPoint&&String(snorkyMapSelectedPoint.supabaseId||snorkyMapSelectedPoint.id)===pointIdStr;
    const markerImage=rank?makeGoldMarkerSvg(rank,isSelected):makeBlueMarkerSvg(isSelected);
    const marker=new kakao.maps.Marker({
      map:snorkyMap,
      position:new kakao.maps.LatLng(Number(point.lat),Number(point.lng)),
      image:markerImage,
      title:point.name,
      zIndex:isSelected?30:(rank?20-rank:5)
    });
    kakao.maps.event.addListener(marker,"click",()=>{
      selectPointOnMap(point);
    });
    snorkyMapMarkers.push(marker);
  });
  renderSnorkyUserLocation();
}

function focusSelectedPointAndUser(point){
  if(!snorkyMap||!window.kakao?.maps||!point)return;
  const lat=Number(point.lat),lng=Number(point.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
  const pointLatLng=new kakao.maps.LatLng(lat,lng);
  snorkyMap.setLevel(4);
  snorkyMap.setCenter(pointLatLng);
}

function selectPointOnMap(point){
  if(!point)return;
  if(snorkyMapWarningMode){
    const preview=document.getElementById("snorkyMapPreviewCard");
    const panel=document.getElementById("snorkyMapBottomPanel");
    if(preview)preview.classList.remove("open");
    if(panel)panel.classList.remove("has-preview");
    snorkyMapSelectedPoint=null;
    snorkyMapExpanded=false;
    renderSnorkyMapBottomCards();
    return;
  }
  if(snorkyMapExpanded){
    lastMapExpandedState=true;
  }
  snorkyMapSelectedPoint=point;
  snorkyMapExpanded=false;

  const lat=Number(point.lat);
  const lng=Number(point.lng);

  // 상세 바텀시트 프리뷰는 지도 SDK 준비 여부와 무관하게 표시
  showPointPreviewCard(point);

  if(!snorkyMap||!window.kakao?.maps||!Number.isFinite(lat)||!Number.isFinite(lng))return;

  // 1. 마커 상태 갱신
  renderSnorkyMapMarkers();

  // 3. 선택 포인트 지역이 보이도록 중심/줌 설정
  focusSelectedPointAndUser(point);

  // 4. 바텀시트 렌더링 후 relayout 및 실제 보이는 지도 영역(viewport) 기준 중심 보정
  requestAnimationFrame(()=>{
    if(!snorkyMap)return;
    snorkyMap.relayout();
    focusSelectedPointAndUser(point);

    const canvas=document.getElementById("snorkyMapCanvas");
    const panel=document.getElementById("snorkyMapBottomPanel");
    const chips=document.querySelector(".snorky-map-chips-bar");
    const header=document.querySelector(".snorky-map-header");
    if(canvas){
      const canvasRect=canvas.getBoundingClientRect();
      const topCover=chips?chips.getBoundingClientRect().bottom:(header?header.getBoundingClientRect().bottom:canvasRect.top);
      const panelTop=(panel&&panel.classList.contains("has-preview"))?panel.getBoundingClientRect().top:canvasRect.bottom;

      const visibleTop=Math.max(0,topCover-canvasRect.top);
      const visibleBottom=Math.max(visibleTop,Math.min(canvasRect.height,panelTop-canvasRect.top));
      const visibleHeight=visibleBottom-visibleTop;

      if(visibleHeight>40&&canvasRect.height>0){
        const visibleCenterY=visibleTop+(visibleHeight/2);
        const canvasCenterY=canvasRect.height/2;
        const shiftY=Math.round(canvasCenterY-visibleCenterY);
        if(Math.abs(shiftY)>=1){
          snorkyMap.panBy(0,shiftY);
        }
      }
    }
    updateSnorkyMapZoomBar();
  });
}

function captureMapReturnState(){
  const track=document.getElementById("snorkyMapCardsTrack");
  const panel=document.getElementById("snorkyMapBottomPanel");
  const preview=document.getElementById("snorkyMapPreviewCard");
  let center=null;
  let level=3;
  if(snorkyMap&&window.kakao?.maps){
    const c=snorkyMap.getCenter();
    if(c){
      center={lat:c.getLat(),lng:c.getLng()};
    }
    level=snorkyMap.getLevel();
  }
  const isExpanded=Boolean(snorkyMapExpanded||lastMapExpandedState||(panel&&panel.classList.contains("expanded")));
  const isPreviewOpen=Boolean(preview&&preview.classList.contains("open"));
  const stateSnapshot={
    view:"map",
    expanded:isExpanded,
    previewOpen:isPreviewOpen,
    activeFilter:snorkyMapActiveFilter,
    warningMode:snorkyMapWarningMode,
    selectedRegion:snorkyMapSelectedRegion,
    selectedPointId:snorkyMapSelectedPoint?String(snorkyMapSelectedPoint.supabaseId||snorkyMapSelectedPoint.id):null,
    trackScrollTop:track?track.scrollTop:0,
    panelScrollTop:panel?panel.scrollTop:0,
    center,
    level,
    layerType:snorkyMapLayerType
  };
  console.info("[MAP RESTORE] captureMapReturnState", stateSnapshot);
  return stateSnapshot;
}

function restoreMapState(returnState){
  if(!returnState)return;
  console.info("[MAP RESTORE] restoreMapState execute", returnState);

  // 1. 지도 화면 표시 유지
  mapScreen.classList.add("open");
  setBottomActive("map");

  // 2. 필터 상태 복원
  if(returnState.activeFilter){
    snorkyMapActiveFilter=returnState.activeFilter;
  }
  snorkyMapWarningMode=Boolean(returnState.warningMode);
  snorkyMapSelectedRegion=returnState.selectedRegion||"";

  mapScreen.querySelectorAll("[data-map-filter]").forEach(c=>{
    c.classList.toggle("active",c.dataset.mapFilter===(snorkyMapSelectedRegion?"지역":snorkyMapActiveFilter));
  });
  const regionLabel=document.getElementById("snorkyMapRegionLabel");
  if(regionLabel){
    regionLabel.textContent=snorkyMapSelectedRegion||"지역";
  }

  // 3. 더보기 펼침 상태 복원
  snorkyMapExpanded=Boolean(returnState.expanded);
  lastMapExpandedState=snorkyMapExpanded;

  // 4. 지도 뷰포트 / 중심 / 줌 복원 (initOrUpdateSnorkyMap 재호출 금지 - 초기화 방지)
  if(!snorkyMap){
    initOrUpdateSnorkyMap();
  }
  if(snorkyMap&&window.kakao?.maps){
    snorkyMap.relayout();
    if(returnState.center&&Number.isFinite(returnState.center.lat)&&Number.isFinite(returnState.center.lng)){
      snorkyMap.setCenter(new kakao.maps.LatLng(returnState.center.lat,returnState.center.lng));
    }
    if(returnState.level){
      snorkyMap.setLevel(returnState.level);
    }
    if(returnState.layerType&&returnState.layerType!==snorkyMapLayerType){
      snorkyMapLayerType=returnState.layerType;
      snorkyMap.setMapTypeId(snorkyMapLayerType==="roadmap"?kakao.maps.MapTypeId.ROADMAP:kakao.maps.MapTypeId.HYBRID);
      const layerBtn=document.getElementById("snorkyMapLayerToggle");
      if(layerBtn){
        layerBtn.classList.toggle("active",snorkyMapLayerType==="hybrid");
        layerBtn.title=snorkyMapLayerType==="roadmap"?"위성지도 보기":"일반지도 보기";
      }
    }
    updateSnorkyMapZoomBar();
  }

  // 5. 선택 포인트 및 하단 패널/프리뷰/펼침 카드 복원
  const allPoints=Array.isArray(window.SNORKY_ACTIVE_POINTS)?window.SNORKY_ACTIVE_POINTS:[];
  const selectedPoint=!snorkyMapWarningMode&&returnState.selectedPointId?allPoints.find(p=>String(p.supabaseId||p.id)===String(returnState.selectedPointId)):null;
  snorkyMapSelectedPoint=selectedPoint;

  renderSnorkyMapMarkers();

  // 하단 카드 목록을 렌더링 (snorkyMapExpanded 상태에 맞춰 전체 개수 및 접기/더보기 버튼 설정)
  renderSnorkyMapBottomCards();

  const preview=document.getElementById("snorkyMapPreviewCard");
  const nearestBox=document.getElementById("snorkyMapNearestBox");
  const panel=document.getElementById("snorkyMapBottomPanel");

  if(selectedPoint&&(returnState.previewOpen||returnState.previewOpen===undefined)){
    // 프리뷰 카드 표시 (선택 포인트 및 프리뷰 유지, 프리뷰 닫을 때 펼쳐진 목록으로 복귀)
    showPointPreviewCard(selectedPoint);
  }else if(snorkyMapExpanded){
    if(preview)preview.classList.remove("open");
    if(panel){
      panel.classList.remove("has-preview");
      panel.classList.add("expanded");
    }
    if(nearestBox)nearestBox.style.display=snorkyMapWarningMode?"none":"";
  }else{
    if(preview)preview.classList.remove("open");
    if(panel)panel.classList.remove("has-preview");
    if(nearestBox)nearestBox.style.display=snorkyMapWarningMode?"none":"";
  }

  // 6. 스크롤 위치 복원
  requestAnimationFrame(()=>{
    const track=document.getElementById("snorkyMapCardsTrack");
    if(track&&Number.isFinite(returnState.trackScrollTop)){
      track.scrollTop=returnState.trackScrollTop;
    }
    const panelEl=document.getElementById("snorkyMapBottomPanel");
    if(panelEl&&Number.isFinite(returnState.panelScrollTop)){
      panelEl.scrollTop=returnState.panelScrollTop;
    }
  });
}

async function showPointPreviewCard(point){
  const preview=document.getElementById("snorkyMapPreviewCard");
  const nearestBox=document.getElementById("snorkyMapNearestBox");
  const warningBox=document.getElementById("snorkyMapWarningBox");
  const panel=document.getElementById("snorkyMapBottomPanel");
  if(!preview||!nearestBox)return;

  const pointId=String(point.supabaseId||point.id||"");
  const requestId=++snorkyMapPreviewRequestId;
  const resultReader=window.SNORKYEvaluationResults;
  let resultRow=null;
  if(resultReader?.loadTodayHourly&&resultReader?.selectCurrentTodayHourlySlot){
    try{
      const hourlyRows=await resultReader.loadTodayHourly(pointId);
      resultRow=resultReader.selectCurrentTodayHourlySlot(hourlyRows);
    }catch(error){
      console.warn(`[SNORKY Map Preview] TODAY_HOURLY 조회 실패: ${pointId}`,error);
    }
  }
  if(requestId!==snorkyMapPreviewRequestId)return;
  if(String(snorkyMapSelectedPoint?.supabaseId||snorkyMapSelectedPoint?.id||"")!==pointId)return;

  const image=pointImage(point);
  const distance=Number.isFinite(point.distance)?point.distance.toFixed(1)+"km":"--";

  // Today 상세와 동일한 현재 TODAY_HOURLY 슬롯만 참조
  const resultMetrics=resultRow?.metrics||{};
  const v12=resultRow?{
    conditionScore:resultRow.condition_score,
    conditionStatus:resultRow.condition_status,
    safety:resultRow.safety_status,
    safetyReasons:resultRow.safety_reasons||[],
    qualityStatus:resultRow.quality_status,
    recommendation:resultRow.recommendation,
    visibilityGrade:resultRow.visibility_grade??resultMetrics.visibility_grade??null,
    visibilityScore:resultRow.visibility_score??resultMetrics.visibility_score??null,
    waveHeight:resultRow.wave_height??resultMetrics.wave_height??null,
    seaTemperature:resultRow.sea_temperature??resultMetrics.sea_temperature??null,
    windSpeed:resultRow.wind_speed??resultMetrics.wind_speed??null
  }:null;
  const liveSafety=window.SNORKYMarineSafety?.statusForPoint(point);
  const liveWarning=liveSafety?.warning;
  const nonWarningReason=(v12?.safetyReasons||[]).find(reason=>!String(reason).includes("발효 중"));
  const isBlocked=liveSafety?.status==="BLOCK"||(v12?.safety==="BLOCK"&&Boolean(nonWarningReason));
  const isUnknown=!isBlocked&&(v12?.safety==="UNKNOWN"||(!v12&&liveSafety?.status==="UNKNOWN"));

  // 추천 상태: 추천 / 주의 / 비추천 / 야간 비추천 등
  let recommendationDisplay="--";
  if(isBlocked){
    recommendationDisplay="입수 금지";
  }else if(isUnknown){
    recommendationDisplay="확인 필요";
  }else{
    recommendationDisplay=window.getSnorkyConditionStatus?.(v12||point)||"보통";
  }

  // 예상 수중시야: TODAY Result의 visibility_grade 우선 매핑
  let visDisplay="--";
  const rawVis=v12?.visibilityGrade;
  if(!isBlocked && !isUnknown && rawVis && rawVis !== "UNKNOWN"){
    visDisplay = rawVis;
  }

  // 파고와 Safety 사유는 동일한 TODAY_HOURLY 결과 행을 사용
  const rawWave=v12?.waveHeight;
  const waveDisplay = Number.isFinite(Number(rawWave)) ? `${Number(rawWave).toFixed(1)}m` : "--";

  const rawSeaTemperature=v12?.seaTemperature;
  const seaTemperatureDisplay = Number.isFinite(Number(rawSeaTemperature)) ? `${Number(rawSeaTemperature).toFixed(1)}°C` : "--";

  // 3. Safety Warning Banner (BLOCK / UNKNOWN) — PASS는 완전 숨김
  let warningHtml="";
  if(isBlocked){
    const safetySummary=resultReader?.formatSafetyBlockSummary?.(liveSafety?.warnings||liveWarning,v12?.safetyReasons)
      ||"입수 금지 · 기타 안전 위험";
    warningHtml=`<div class="snorky-map-preview-warning"><span class="snorky-map-warning-text">${escapeHtml(safetySummary)}</span></div>`;
  }else if(isUnknown){
    warningHtml=`<div class="snorky-map-preview-warning"><span class="snorky-map-warning-text">안전 정보 확인 필요</span></div>`;
  }
  // 4. Render HTML
  preview.innerHTML=`
    <div class="snorky-map-preview-actions" style="position:absolute;top:10px;right:10px;display:flex;align-items:center;gap:6px;z-index:3;">
      <button class="snorky-map-preview-close" type="button" aria-label="닫기" style="position:static;">×</button>
    </div>
    <div class="snorky-map-preview-main">
      <div class="snorky-map-preview-photo">
        ${image?`<img src="${escapeHtml(image)}" alt="${escapeHtml(point.name)}" loading="lazy">`:'<span class="home-card-fallback"></span>'}
      </div>
      <div class="snorky-map-preview-info">
        <strong>${escapeHtml(point.name)}</strong>
        <small>${escapeHtml(point.region||"전국")} · ${distance}</small>
      </div>
    </div>
    <div class="snorky-map-preview-stats">
      <div class="snorky-map-preview-stat">컨디션 상태<b>${escapeHtml(recommendationDisplay)}</b></div>
      <div class="snorky-map-preview-stat">예상 수중시야<b>${escapeHtml(visDisplay)}</b></div>
      <div class="snorky-map-preview-stat">파고<b>${escapeHtml(waveDisplay)}</b></div>
      <div class="snorky-map-preview-stat">수온<b>${escapeHtml(seaTemperatureDisplay)}</b></div>
    </div>
    ${warningHtml}
    <button class="snorky-map-preview-btn" type="button" data-view-detail="${escapeHtml(point.supabaseId||point.id)}">포인트 자세히 보기</button>
  `;
  preview.classList.add("open");
  if(panel)panel.classList.add("has-preview");
  nearestBox.style.display="none";
  if(warningBox&&snorkyMapWarningMode)warningBox.hidden=true;

  const closeBtn=preview.querySelector(".snorky-map-preview-close");
  if(closeBtn){
    closeBtn.onclick=()=>{
      preview.classList.remove("open");
      if(panel)panel.classList.remove("has-preview");
      nearestBox.style.display=snorkyMapWarningMode?"none":"";
      if(warningBox&&snorkyMapWarningMode)warningBox.hidden=false;
      snorkyMapSelectedPoint=null;
      if(lastMapExpandedState){
        snorkyMapExpanded=true;
      }
      renderSnorkyMapMarkers();
      renderSnorkyMapBottomCards();
      applySnorkyMapInitialViewport(snorkyMapActiveFilter==="내 주변 추천");
    };
  }

  const detailBtn=preview.querySelector("[data-view-detail]");
  if(detailBtn){
    detailBtn.onclick=()=>{
      openPoint(point.supabaseId||point.id,point);
    };
  }
}

function getSnorkyMapPanelTitle(){
  if(snorkyMapActiveFilter==="오늘의 베스트")return "오늘의 추천 BEST";
  if(snorkyMapActiveFilter==="내 주변 추천")return "내 주변 추천 BEST";
  if(snorkyMapActiveFilter==="즐겨찾기")return "즐겨찾기 포인트";
  if(snorkyMapActiveFilter==="지역"&&snorkyMapSelectedRegion)return `${snorkyMapSelectedRegion} 추천 포인트`;
  return state.hasLocation?"가까운 포인트":"전체 포인트";
}

function mapRankRow(point,index){
  const image=pointImage(point);
  const distance=Number.isFinite(point.distance)?point.distance.toFixed(1)+"km":"";
  const regionStr=point.region||"전국";
  const metaStr=distance?`${regionStr} · ${distance}`:regionStr;
  const showRank=(snorkyMapActiveFilter==="오늘의 베스트"||snorkyMapActiveFilter==="내 주변 추천");
  
  const todaySnapshot=window.SNORKYTodayBest?.getSnapshot?.();
  const allRows=todaySnapshot?.rows||todaySnapshot?.homeRows||todaySnapshot?.evaluated||[];
  const evalItem=allRows.find(e=>
    String(e.point?.id||e.id)===String(point.id)||
    String(e.point?.supabaseId||e.supabaseId)===String(point.supabaseId)||
    String(e.point?.id||e.id)===String(point.supabaseId)||
    String(e.point?.supabaseId||e.supabaseId)===String(point.id)
  );

  const v12=evalItem?.v12||point.v12||null;
  const safetyStatus=v12?.safety||window.SNORKYMarineSafety?.statusForPoint(point)?.status||"UNKNOWN";
  let scoreText="";
  if(safetyStatus==="BLOCK"){
    scoreText="입수 금지";
  }else if(safetyStatus==="UNKNOWN"){
    scoreText="확인 필요";
  }else if(v12&&Number.isFinite(v12.conditionScore)){
    const status=window.getSnorkyConditionStatus?.(v12)||"보통";
    scoreText=`${Math.round(v12.conditionScore)}점 · ${status}`;
  }else if(Number.isFinite(Number(point.score))){
    const status=window.getSnorkyConditionStatus?.(point.score)||"보통";
    scoreText=`${Math.round(Number(point.score))}점 · ${status}`;
  }else if(evalItem?.score!=null&&Number.isFinite(Number(evalItem.score))){
    const status=window.getSnorkyConditionStatus?.(evalItem.score)||"보통";
    scoreText=`${Math.round(Number(evalItem.score))}점 · ${status}`;
  }else if(evalItem?.row?.sea_temperature!=null){
    scoreText=`수온 ${evalItem.row.sea_temperature.toFixed(1)}°C · 파고 ${evalItem.row.wave_height!=null?evalItem.row.wave_height.toFixed(1)+"m":"--"}`;
  }else{
    scoreText="--";
  }

  const rankBadgeHtml=showRank?`<span class="home-list-rank${rankClass(index)}">${index+1}</span>`:"";
  const noRankClass=showRank?"":" no-rank";

  return`<button class="home-rank-row${noRankClass}" type="button" data-map-card-point="${escapeHtml(point.supabaseId||point.id)}" style="width:100%!important;max-width:none!important;flex:0 0 100%!important;box-sizing:border-box!important;">${rankBadgeHtml}<span class="home-list-photo${image?'':' home-best-fallback'}">${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy">`:""}</span><span class="home-list-copy"><strong>${escapeHtml(point.name)}</strong><small>${escapeHtml(metaStr)}</small><span>${escapeHtml(scoreText)}</span></span><span class="home-list-chevron">›</span></button>`;
}

function getSnorkyMapWarningCards(points){
  const cardMap=new Map();
  for(const point of points||[]){
    const safety=window.SNORKYMarineSafety?.statusForPoint(point);
    if(safety?.status!=="BLOCK")continue;
    const warning=safety.warning||{};
    const type=String(warning.warningName||warning.type||"").trim();
    const level=String(warning.levelName||warning.level||"").trim();
    const typeLevel=level&&type&&!type.endsWith(level)?`${type} ${level}`:type||level;
    const areaName=String(warning.areaName||safety.areaName||warning.regKo||warning.regUpKo||"").trim();
    const key=`${typeLevel}\u0000${areaName}`;
    if(!typeLevel||!areaName)continue;
    if(!cardMap.has(key)){
      cardMap.set(key,{
        key,
        typeLevel,
        areaName,
        points:[]
      });
    }
    cardMap.get(key).points.push(point);
  }
  return Array.from(cardMap.values());
}

function setActiveWarningIndex(index, shouldScrollCard=true, shouldPanMap=true){
  snorkyMapActiveWarningIndex=index;
  const cardsHost=document.getElementById("snorkyMapWarningCards");
  if(cardsHost){
    const cards=cardsHost.querySelectorAll(".snorky-map-warning-card");
    cards.forEach((card,idx)=>{
      const isActive=idx===index;
      card.style.borderColor=isActive?"#b42318":"#e0eaed";
      card.style.background=isActive?"#fffbfa":"#fff";
      card.style.boxShadow=isActive?"0 4px 16px rgba(180,35,24,.16)":"0 3px 12px rgba(20,48,70,.06)";
      card.style.transform=isActive?"translateY(-1px)":"none";
      if(isActive)card.classList.add("is-active");
      else card.classList.remove("is-active");
    });
    if(shouldScrollCard&&cards[index]){
      cards[index].scrollIntoView({behavior:"smooth",block:"nearest"});
    }
  }

  renderSnorkyMapMarkers();

  if(shouldPanMap&&snorkyMap&&window.kakao?.maps){
    const warningCards=getSnorkyMapWarningCards(getFilteredPoints());
    const activeCard=warningCards[index];
    if(activeCard&&activeCard.points&&activeCard.points.length){
      let sumLat=0,sumLng=0,cnt=0;
      activeCard.points.forEach(p=>{
        const lat=Number(p.lat),lng=Number(p.lng);
        if(Number.isFinite(lat)&&Number.isFinite(lng)){
          sumLat+=lat;sumLng+=lng;cnt++;
        }
      });
      if(cnt>0){
        const targetCenter=new kakao.maps.LatLng(sumLat/cnt,sumLng/cnt);
        snorkyMap.panTo(targetCenter);
      }
    }
  }
}

function syncActiveWarningFromScroll(){
  const cardsHost=document.getElementById("snorkyMapWarningCards");
  if(!cardsHost)return;
  const cards=cardsHost.querySelectorAll(".snorky-map-warning-card");
  if(!cards.length)return;

  const hostRect=cardsHost.getBoundingClientRect();
  const targetY=hostRect.top + Math.min(100, hostRect.height / 2);

  let closestIndex=0;
  let minDiff=Infinity;

  cards.forEach((card,idx)=>{
    const rect=card.getBoundingClientRect();
    const cardCenter=rect.top + rect.height/2;
    const diff=Math.abs(targetY - cardCenter);
    if(diff < minDiff){
      minDiff=diff;
      closestIndex=idx;
    }
  });

  if(snorkyMapActiveWarningIndex!==closestIndex){
    setActiveWarningIndex(closestIndex,false,true);
  }
}

function renderSnorkyMapWarningCards(){
  const warningBox=document.getElementById("snorkyMapWarningBox");
  const cardsHost=document.getElementById("snorkyMapWarningCards");
  const nearestBox=document.getElementById("snorkyMapNearestBox");
  const panel=document.getElementById("snorkyMapBottomPanel");
  const preview=document.getElementById("snorkyMapPreviewCard");
  const isWarning=snorkyMapWarningMode&&snorkyMapActiveFilter==="해상특보";
  if(!warningBox||!cardsHost)return;
  warningBox.hidden=!isWarning||Boolean(preview?.classList.contains("open"));
  if(nearestBox)nearestBox.style.display=isWarning?"none":"";
  if(panel){
    panel.classList.toggle("warning-mode",isWarning);
    if(!isWarning)panel.classList.toggle("expanded",snorkyMapExpanded);
  }
  if(!isWarning)return;

  const cards=getSnorkyMapWarningCards(getFilteredPoints());
  if(!cards.length){
    cardsHost.innerHTML='<div class="snorky-map-empty-cards">현재 발효 중인 특보가 없습니다.</div>';
    return;
  }

  if(snorkyMapActiveWarningIndex>=cards.length){
    snorkyMapActiveWarningIndex=0;
  }

  cardsHost.innerHTML=cards.map((card,idx)=>{
    const isActive=idx===snorkyMapActiveWarningIndex;
    const borderStyle=isActive?"#b42318":"#e0eaed";
    const bgStyle=isActive?"#fffbfa":"#fff";
    const shadowStyle=isActive?"0 4px 16px rgba(180,35,24,.16)":"0 3px 12px rgba(20,48,70,.06)";
    return `<div class="snorky-map-warning-card${isActive?' is-active':''}" data-warning-idx="${idx}" role="status" tabindex="0" style="display:flex;flex-direction:column;gap:4px;width:100%;min-height:64px;padding:12px 14px;border:1.5px solid ${borderStyle};border-radius:16px;background:${bgStyle};box-sizing:border-box;box-shadow:${shadowStyle};cursor:pointer;transition:all .15s ease;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <strong style="font-size:14px;font-weight:900;color:#b42318;display:flex;align-items:center;gap:4px;">
          <span>⚠️</span>
          <span>${escapeHtml(card.typeLevel)}</span>
        </strong>
        <span style="font-size:11px;font-weight:700;color:${isActive?'#b42318':'#667085'};background:${isActive?'#fee4e2':'#f2f4f7'};padding:2px 7px;border-radius:10px;">포인트 ${card.points.length}개</span>
      </div>
      <small style="font-size:12px;color:#d92d20;font-weight:600;">${escapeHtml(card.areaName)}</small>
    </div>`;
  }).join("");

  cardsHost.querySelectorAll(".snorky-map-warning-card").forEach(cardEl=>{
    cardEl.addEventListener("click",()=>{
      const idx=parseInt(cardEl.dataset.warningIdx,10);
      if(Number.isFinite(idx)){
        setActiveWarningIndex(idx,true,true);
      }
    });
  });

  if(!cardsHost.dataset.scrollBound){
    cardsHost.dataset.scrollBound="true";
    let isTicking=false;
    const onScroll=()=>{
      if(!isTicking){
        window.requestAnimationFrame(()=>{
          syncActiveWarningFromScroll();
          isTicking=false;
        });
        isTicking=true;
      }
    };
    cardsHost.addEventListener("scroll",onScroll,{passive:true});
    if(panel)panel.addEventListener("scroll",onScroll,{passive:true});
  }
}

function renderSnorkyMapBottomCards(){
  const track=document.getElementById("snorkyMapCardsTrack");
  const toggleBtn=document.getElementById("snorkyMapToggleMore");
  const panel=document.getElementById("snorkyMapBottomPanel");
  const titleEl=document.getElementById("snorkyMapPanelTitle");
  if(!track)return;

  if(snorkyMapWarningMode&&snorkyMapActiveFilter==="해상특보"){
    if(panel){
      panel.classList.remove("expanded");
      panel.classList.add("warning-mode");
    }
    if(toggleBtn)toggleBtn.hidden=true;
    renderSnorkyMapWarningCards();
    return;
  }
  if(panel)panel.classList.remove("warning-mode");
  const warningBox=document.getElementById("snorkyMapWarningBox");
  if(warningBox)warningBox.hidden=true;

  if(titleEl){
    titleEl.textContent=getSnorkyMapPanelTitle();
  }

  if(panel){
    panel.classList.toggle("expanded",snorkyMapExpanded);
  }

  const filtered=getFilteredPoints();
  let sorted=[...filtered];

  if(snorkyMapActiveFilter==="오늘의 베스트"){
    const todaySnapshot=window.SNORKYTodayBest?.getSnapshot?.();
    const homeRows=todaySnapshot?.homeRows||state.todayRows||[];
    sorted=[...homeRows];
  }else if(snorkyMapActiveFilter==="내 주변 추천"){
    const nearbySnapshotRows=state.nearbyRows||[];
    if(nearbySnapshotRows.length>0){
      sorted=[...nearbySnapshotRows];
    }else{
      const radius=state.nearbyRadius||100;
      sorted=filtered
        .filter(p=>p.distance<=radius&&p.score&&p.score>=50)
        .sort((a,b)=>(a.distance-b.distance)||(b.score||0)-(a.score||0))
        .slice(0,10);
    }
  }else if(snorkyMapActiveFilter==="지역"){
    sorted.sort((a,b)=>((a.distance??Infinity)-(b.distance??Infinity)));
  }else{
    if(state.hasLocation&&state.userCoords){
      sorted.sort((a,b)=>((a.distance??Infinity)-(b.distance??Infinity)));
    }
  }

  if(!sorted.length){
    if(snorkyMapActiveFilter==="즐겨찾기"){
      track.innerHTML=`<div class="snorky-map-empty-cards"><p style="margin:0 0 6px;font-size:14px;font-weight:800;color:#183650;">아직 즐겨찾기한 포인트가 없습니다</p><p style="margin:0 0 12px;font-size:12px;color:#617588;">포인트를 탐색하고 ♥를 눌러 추가해보세요.</p><button id="snorkyMapExploreAllBtn" type="button" class="snorky-map-explore-btn" style="display:inline-flex;align-items:center;justify-content:center;padding:8px 18px;border:0;border-radius:12px;background:#1868d8;color:#fff;font-size:12.5px;font-weight:800;cursor:pointer;">포인트 찾아보기</button></div>`;
    }else{
      track.innerHTML='<div class="snorky-map-empty-cards">해당 조건에 맞는 포인트가 없습니다.</div>';
    }
    if(toggleBtn)toggleBtn.hidden=true;
    return;
  }

  const count=snorkyMapExpanded?Math.min(sorted.length,10):1;
  const list=sorted.slice(0,count);

  track.innerHTML=list.map((point,index)=>mapRankRow(point,index)).join("");

  if(toggleBtn){
    toggleBtn.textContent=snorkyMapExpanded?"접기 ‹":"더보기 ›";
    toggleBtn.hidden=sorted.length<=1;
  }
}

mapScreen.addEventListener("click",event=>{
  if(event.target.closest("#snorkyMapBackBtn")){
    closeMapScreen();
    return;
  }
  if(event.target.closest("#snorkyMapRegionClose")){
    const dropdown=document.getElementById("snorkyMapRegionDropdown");
    if(dropdown)dropdown.classList.remove("open");
    return;
  }
  if(event.target.closest("[data-map-fav-all]")){
    snorkyMapSelectedPoint=null;
    snorkyMapExpanded=false;
    const preview=document.getElementById("snorkyMapPreviewCard");
    const nearestBox=document.getElementById("snorkyMapNearestBox");
    const panel=document.getElementById("snorkyMapBottomPanel");
    if(preview)preview.classList.remove("open");
    if(panel)panel.classList.remove("has-preview");
    if(nearestBox)nearestBox.style.display="";
    renderSnorkyMapChipsBar();
    renderSnorkyMapMarkers();
    renderSnorkyMapBottomCards();
    applySnorkyMapInitialViewport(false);
    return;
  }
  const favPointBtn=event.target.closest("[data-map-fav-point]");
  if(favPointBtn){
    const pointId=favPointBtn.dataset.mapFavPoint;
    const allPoints=getAllActivePoints();
    const target=allPoints.find(p=>String(p.supabaseId||p.id)===String(pointId));
    if(target){
      selectPointOnMap(target);
    }
    return;
  }
  if(event.target.closest("[data-map-switch-all]")||event.target.closest("#snorkyMapExploreAllBtn")){
    resetSnorkyMapToGeneral();
    snorkyMapActiveFilter="전체";
    snorkyMapSelectedRegion="";
    snorkyMapSelectedPoint=null;
    snorkyMapExpanded=false;
    const preview=document.getElementById("snorkyMapPreviewCard");
    const nearestBox=document.getElementById("snorkyMapNearestBox");
    const panel=document.getElementById("snorkyMapBottomPanel");
    if(preview)preview.classList.remove("open");
    if(panel)panel.classList.remove("has-preview");
    if(nearestBox)nearestBox.style.display="";
    setBottomActive("map");
    renderSnorkyMapChipsBar();
    renderSnorkyMapMarkers();
    renderSnorkyMapBottomCards();
    applySnorkyMapInitialViewport(false);
    return;
  }
  const regionOpt=event.target.closest("[data-map-region-val]");
  if(regionOpt){
    snorkyMapWarningMode=false;
    const val=regionOpt.dataset.mapRegionVal||"";
    snorkyMapSelectedRegion=val;
    snorkyMapActiveFilter=val?"지역":"전체";

    mapScreen.querySelectorAll("[data-map-filter]").forEach(c=>{
      c.classList.toggle("active",c.dataset.mapFilter===(val?"지역":"전체"));
    });

    const label=document.getElementById("snorkyMapRegionLabel");
    if(label)label.textContent=val?val:"지역";

    const dropdown=document.getElementById("snorkyMapRegionDropdown");
    if(dropdown)dropdown.classList.remove("open");

    setBottomActive("map");

    snorkyMapSelectedPoint=null;
    snorkyMapExpanded=false;
    const preview=document.getElementById("snorkyMapPreviewCard");
    const nearestBox=document.getElementById("snorkyMapNearestBox");
    const panel=document.getElementById("snorkyMapBottomPanel");
    if(preview)preview.classList.remove("open");
    if(panel)panel.classList.remove("has-preview");
    if(nearestBox)nearestBox.style.display="";

    renderSnorkyMapMarkers();
    renderSnorkyMapBottomCards();
    applySnorkyMapInitialViewport(false);
    return;
  }
  const chip=event.target.closest("[data-map-filter]");
  if(chip){
    const filter=chip.dataset.mapFilter;
    if(filter==="즐겨찾기"){
      openFavoritesOnMap();
      return;
    }
    const dropdown=document.getElementById("snorkyMapRegionDropdown");
    if(filter==="지역"){
      populateMapRegions();
      if(dropdown)dropdown.classList.toggle("open");
      return;
    }

    if(dropdown)dropdown.classList.remove("open");
    mapScreen.querySelectorAll("[data-map-filter]").forEach(c=>c.classList.toggle("active",c===chip));
    snorkyMapWarningMode=false;
    snorkyMapActiveFilter=filter;
    snorkyMapSelectedRegion="";
    const label=document.getElementById("snorkyMapRegionLabel");
    if(label)label.textContent="지역";

    setBottomActive("map");

    snorkyMapSelectedPoint=null;
    snorkyMapExpanded=false;
    const preview=document.getElementById("snorkyMapPreviewCard");
    const nearestBox=document.getElementById("snorkyMapNearestBox");
    const panel=document.getElementById("snorkyMapBottomPanel");
    if(preview)preview.classList.remove("open");
    if(panel)panel.classList.remove("has-preview");
    if(nearestBox)nearestBox.style.display="";

    if(filter==="내 주변 추천"&&(!state.hasLocation||!state.userCoords)){
      requestNearbyWithLocation(state.nearbyRadius||100,false);
    }

    renderSnorkyMapChipsBar();
    renderSnorkyMapMarkers();
    renderSnorkyMapBottomCards();
    applySnorkyMapInitialViewport(filter==="내 주변 추천");
    return;
  }
  if(!event.target.closest("#snorkyMapRegionDropdown")&&!event.target.closest("#snorkyMapRegionBtn")){
    const dropdown=document.getElementById("snorkyMapRegionDropdown");
    if(dropdown&&dropdown.classList.contains("open")){
      dropdown.classList.remove("open");
    }
  }
  if(event.target.closest("#snorkyMapToggleMore")){
    snorkyMapExpanded=!snorkyMapExpanded;
    lastMapExpandedState=snorkyMapExpanded;
    renderSnorkyMapBottomCards();
    return;
  }
  if(event.target.closest("#snorkyMapLayerToggle")){
    snorkyMapLayerType=snorkyMapLayerType==="roadmap"?"hybrid":"roadmap";
    const btn=document.getElementById("snorkyMapLayerToggle");
    if(btn){
      btn.classList.toggle("active",snorkyMapLayerType==="hybrid");
      btn.title=snorkyMapLayerType==="roadmap"?"위성지도 보기":"일반지도 보기";
    }
    if(snorkyMap&&window.kakao?.maps){
      snorkyMap.setMapTypeId(snorkyMapLayerType==="roadmap"?kakao.maps.MapTypeId.ROADMAP:kakao.maps.MapTypeId.HYBRID);
    }
    return;
  }
  if(event.target.closest("#snorkyMapMyLocation")){
    if(!navigator.geolocation){
      alert("현재 브라우저에서 위치 정보를 지원하지 않습니다.");
      return;
    }
    const btn=document.getElementById("snorkyMapMyLocation");
    if(btn)btn.classList.add("loading");
    navigator.geolocation.getCurrentPosition(pos=>{
      if(btn)btn.classList.remove("loading");
      state.userCoords={
        latitude:pos.coords.latitude,
        longitude:pos.coords.longitude,
        accuracy:pos.coords.accuracy
      };
      state.hasLocation=true;

      renderSnorkyUserLocation();
      applySnorkyMapInitialViewport(true);
      renderSnorkyMapMarkers();
      renderSnorkyMapBottomCards();
      renderNearbySection();
      renderNearestSection();
    },err=>{
      if(btn)btn.classList.remove("loading");
      alert(err?.code===1?"위치 권한이 차단되었습니다. 브라우저 설정에서 위치 권한을 허용해주세요.":"현재 위치를 확인할 수 없습니다.");
    },{enableHighAccuracy:true,timeout:10000,maximumAge:0});
    return;
  }
  if(event.target.closest("#snorkyMapZoomIn")){
    if(snorkyMap&&window.kakao?.maps){
      const cur=snorkyMap.getLevel();
      if(cur>1){
        snorkyMap.setLevel(cur-1,{animate:{duration:180}});
        updateSnorkyMapZoomBar();
      }
    }
    return;
  }
  if(event.target.closest("#snorkyMapZoomOut")){
    if(snorkyMap&&window.kakao?.maps){
      const cur=snorkyMap.getLevel();
      if(cur<14){
        snorkyMap.setLevel(cur+1,{animate:{duration:180}});
        updateSnorkyMapZoomBar();
      }
    }
    return;
  }
  const card=event.target.closest("[data-map-card-point]");
  if(card){
    const pointId=card.dataset.mapCardPoint;
    const allPoints=Array.isArray(window.SNORKY_ACTIVE_POINTS)?window.SNORKY_ACTIVE_POINTS:[];
    const target=allPoints.find(p=>String(p.supabaseId||p.id)===String(pointId));
    if(target){
      selectPointOnMap(target);
    }
    return;
  }
});

let mapSheetTouchStartY=0;
mapScreen.addEventListener("touchstart",event=>{
  const panel=event.target.closest("#snorkyMapBottomPanel");
  if(panel){
    mapSheetTouchStartY=event.touches[0].clientY;
  }
},{passive:true});

mapScreen.addEventListener("touchend",event=>{
  const panel=event.target.closest("#snorkyMapBottomPanel");
  if(panel){
    const touchEndY=event.changedTouches[0].clientY;
    const diff=mapSheetTouchStartY-touchEndY;
    if(diff>30&&!snorkyMapExpanded){
      snorkyMapExpanded=true;
      renderSnorkyMapBottomCards();
    }else if(diff<-30&&snorkyMapExpanded){
      snorkyMapExpanded=false;
      renderSnorkyMapBottomCards();
    }
  }
},{passive:true});

bottom.onclick=event=>{
  const button=event.target.closest("[data-bottom]");
  if(!button)return;
  const target=button.dataset.bottom;
  if(target==="home"){
    closeMapScreen();
    document.body.classList.remove("home-show-legacy");
    scrollTo({top:0,behavior:"smooth"});
  }else if(target==="map"){
    document.body.classList.remove("home-show-legacy");
    resetSnorkyMapToGeneral();
    if(snorkyMapActiveFilter==="즐겨찾기"){
      snorkyMapActiveFilter="전체";
      snorkyMapSelectedRegion="";
      snorkyMapSelectedPoint=null;
      snorkyMapExpanded=false;
      const preview=document.getElementById("snorkyMapPreviewCard");
      const nearestBox=document.getElementById("snorkyMapNearestBox");
      const panel=document.getElementById("snorkyMapBottomPanel");
      if(preview)preview.classList.remove("open");
      if(panel)panel.classList.remove("has-preview");
      if(nearestBox)nearestBox.style.display="";
    }
    openMapScreen();
    renderSnorkyMapChipsBar();
    renderSnorkyMapMarkers();
    renderSnorkyMapBottomCards();
    applySnorkyMapInitialViewport(false);
  }else if(target==="favorites"){
    if(!window.SNORKYAuthSession?.isLoggedIn?.()){
      window.SNORKYAuthSession?.showLoginPrompt?.("즐겨찾기는 로그인 후 이용할 수 있어요.");
      return;
    }
    openFavoritesOnMap();
  }else if(target==="mypage"){
    let session=null;
    try{session=window.SNORKYAuthSession?window.SNORKYAuthSession.get():JSON.parse(localStorage.getItem('snorky_auth_session_v1')||'null')}catch(_){session=null}
    if(session&&session.version===1&&session.user){
      location.href='./mypage.html';
    }else{
      location.href='./login.html';
    }
    return;
  }
  setBottomActive(target);
};

const requestedBottomView=new URLSearchParams(location.search).get("view");
if(requestedBottomView==="map"||requestedBottomView==="favorites"){
  requestAnimationFrame(()=>bottom.querySelector(`[data-bottom="${requestedBottomView}"]`)?.click());
}

function syncAccountFooterLinks(){
  let session=null;
  try{
    session=window.SNORKYAuthSession?window.SNORKYAuthSession.get():JSON.parse(localStorage.getItem('snorky_auth_session_v1')||'null');
  }catch(_){session=null}
  const isLogin=Boolean(session&&session.version===1&&session.user);
  const footerLinks=document.getElementById("homeAccountFooterLinks");
  if(footerLinks)footerLinks.style.display=isLogin?"flex":"none";
}
syncAccountFooterLinks();
window.addEventListener("storage",event=>{if(event.key==='snorky_auth_session_v1'||!event.key)syncAccountFooterLinks()});
window.addEventListener("snorky:auth-changed",syncAccountFooterLinks);
window.addEventListener("snorky:profile-updated",syncAccountFooterLinks);

document.getElementById("homeInquiryTrigger")?.addEventListener("click",()=>{
  if(window.SNORKYInquiry?.open)window.SNORKYInquiry.open();
  else window.dispatchEvent(new Event("snorky:open-inquiry"));
});

document.getElementById("homeFooterLogoutBtn")?.addEventListener("click",()=>{
  try{
    if(window.SNORKYAuthSession?.clear){
      window.SNORKYAuthSession.clear();
    }else{
      localStorage.removeItem("snorky_auth_session_v1");
    }
  }catch(_){}
  syncAccountFooterLinks();
  try{
    window.dispatchEvent(new CustomEvent("snorky:auth-changed"));
  }catch(_){}
});

document.addEventListener("snorky:today-best-ready",event=>{const policy=event.detail?.policy,recommendable=policy?.caseName!=="E"&&policy?.caseName!=="KMA";state.todayRows=recommendable?(event.detail.homeRows||[]):[];renderToday();populateRegions();renderWarning();renderSnorkyMapMarkers();renderSnorkyMapBottomCards();});
document.addEventListener("snorky:today-best-error",event=>{if(!state.todayRows.length){const host=document.getElementById("homeTodayBest");if(host)host.innerHTML='<div class="home-empty"><strong>오늘의 추천 포인트를 불러오지 못했습니다.</strong>잠시 후 다시 시도해 주세요.</div>'}populateRegions();renderWarning();});
document.addEventListener("snorky:nearby-best-ready",event=>{state.nearbyRows=event.detail?.rows||[];state.nearbyRadius=event.detail?.radius||state.nearbyRadius||100;state.nearbyTotalInRadius=event.detail?.totalInRadius;if(event.detail?.coordinates){state.userCoords=event.detail.coordinates;state.hasLocation=true}renderNearbySection();renderNearestSection();renderSnorkyMapMarkers();renderSnorkyMapBottomCards();});
document.addEventListener("snorky:nearby-radius-change",event=>{state.nearbyRadius=event.detail?.radius||100;state.nearbyExpanded=false;section.querySelectorAll('input[name="homeNearbyRadius"]').forEach(input=>{input.checked=Number(input.value)===state.nearbyRadius})});
document.addEventListener("snorky:points-ready",()=>{if(directPointRequest)return;populateRegions();setHeroImage();window.SNORKYTodayBest?.refresh?.();renderNearestSection();renderWarning();renderSnorkyMapMarkers();renderSnorkyMapBottomCards();});
document.addEventListener("snorky:kma-safety-updated",()=>{renderWarning();renderSnorkyMapMarkers();renderSnorkyMapBottomCards();});
document.addEventListener("snorky:favorites-updated",()=>{
  const preview=document.getElementById("snorkyMapPreviewCard");
  if(mapScreen&&mapScreen.classList.contains("open")&&snorkyMapActiveFilter==="즐겨찾기"){
    const favPoints=getFilteredPoints();
    if(snorkyMapSelectedPoint){
      const stillExists=favPoints.some(p=>String(p.supabaseId||p.id)===String(snorkyMapSelectedPoint.supabaseId||snorkyMapSelectedPoint.id));
      if(!stillExists){
        snorkyMapSelectedPoint=favPoints[0]||null;
        if(snorkyMapSelectedPoint){
          selectPointOnMap(snorkyMapSelectedPoint);
        }else{
          const nearestBox=document.getElementById("snorkyMapNearestBox");
          const panel=document.getElementById("snorkyMapBottomPanel");
          if(preview)preview.classList.remove("open");
          if(panel)panel.classList.remove("has-preview");
          if(nearestBox)nearestBox.style.display="";
        }
      }
    }
    renderSnorkyMapChipsBar();
    renderSnorkyMapMarkers();
    renderSnorkyMapBottomCards();
    if(!snorkyMapSelectedPoint)applySnorkyMapInitialViewport(false);
  }
});
if(!directPointRequest){
  window.SNORKYMarineSafety?.ready?.then(renderWarning);let regionAttempts=0;const regionTimer=setInterval(()=>{if(populateRegions()||++regionAttempts>40)clearInterval(regionTimer)},250);
  const snapshot=window.SNORKYTodayBest?.getSnapshot?.();if(snapshot){state.todayRows=snapshot.homeRows||[];renderToday()}else window.SNORKYTodayBest?.refresh?.();
  renderNearbySection();renderNearestSection();checkInitialPermission();
}

function checkUrlPointParam(){
  try{
    const params=new URLSearchParams(window.location.search);
    const targetPointId=params.get("point")||params.get("pointId")||params.get("spot");
    const from=params.get("from");
    const postId=params.get("postId")||params.get("post_id");
    if(targetPointId){
      if(from){
        let opening=false,opened=false;
        const openRequestedPoint=async()=>{
          if(opening||opened||!window.SNORKYPointDetail?.openBySupabaseId)return false;
          opening=true;
          const returnState={from,postId,view:from};
          const ok=await window.SNORKYPointDetail.openBySupabaseId(targetPointId,from,returnState);
          opening=false;
          if(!ok)return false;
          opened=true;
          document.removeEventListener("snorky:points-ready",openRequestedPoint);
          document.documentElement.classList.add('snorky-point-ready');
          if(params.get("embed")==="buddyPointDetail"){
            window.parent.postMessage({type:"snorky:buddy-point-detail-ready",pointId:targetPointId},window.location.origin);
          }
          return true;
        };
        document.addEventListener("snorky:points-ready",openRequestedPoint,{once:true});
        void openRequestedPoint();
        return;
      }
      let tries=0;
      const t=setInterval(()=>{
        tries++;
        if(typeof window.openPointOnMap==="function"&&window.kakao?.maps){
          const ok=window.openPointOnMap(targetPointId,"share");
          if(ok||tries>=20){
            clearInterval(t);
            if(!ok&&window.SNORKYPointDetail?.openBySupabaseId){
              window.SNORKYPointDetail.openBySupabaseId(targetPointId,"share");
            }
          }
        }else if(tries>=20){
          clearInterval(t);
        }
      },150);
    }
  }catch(_){}
}
checkUrlPointParam();

window.SNORKYHomeV2=Object.freeze({
  formatPointScore,
  formatPointCondition,
  showPointPreviewCard,
  selectPointOnMap,
  openPointOnMap,
  openFavoritesOnMap,
  mapRankRow,
  captureMapReturnState,
  restoreMapState,
  getState:()=>state
});
})();
