(function(){
"use strict";

const PHOTO_BUCKET="point-images";
let authorized=false;
let clickTimes=[];

const el=id=>document.getElementById(id);
const sb=()=>window.getSnorkySupabase();
const values=value=>Array.isArray(value)?value:[];
const message=(target,error,fallback)=>{const node=el(target);if(node)node.textContent=error?.message||fallback;};

function dispatchAdminState(isAuthorized,detail={}){
  authorized=Boolean(isAuthorized);
  if(typeof setAdminMode==="function")setAdminMode(authorized);
  window.dispatchEvent(new CustomEvent("snorky:admin-state",{detail:{authorized,...detail}}));
}

const POINT_ENVIRONMENT_DEFAULTS=Object.freeze({terrain:"unknown",exposure:"medium",breakwaterShelter:"medium",eastWindSensitivity:"medium",onshoreWindSensitivity:"medium",swellSensitivity:"medium",exposureDirection:"unknown"});
function normalizePointEnvironment(environment){
  const source=environment&&typeof environment==='object'&&!Array.isArray(environment)?environment:{};
  const allowedTerrain=new Set(['unknown','sand','rock','harbor','mixed']),allowedLevel=new Set(['low','medium','high']),allowedDirection=new Set(['unknown','N','NE','E','SE','S','SW','W','NW']);
  const onshoreWindSensitivity=allowedLevel.has(source.onshoreWindSensitivity)?source.onshoreWindSensitivity:allowedLevel.has(source.eastWindSensitivity)?source.eastWindSensitivity:POINT_ENVIRONMENT_DEFAULTS.onshoreWindSensitivity;
  return{terrain:allowedTerrain.has(source.terrain)?source.terrain:POINT_ENVIRONMENT_DEFAULTS.terrain,exposure:allowedLevel.has(source.exposure)?source.exposure:POINT_ENVIRONMENT_DEFAULTS.exposure,breakwaterShelter:allowedLevel.has(source.breakwaterShelter)?source.breakwaterShelter:POINT_ENVIRONMENT_DEFAULTS.breakwaterShelter,eastWindSensitivity:onshoreWindSensitivity,onshoreWindSensitivity,swellSensitivity:allowedLevel.has(source.swellSensitivity)?source.swellSensitivity:POINT_ENVIRONMENT_DEFAULTS.swellSensitivity,exposureDirection:allowedDirection.has(source.exposureDirection)?source.exposureDirection:POINT_ENVIRONMENT_DEFAULTS.exposureDirection};
}
if(typeof window!=="undefined"&&!window.normalizePointEnvironment){window.normalizePointEnvironment=normalizePointEnvironment;}

async function verifyAdmin(user){
  if(!user){dispatchAdminState(false,{stage:"login"});return false}
  const result=await sb().from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
  if(result.error)throw result.error;
  const isAdmin=Boolean(result.data);
  dispatchAdminState(isAdmin,{stage:isAdmin?"admin":"login",email:user.email||""});
  return isAdmin;
}

async function requireAdmin(){
  const sessionResult=await sb().auth.getSession();
  if(sessionResult.error)throw sessionResult.error;
  const user=sessionResult.data.session?.user;
  if(!user||!await verifyAdmin(user))throw new Error("Supabase 관리자 인증이 필요합니다.");
  return user;
}

async function login(){
  const email=el("adminEmail").value.trim(),password=el("adminPassword").value,errorNode=el("adminLoginError");
  errorNode.textContent="";
  if(!email||!password){errorNode.textContent="이메일과 비밀번호를 입력해 주세요.";return}
  try{
    const result=await sb().auth.signInWithPassword({email,password});
    el("adminPassword").value="";
    if(result.error)throw result.error;
    if(!await verifyAdmin(result.data.user)){
      await sb().auth.signOut();
      throw new Error("admin_users 관리자 권한이 없습니다.");
    }
    if(typeof closeAdminLogin==="function")closeAdminLogin();
  }catch(error){
    dispatchAdminState(false,{stage:"login"});
    console.error("[SNORKY Admin] 로그인 실패",error);errorNode.textContent=error.message||"로그인하지 못했습니다."
  }
}

async function logout(){
  try{await sb().auth.signOut()}catch(error){console.error("[SNORKY Admin] 로그아웃 실패",error)}
  if(typeof cancelCoordinateEdit==="function")cancelCoordinateEdit();if(typeof closePointEditModal==="function")closePointEditModal();dispatchAdminState(false,{stage:"login"});
}

async function restoreSession(){
  try{const result=await sb().auth.getSession();if(result.error)throw result.error;await verifyAdmin(result.data.session?.user||null)}
  catch(error){dispatchAdminState(false,{stage:"login"});console.warn("[SNORKY Admin] 세션 확인 실패",error)}
}

async function reload(preferredPointId,preferredRegionId){
  await window.SNORKYSupabaseRead.loadSnorkyDataFromSupabase();
  if(preferredRegionId){const item=getEffectiveRegions().find(regionItem=>String(regionItem.supabaseId)===String(preferredRegionId));if(item){selectedRegionId=item.id;region=item.name}}
  if(preferredPointId)spot=(locations[region]||[]).find(point=>String(point.supabaseId)===String(preferredPointId))||spot;
  renderNav();if(spot){load();renderMap()}
}

async function addRegion(){
  if(!adminMode)return;
  const name=el("newRegionName").value.trim();el("regionManagerError").textContent="";
  try{await requireAdmin();if(!name)throw new Error("지역명을 입력해 주세요.");const result=await sb().from("regions").insert({name}).select("id").single();if(result.error)throw result.error;el("newRegionName").value="";await reload(null,result.data.id);renderRegionManager()}
  catch(error){message("regionManagerError",error,"지역을 추가하지 못했습니다.")}
}

async function renameRegion(id){
  const item=getRegionById(id),name=prompt("새 지역명을 입력하세요.",item?.name||"")?.trim();if(!name||!item)return;
  try{await requireAdmin();const result=await sb().from("regions").update({name}).eq("id",item.supabaseId);if(result.error)throw result.error;await reload(null,item.supabaseId);renderRegionManager()}
  catch(error){alert(error.message||"지역명을 변경하지 못했습니다.")}
}

async function deleteRegion(id){
  const item=getRegionById(id);if(!item)return;const count=(locations[item.name]||[]).length;
  if(!confirm(count?`'${item.name}' 지역과 소속 포인트 ${count}개를 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.`:`'${item.name}' 지역을 삭제할까요?`))return;
  try{await requireAdmin();const pointRows=await sb().from("points").select("id").eq("region_id",item.supabaseId);if(pointRows.error)throw pointRows.error;const pointIds=(pointRows.data||[]).map(row=>row.id);if(pointIds.length){const imageRows=await sb().from("point_images").select("storage_path").in("point_id",pointIds);if(imageRows.error)throw imageRows.error;const paths=(imageRows.data||[]).map(row=>row.storage_path).filter(Boolean);if(paths.length){const removed=await sb().storage.from(PHOTO_BUCKET).remove(paths);if(removed.error)throw removed.error}}const result=await sb().from("regions").delete().eq("id",item.supabaseId);if(result.error)throw result.error;await reload()}
  catch(error){alert(error.message||"지역을 삭제하지 못했습니다.")}
}

function pointPayload(point,regionId){
  const reg=getRegionById(point.regionId)||getRegionById(regionId)||(getEffectiveRegions().find(r=>String(r.supabaseId)===String(regionId)||String(r.id)===String(regionId)));
  const autoCode=typeof window.SNORKYWarningZones?.resolveWarningAreaCode==="function"?window.SNORKYWarningZones.resolveWarningAreaCode(point.lat,point.lng):null;
  return{
    region_id:regionId,name:point.name,lat:point.lat,lng:point.lng,warning_area_code:point.warningAreaCode||autoCode||reg?.warningAreaCode||reg?.warning_area_code||null,parking_lat:point.parkingLat??null,parking_lng:point.parkingLng??null,
    point_feature:point.pointFeature||"",snorkeling_info:point.snorkelingInfo||"",parking:point.parking||"",toilet:point.toilet||"",shower:point.shower||"",camping:point.camping||"",cooking:point.cooking||"",
    facilities:values(point.facilities),notes:values(point.notes),description:point.description||"",access_guide:point.accessGuide||"",access_steps:values(point.accessSteps),
    parking_available:typeof point.parkingAvailable==="boolean"?point.parkingAvailable:null,parking_guide:point.parkingGuide||"",entry_guide:point.entryGuide||"",entry_lat:point.entryLat??null,entry_lng:point.entryLng??null,
    depth_range:point.depthRange||"",difficulty:point.difficulty||"",point_type:point.pointType||"",warnings:values(point.warnings),environment:point.environment==null?null:normalizePointEnvironment(point.environment),sort_order:Number.isInteger(point.sortOrder)?point.sortOrder:0,
    youtube_url:point.youtubeUrl||null,youtube_title:point.youtubeTitle||null
  };
}

async function saveNew(){
  if(!adminMode)return;el("newPointError").textContent="";
  try{
    await requireAdmin();const regionItem=getRegionById(el("newPointRegion").value),name=el("newPointName").value.trim();
    if(!name||!regionItem)throw new Error("포인트명과 지역은 필수입니다.");if(!Number.isFinite(newPointDraft.lat)||!Number.isFinite(newPointDraft.lng))throw new Error("지도에서 스노클링 포인트 위치를 선택해 주세요.");
    const youtubeUrl=el("newPointYoutubeUrl")?.value.trim()||"",youtubeTitle=el("newPointYoutubeTitle")?.value.trim()||"";
    if(youtubeUrl&&!window.SNORKYPointVideo?.parseYouTubeUrl(youtubeUrl))throw new Error("올바른 YouTube 영상 URL을 입력해 주세요.");
    const point={name,lat:newPointDraft.lat,lng:newPointDraft.lng,parkingLat:newPointDraft.parkingLat,parkingLng:newPointDraft.parkingLng,pointFeature:el("newPointFeature").value.trim(),snorkelingInfo:el("newSnorkelingInfo").value.trim(),parking:el("newParking").value.trim(),toilet:el("newToilet").value.trim(),shower:el("newShower").value.trim(),camping:el("newCamping")?.value.trim()||"",cooking:el("newCooking")?.value.trim()||"",youtubeUrl,youtubeTitle,accessGuide:el("newAccessGuide").value.trim(),facilities:el("newFacilities").value.split(",").map(v=>v.trim()).filter(Boolean),notes:el("newNotes").value.split(",").map(v=>v.trim()).filter(Boolean),sortOrder:(locations[regionItem.name]||[]).length};
    const payload={...pointPayload(point,regionItem.supabaseId),legacy_id:crypto.randomUUID()};const result=await sb().from("points").insert(payload).select("id").single();if(result.error)throw result.error;
    const newPointId=result.data.id;
    try{
      await Promise.allSettled([
        window.SNORKYKmaWeatherCache?.fetch?.(point.lat,point.lng),
        window.SNORKYOpenMeteoMarineCache?.fetch?.(newPointId,point.name,point.lat,point.lng)
      ]);
    }catch(_warmErr){}
    await triggerPointEvaluation(newPointId);
    const files=[...el("newPointPhotos").files];if(files.length)await uploadPhotos(newPointId,files);
    closeNewPointModal();closePointManager();await reload(newPointId,regionItem.supabaseId);
    try{
      await window.SNORKYEvaluationResults?.loadTodayResults?.(true);
      await window.SNORKYTodayBest?.refresh?.();
    }catch(refreshError){
      console.warn("[SNORKY Admin] New point Result refresh failed:",refreshError);
    }
    openPointModal();
  }catch(error){console.error("[SNORKY Admin] 포인트 추가 실패",error);message("newPointError",error,"포인트를 저장하지 못했습니다.")}
}

async function triggerPointEvaluation(pointId){
  if(!pointId)return;
  try{
    const result=await sb().functions.invoke("point-evaluation-refresh", { body: { point_ids: [pointId] } });
    if(result.error)throw result.error;
  }catch(e){
    console.warn("[SNORKY Admin] Point re-evaluation trigger failed:", e);
  }
}

async function saveDetail(){
  if(!adminMode||!spot)return;el("pointEditError").textContent="";
  try{
    await requireAdmin();
    const youtubeUrl=el("editPointYoutubeUrl")?.value.trim()||"",youtubeTitle=el("editPointYoutubeTitle")?.value.trim()||"";
    if(youtubeUrl&&!window.SNORKYPointVideo?.parseYouTubeUrl(youtubeUrl))throw new Error("올바른 YouTube 영상 URL을 입력해 주세요.");
    const target=getRegionById(el("editPointRegion").value),point={...spot,name:el("editPointName").value.trim(),pointFeature:el("editPointFeature").value.trim(),snorkelingInfo:el("editSnorkelingInfo").value.trim(),parking:el("editParking").value.trim(),toilet:el("editToilet").value.trim(),shower:el("editShower").value.trim(),camping:el("editCamping")?.value.trim()||"",cooking:el("editCooking")?.value.trim()||"",youtubeUrl,youtubeTitle,accessGuide:el("editAccessGuide").value.trim(),facilities:[...adminEditFacilities],notes:[...adminEditNotes],environment:readEnvironmentEditor()};
    if(!target)throw new Error("지역을 찾을 수 없습니다.");
    const result=await sb().from("points").update(pointPayload(point,target.supabaseId)).eq("id",spot.supabaseId);
    if(result.error)throw result.error;
    const id=spot.supabaseId;
    closePointEditModal();
    await reload(id,target.supabaseId);
    renderPointModal();
    triggerPointEvaluation(id); // Re-evaluates point after profile change
  }
  catch(error){console.error("[SNORKY Admin] 포인트 수정 실패",error);message("pointEditError",error,"저장하지 못했습니다.")}
}

async function persistCoordinates(regionName,point){
  await requireAdmin();
  const autoCode=typeof window.SNORKYWarningZones?.resolveWarningAreaCode==="function"?window.SNORKYWarningZones.resolveWarningAreaCode(point.lat,point.lng):null;
  const updatePayload={lat:point.lat,lng:point.lng,parking_lat:point.parkingLat??null,parking_lng:point.parkingLng??null};
  if(autoCode)updatePayload.warning_area_code=autoCode;
  const result=await sb().from("points").update(updatePayload).eq("id",point.supabaseId);if(result.error)throw result.error;
  if(autoCode)point.warningAreaCode=autoCode;
  try{
    await Promise.allSettled([
      window.SNORKYKmaWeatherCache?.fetch?.(point.lat,point.lng),
      window.SNORKYOpenMeteoMarineCache?.fetch?.(point.supabaseId||point.id,point.name,point.lat,point.lng)
    ]);
    triggerPointEvaluation(point.supabaseId||point.id);
  }catch(_warmErr){}
}

async function savePin(){
  if(!coordinateEditPoint||!Number.isFinite(tempLat)||!Number.isFinite(tempLng))return;const point=coordinateEditPoint,mode=editPinMode,candidate={...point};if(mode==="parking"){candidate.parkingLat=tempLat;candidate.parkingLng=tempLng}else{candidate.lat=tempLat;candidate.lng=tempLng}
  try{await persistCoordinates(coordinateEditRegion,candidate);if(mode==="parking"){point.parkingLat=tempLat;point.parkingLng=tempLng}else{point.lat=tempLat;point.lng=tempLng;point[1]=tempLat;point[2]=tempLng}spot=point;region=coordinateEditRegion;finishCoordinateEdit();renderNav();if(mode==="snorkeling")load();else renderMap()}
  catch(error){console.error("[SNORKY Admin] 핀 위치 저장 실패",error);alert(error.message||"핀 위치를 저장하지 못했습니다.")}
}

async function deletePoint(point){
  if(typeof point==="string"){const managerRegion=getRegionById(pointManagerRegionId);point=(locations[managerRegion?.name]||[]).find(item=>item.id===point)}
  if(!point||!confirm(`'${point.name}' 포인트와 연결된 사진을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))return;
  try{await requireAdmin();const imageRows=await sb().from("point_images").select("storage_path").eq("point_id",point.supabaseId);if(imageRows.error)throw imageRows.error;const paths=(imageRows.data||[]).map(row=>row.storage_path).filter(Boolean);if(paths.length){const removed=await sb().storage.from(PHOTO_BUCKET).remove(paths);if(removed.error)throw removed.error}const result=await sb().from("points").delete().eq("id",point.supabaseId);if(result.error)throw result.error;closePointModal();await reload(null,getRegionById(point.regionId)?.supabaseId)}catch(error){alert(error.message||"포인트를 삭제하지 못했습니다.")}
}

async function compress(file){
  if(file.size<=5*1024*1024)return file;const bitmap=await createImageBitmap(file);const scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.82));if(!blob)throw new Error("사진 압축에 실패했습니다.");return new File([blob],file.name.replace(/\.[^.]+$/,"")+".jpg",{type:"image/jpeg"})
}

async function uploadPhotos(pointId,files){
  await requireAdmin();for(const original of files){const file=await compress(original),ext=(file.name.split(".").pop()||"jpg").toLowerCase(),path=`points/${pointId}/${crypto.randomUUID()}.${ext}`;const upload=await sb().storage.from(PHOTO_BUCKET).upload(path,file,{contentType:file.type,upsert:false});if(upload.error)throw upload.error;const count=await sb().from("point_images").select("id",{count:"exact",head:true}).eq("point_id",pointId);if(count.error)throw count.error;const saved=await sb().from("point_images").insert({point_id:pointId,storage_path:path,file_name:file.name,mime_type:file.type,is_primary:(count.count||0)===0,sort_order:count.count||0});if(saved.error){await sb().storage.from(PHOTO_BUCKET).remove([path]);throw saved.error}}}

async function deletePhoto(point,image){
  await requireAdmin();const row=await sb().from("point_images").select("storage_path").eq("id",image.id).single();if(row.error)throw row.error;const removed=await sb().storage.from(PHOTO_BUCKET).remove([row.data.storage_path]);if(removed.error)throw removed.error;const deleted=await sb().from("point_images").delete().eq("id",image.id);if(deleted.error)throw deleted.error;await reload(point.supabaseId,getRegionById(point.regionId)?.supabaseId);renderPointModal();
}

async function primaryPhoto(point,image){
  await requireAdmin();let result=await sb().from("point_images").update({is_primary:false}).eq("point_id",point.supabaseId);if(result.error)throw result.error;result=await sb().from("point_images").update({is_primary:true}).eq("id",image.id);if(result.error)throw result.error;await reload(point.supabaseId,getRegionById(point.regionId)?.supabaseId);renderPointModal();
}

async function renderPhotos(point){const host=el("pointPhotoContent");if(!host)return;const images=values(point.images);if(typeof renderPhotoSlider==="function"){renderPhotoSlider(host,images,point);if(adminMode){const addBtn=el("sbAddPhotos"),input=el("sbPhotoInput");if(addBtn&&input){addBtn.onclick=()=>input.click();input.onchange=async event=>{try{await uploadPhotos(point.supabaseId,[...event.target.files]);await reload(point.supabaseId,getRegionById(point.regionId)?.supabaseId);renderPointModal()}catch(error){alert(error.message||"사진 업로드에 실패했습니다.")}}}host.querySelectorAll("[data-sb-primary]").forEach(button=>button.onclick=()=>primaryPhoto(point,images.find(item=>String(item.id)===button.dataset.sbPrimary)).catch(error=>alert(error.message)));host.querySelectorAll("[data-sb-delete]").forEach(button=>button.onclick=()=>{const image=images.find(item=>String(item.id)===button.dataset.sbDelete);if(confirm("이 사진을 삭제할까요?"))deletePhoto(point,image).catch(error=>alert(error.message))})}}}

function bindSecretEntry(){
  const brands=document.querySelectorAll(".brand-mark, .home-hero-brand, #adminEntry");
  [el("adminExport"),el("adminImport")].forEach(node=>{if(node)node.hidden=true});
  el("editPointName")?.removeAttribute("readonly");
  el("editPointName")?.classList.remove("admin-readonly");
  const activate=()=>{
    const now=Date.now();
    clickTimes=clickTimes.filter(time=>now-time<=3000);
    clickTimes.push(now);
    if(clickTimes.length>=5){
      clickTimes=[];
      if(typeof openAdminLogin==="function")openAdminLogin();
      else if(typeof window.openAdminLogin==="function")window.openAdminLogin();
      else document.getElementById("adminLoginModal")?.classList.add("open");
    }
  };
  brands.forEach(brand=>{
    brand.style.cursor="pointer";
    brand.addEventListener("click",activate);
    brand.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();activate()}});
  });
}

// 실내 다이빙 센터 관리자 기능
async function loadIndoorCentersAdmin() {
  await requireAdmin();
  const { data, error } = await sb()
    .from("indoor_diving_centers")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;

  let imagesMap = {};
  try {
    const { data: imgData } = await sb().from("indoor_center_images").select("*").order("sort_order", { ascending: true });
    if (Array.isArray(imgData)) {
      imgData.forEach((img) => {
        if (!imagesMap[img.center_id]) imagesMap[img.center_id] = [];
        imagesMap[img.center_id].push(img);
      });
    }
  } catch (_) {}

  return (data || []).map((row) => ({
    ...row,
    images: imagesMap[row.id] || []
  }));
}

async function saveIndoorCenterAdmin(centerData) {
  await requireAdmin();
  if (!centerData.name || !centerData.region) {
    throw new Error("센터명과 광역지역은 필수입니다.");
  }
  let centerId = (centerData.id || "").trim();
  if (!centerId) {
    centerId = `indoor-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }
  const payload = {
    id: centerId,
    name: centerData.name.trim(),
    is_active: centerData.is_active === true,
    region: centerData.region.trim(),
    sub_region: (centerData.sub_region || "").trim(),
    address: (centerData.address || "").trim(),
    lat: Number.isFinite(centerData.lat) ? centerData.lat : null,
    lng: Number.isFinite(centerData.lng) ? centerData.lng : null,
    max_depth: centerData.max_depth ? Number(centerData.max_depth) : null,
    has_freediving: centerData.has_freediving !== undefined ? Boolean(centerData.has_freediving) : Boolean(centerData.freediving_available),
    has_scuba: centerData.has_scuba !== undefined ? Boolean(centerData.has_scuba) : Boolean(centerData.scuba_available),
    has_parking: centerData.has_parking !== undefined ? Boolean(centerData.has_parking) : Boolean(centerData.parking_available),
    status: centerData.status || "운영중",
    business_hours: (centerData.business_hours || centerData.businessHours || "").trim(),
    holiday: (centerData.holiday || centerData.closed_days || "").trim(),
    parking_info: (centerData.parking_info || centerData.parkingInfo || "").trim(),
    phone: (centerData.phone || "").trim(),
    homepage: (centerData.homepage || centerData.website_url || "").trim(),
    map_guide: (centerData.map_guide || centerData.map_url || "").trim(),
    facilities: (centerData.facilities || centerData.facility_info || "").trim(),
    feature_short: (centerData.feature_short || (Array.isArray(centerData.facility_features) ? centerData.facility_features.join(", ") : "") || "").trim(),
    feature_full: (centerData.feature_full || (Array.isArray(centerData.facility_features) ? centerData.facility_features.join(", ") : "") || "").trim(),
    description: (centerData.description || "").trim(),
    pool_temp: (centerData.pool_temp || "").trim(),
    pool_specs: (centerData.pool_specs || "").trim(),
    price_short: (centerData.price_short || "").trim(),
    price_full: (centerData.price_full || centerData.pricing_info || "").trim(),
    rental_info: (centerData.rental_info || "").trim(),
    reservation_info: (centerData.reservation_info || centerData.booking_info || "").trim(),
    buddy_condition: (centerData.buddy_condition || "").trim(),
    image_url: (centerData.image_url || "").trim() || null,
    sort_order: Number.isInteger(centerData.sort_order) ? centerData.sort_order : 0,
    updated_at: new Date().toISOString()
  };

  let result;
  if (centerData.id) {
    const editableFields = [
      "name", "region", "sub_region", "address", "lat", "lng", "max_depth", "is_active",
      "has_freediving", "has_scuba", "has_parking", "status",
      "business_hours", "holiday", "parking_info", "phone", "homepage",
      "map_guide", "facilities", "feature_short", "price_full", "reservation_info", "updated_at"
    ];
    const updates = Object.fromEntries(editableFields.map(key => [key, payload[key]]));
    updates.status = { active: "운영중", check_needed: "확인필요", closed: "휴장" }[updates.status] || updates.status;
    result = await sb().from("indoor_diving_centers").update(updates).eq("id", centerId).select("id").single();
  } else {
    result = await sb().from("indoor_diving_centers").upsert(payload).select("id").single();
  }
  const { data, error } = result;
  if (error) throw error;

  if (window.SNORKYIndoor?.loadIndoorCenters) {
    await window.SNORKYIndoor.loadIndoorCenters();
  }
  return data;
}

async function deleteIndoorCenterAdmin(centerId) {
  await requireAdmin();
  if (!centerId) return;

  const { data: center, error: fetchErr } = await sb().from("indoor_diving_centers").select("id, name").eq("id", centerId).single();
  if (fetchErr || !center) throw new Error("삭제할 센터를 찾을 수 없습니다.");

  // 버디 공고 연결 여부 검사 (무조건 cascade 방지)
  const { count, error: countErr } = await sb()
    .from("buddy_posts")
    .select("id", { count: "exact", head: true })
    .or(`point_id.eq.${center.id},point_name.eq.${center.name}`);
  if (!countErr && count && count > 0) {
    throw new Error(`해당 실내센터와 연결된 버디 모집 공고가 ${count}건 존재합니다. 공고가 종료되거나 연결이 변경된 후 삭제할 수 있습니다.`);
  }

  const { data: imgRows } = await sb().from("indoor_center_images").select("storage_path").eq("center_id", centerId);
  const paths = (imgRows || []).map((r) => r.storage_path).filter(Boolean);
  if (paths.length > 0) {
    await sb().storage.from(PHOTO_BUCKET).remove(paths);
  }

  const { error: delErr } = await sb().from("indoor_diving_centers").delete().eq("id", centerId);
  if (delErr) throw delErr;

  if (window.SNORKYIndoor?.loadIndoorCenters) {
    await window.SNORKYIndoor.loadIndoorCenters();
  }
}

async function uploadCenterPhotosAdmin(centerId, files) {
  await requireAdmin();
  for (const original of files) {
    const file = await compress(original);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `centers/${centerId}/${crypto.randomUUID()}.${ext}`;
    const upload = await sb().storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const count = await sb().from("indoor_center_images").select("id", { count: "exact", head: true }).eq("center_id", centerId);
    if (count.error) throw count.error;
    const isPrimary = (count.count || 0) === 0;
    const saved = await sb().from("indoor_center_images").insert({
      center_id: centerId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      is_primary: isPrimary,
      sort_order: count.count || 0
    });
    if (saved.error) {
      await sb().storage.from(PHOTO_BUCKET).remove([path]);
      throw saved.error;
    }
    if (isPrimary) {
      const pubUrl = sb().storage.from(PHOTO_BUCKET).getPublicUrl(path).data?.publicUrl;
      if (pubUrl) {
        await sb().from("indoor_diving_centers").update({ image_url: pubUrl }).eq("id", centerId);
      }
    }
  }
  if (window.SNORKYIndoor?.loadIndoorCenters) {
    await window.SNORKYIndoor.loadIndoorCenters();
  }
}

async function deleteCenterPhotoAdmin(centerId, imageId) {
  await requireAdmin();
  const { data: row, error: fetchErr } = await sb().from("indoor_center_images").select("storage_path, is_primary").eq("id", imageId).single();
  if (fetchErr) throw fetchErr;
  if (row?.storage_path) {
    await sb().storage.from(PHOTO_BUCKET).remove([row.storage_path]);
  }
  const { error: delErr } = await sb().from("indoor_center_images").delete().eq("id", imageId);
  if (delErr) throw delErr;

  if (row?.is_primary) {
    const { data: nextImages } = await sb()
      .from("indoor_center_images")
      .select("id, storage_path")
      .eq("center_id", centerId)
      .order("sort_order", { ascending: true })
      .limit(1);
    if (nextImages && nextImages.length > 0) {
      await sb().from("indoor_center_images").update({ is_primary: true }).eq("id", nextImages[0].id);
      const pubUrl = sb().storage.from(PHOTO_BUCKET).getPublicUrl(nextImages[0].storage_path).data?.publicUrl;
      await sb().from("indoor_diving_centers").update({ image_url: pubUrl }).eq("id", centerId);
    } else {
      await sb().from("indoor_diving_centers").update({ image_url: null }).eq("id", centerId);
    }
  }

  if (window.SNORKYIndoor?.loadIndoorCenters) {
    await window.SNORKYIndoor.loadIndoorCenters();
  }
}

async function primaryCenterPhotoAdmin(centerId, imageId) {
  await requireAdmin();
  await sb().from("indoor_center_images").update({ is_primary: false }).eq("center_id", centerId);
  const { data: updated, error } = await sb().from("indoor_center_images").update({ is_primary: true }).eq("id", imageId).select("storage_path").single();
  if (error) throw error;
  if (updated?.storage_path) {
    const pubUrl = sb().storage.from(PHOTO_BUCKET).getPublicUrl(updated.storage_path).data?.publicUrl;
    if (pubUrl) {
      await sb().from("indoor_diving_centers").update({ image_url: pubUrl }).eq("id", centerId);
    }
  }
  if (window.SNORKYIndoor?.loadIndoorCenters) {
    await window.SNORKYIndoor.loadIndoorCenters();
  }
}

async function loadRegionsAdmin(){await requireAdmin();let result=await sb().from("regions").select("id,name,warning_area_code,land_warning_area_code").order("name");if(result.error&&String(result.error.message||"").includes("land_warning_area_code"))result=await sb().from("regions").select("id,name,warning_area_code").order("name");if(result.error)throw result.error;return result.data||[]}
async function loadPointsAdmin(){await requireAdmin();const result=await sb().from("points").select("id,region_id,name,lat,lng,parking_lat,parking_lng,point_feature,snorkeling_info,parking,toilet,shower,camping,cooking,access_guide,facilities,notes,youtube_url,youtube_title,environment").order("name");if(result.error)throw result.error;const data=result.data||[];let imagesMap={};try{const imgRes=await sb().from("point_images").select("*").order("sort_order",{ascending:true});if(Array.isArray(imgRes.data))imgRes.data.forEach(img=>{if(!imagesMap[img.point_id])imagesMap[img.point_id]=[];imagesMap[img.point_id].push(img)});}catch(_){}return data.map(row=>({...row,environment:row.environment?normalizePointEnvironment(row.environment):normalizePointEnvironment(null),images:imagesMap[row.id]||[]}));}
async function saveRegionAdmin(region){await requireAdmin();const payload={name:String(region.name||"").trim()};if(!payload.name)throw new Error("지역명을 입력해 주세요.");let result;if(region.id)result=await sb().from("regions").update(payload).eq("id",region.id).select("id,name").single();else result=await sb().from("regions").insert(payload).select("id,name").single();if(result.error)throw result.error;return result.data}
async function deleteRegionAdmin(id){await requireAdmin();const result=await sb().from("regions").delete().eq("id",id);if(result.error)throw result.error;return result.data}
async function savePointAdmin(point){await requireAdmin();const lat=parseFloat(String(point.lat));const lng=parseFloat(String(point.lng));const pLat=point.parking_lat!=null&&String(point.parking_lat)!==""?parseFloat(String(point.parking_lat)):null;const pLng=point.parking_lng!=null&&String(point.parking_lng)!==""?parseFloat(String(point.parking_lng)):null;const payload={region_id:point.region_id,name:String(point.name||"").trim(),lat,lng,parking_lat:Number.isFinite(pLat)?pLat:null,parking_lng:Number.isFinite(pLng)?pLng:null,point_feature:point.point_feature||"",snorkeling_info:point.snorkeling_info||"",parking:point.parking||"",toilet:point.toilet||"",shower:point.shower||"",camping:point.camping||"",cooking:point.cooking||"",access_guide:point.access_guide||"",facilities:Array.isArray(point.facilities)?point.facilities:String(point.facilities||"").split(",").map(v=>v.trim()).filter(Boolean),notes:Array.isArray(point.notes)?point.notes:String(point.notes||"").split(",").map(v=>v.trim()).filter(Boolean),youtube_url:point.youtube_url||null,youtube_title:point.youtube_title||null,environment:point.environment?normalizePointEnvironment(point.environment):normalizePointEnvironment(null)};if(!payload.name||!payload.region_id||!Number.isFinite(payload.lat)||!Number.isFinite(payload.lng))throw new Error("포인트명, 지역, 위도, 경도를 입력해 주세요.");let result;if(point.id)result=await sb().from("points").update(payload).eq("id",point.id).select("id").single();else result=await sb().from("points").insert(payload).select("id").single();if(result.error)throw result.error;return result.data}
async function uploadPointPhotoAdmin(pointId,files){await uploadPhotos(pointId,files)}
async function deletePointPhotoAdmin(pointId,imageId){await requireAdmin();const row=await sb().from("point_images").select("storage_path").eq("id",imageId).single();if(row.error)throw row.error;const removed=await sb().storage.from(PHOTO_BUCKET).remove([row.data.storage_path]);if(removed.error)throw removed.error;const deleted=await sb().from("point_images").delete().eq("id",imageId);if(deleted.error)throw deleted.error;}
async function primaryPointPhotoAdmin(pointId,imageId){await requireAdmin();let r=await sb().from("point_images").update({is_primary:false}).eq("point_id",pointId);if(r.error)throw r.error;r=await sb().from("point_images").update({is_primary:true}).eq("id",imageId);if(r.error)throw r.error;}
async function deletePointAdmin(id){await requireAdmin();const imageRows=await sb().from("point_images").select("storage_path").eq("point_id",id);if(imageRows.error)throw imageRows.error;const paths=(imageRows.data||[]).map(row=>row.storage_path).filter(Boolean);if(paths.length){const removed=await sb().storage.from(PHOTO_BUCKET).remove(paths);if(removed.error)throw removed.error}const result=await sb().from("points").delete().eq("id",id);if(result.error)throw result.error;return result.data}
async function loadPointGearAdmin(pointId){await requireAdmin();if(!pointId)return[];const result=await sb().from("point_gear_items").select("id,point_id,item_name,icon,description,sort_order,is_active,affiliate_url,created_at").eq("point_id",Number(pointId)).order("sort_order",{ascending:true}).order("created_at",{ascending:true});if(result.error)throw result.error;return result.data||[]}
async function savePointGearAdmin(pointId,items){await requireAdmin();if(!pointId)throw new Error("포인트 ID가 필요합니다.");const pid=Number(pointId);const clean=(items||[]).map((it,idx)=>({id:it.id||null,point_id:pid,item_name:String(it.item_name||"").trim(),icon:String(it.icon||"🎒").trim()||"🎒",description:String(it.description||"").trim(),sort_order:idx,is_active:it.is_active!==false,affiliate_url:String(it.affiliate_url||"").trim()||null}));for(const it of clean){if(!it.item_name)throw new Error("모든 필요용품의 품목명을 입력해 주세요.")}const existRes=await sb().from("point_gear_items").select("id").eq("point_id",pid);if(existRes.error)throw existRes.error;const existIds=new Set((existRes.data||[]).map(r=>r.id));for(const it of clean){if(it.id&&existIds.has(it.id)){const{id,...upd}=it;const r=await sb().from("point_gear_items").update(upd).eq("id",id).eq("point_id",pid);if(r.error)throw r.error}}for(const it of clean){if(!it.id||!existIds.has(it.id)){const{id,...ins}=it;const r=await sb().from("point_gear_items").insert(ins);if(r.error)throw r.error}}const keepIds=new Set(clean.map(i=>i.id).filter(Boolean));const delIds=[...existIds].filter(id=>!keepIds.has(id));if(delIds.length){const r=await sb().from("point_gear_items").delete().eq("point_id",pid).in("id",delIds);if(r.error)throw r.error}return await loadPointGearAdmin(pid)}
async function bindCommunitySettings(){const save=el("saveCommunityConfig");if(!save)return;const enabled=el("communityEnabled"),url=el("communityOpenChatUrl"),banner=el("communityBannerText");let baseline=null,resetTimer=null;const current=()=>({enabled:enabled.checked,open_chat_url:url.value.trim(),banner_text:banner.value.trim()}),same=()=>baseline&&JSON.stringify(current())===JSON.stringify(baseline),setButton=text=>{save.textContent=text},refreshButton=()=>setButton(same()?"저장":"변경 저장");const sync=async()=>{try{const config=await loadCommunityConfig();enabled.checked=Boolean(config.enabled);url.value=config.open_chat_url||"";banner.value=config.banner_text||"함께 다이빙하고 함께 이야기해요";baseline=current();setButton("저장");return true}catch(error){message("communityConfigMessage",error,"운영 설정을 불러오지 못했습니다.");return false}};await sync();[enabled,url,banner].forEach(input=>{input.addEventListener("input",refreshButton);input.addEventListener("change",refreshButton)});window.addEventListener("snorky:admin-state",event=>{if(event.detail?.authorized===true)sync()});save.onclick=async()=>{try{await saveCommunityConfig();message("communityConfigMessage",null,"저장되었습니다.");baseline=current();setButton("저장 완료");clearTimeout(resetTimer);resetTimer=setTimeout(refreshButton,1800)}catch(error){message("communityConfigMessage",error,"저장하지 못했습니다.");setButton("저장 실패")}}}
async function loadCommunityConfig(){const result=await sb().from("app_settings").select("value").eq("key","community_config").maybeSingle();if(result.error)throw result.error;return result.data?.value||{enabled:false,open_chat_url:"",banner_text:"함께 다이빙하고 함께 이야기해요"}}
async function saveCommunityConfig(){const user=await requireAdmin(),enabled=el("communityEnabled").checked,url=el("communityOpenChatUrl").value.trim(),bannerText=el("communityBannerText").value.trim();if(enabled&&!url)throw new Error("활성화하려면 오픈채팅 URL을 입력해 주세요.");if(url&&!/^https:\/\/open\.kakao\.com\/o\//i.test(url))throw new Error("카카오 오픈채팅 URL 형식이 올바르지 않습니다.");const result=await sb().from("app_settings").upsert({key:"community_config",value:{enabled,open_chat_url:url,banner_text:bannerText||"함께 다이빙하고 함께 이야기해요"},updated_at:new Date().toISOString(),updated_by:user.id});if(result.error)throw result.error}

async function loadCertificationRequestsAdmin() {
  await requireAdmin();
  const result = await sb()
    .from("certification_requests")
    .select("id, user_id, nickname, organization:agency, level, certification_number, status, rejection_reason, requested_at, reviewed_at, reviewed_by, photo_path, photo_mime_type, photo_deleted_at")
    .order("requested_at", { ascending: false });
  if (result.error) throw result.error;
  return result.data || [];
}

async function reviewCertificationRequestAdmin(requestId, status, rejectionReason) {
  await requireAdmin();
  const result = await sb().rpc("review_certification_request", {
    p_request_id: Number(requestId),
    p_status: status,
    p_rejection_reason: rejectionReason || null
  });
  if (result.error) throw result.error;
  const reviewed = Array.isArray(result.data) ? result.data[0] : result.data;
  let photoDeleteError = null;
  if (reviewed?.photo_path) {
    try {
      await deleteCertificationPhotoAdmin(requestId, reviewed.photo_path);
    } catch (error) {
      photoDeleteError = error?.message || "자격증 사진 삭제 실패";
    }
  }
  return { review: result.data, photoDeleteError };
}

async function getCertificationPhotoUrlAdmin(photoPath) {
  await requireAdmin();
  if (!photoPath) throw new Error("검수할 자격증 사진이 없습니다.");
  const result = await sb().storage.from("certification-photos").createSignedUrl(photoPath, 300);
  if (result.error) throw result.error;
  return result.data?.signedUrl || "";
}

async function deleteCertificationPhotoAdmin(requestId, photoPath) {
  await requireAdmin();
  if (!photoPath) return;
  const removed = await sb().storage.from("certification-photos").remove([photoPath]);
  if (removed.error) throw removed.error;
  const cleared = await sb().rpc("clear_certification_photo_path", {
    p_request_id: Number(requestId),
    p_photo_path: photoPath
  });
  if (cleared.error) throw cleared.error;
}

async function revokeCertificationApprovalAdmin(requestId, reason) {
  await requireAdmin();
  const result = await sb().rpc("revoke_certification_approval", {
    p_request_id: Number(requestId),
    p_reason: reason || null
  });
  if (result.error) throw result.error;
  return result.data;
}

async function getReportEvidenceUrlAdmin(path) {
  await requireAdmin();
  if (!path) throw new Error("신고 증빙 이미지 경로가 없습니다.");
  const result = await sb().storage.from("report-evidence").createSignedUrl(path, 300);
  if (result.error) throw result.error;
  return result.data?.signedUrl || "";
}

async function loadUserReportsAdmin() {
  await requireAdmin();
  let reports = [];
  try {
    const rpcResult = await sb().rpc("get_user_reports_admin");
    if (!rpcResult.error && Array.isArray(rpcResult.data)) {
      reports = rpcResult.data;
    } else {
      throw rpcResult.error || new Error("RPC_FAILED");
    }
  } catch (_) {
    const reportResult = await sb()
      .from("user_reports")
      .select("id, target_user_id, target_nickname, reporter_user_id, reporter_nickname, reason, details, buddy_post_id, status, action_type, action_reason, reported_at, reviewed_at, reviewed_by, image_paths")
      .order("reported_at", { ascending: false });
    if (reportResult.error) throw reportResult.error;
    reports = reportResult.data || [];
  }

  const userIds = Array.from(new Set(reports.flatMap((row) => [row.target_user_id, row.reporter_user_id]).filter(Boolean)));
  const postIds = Array.from(new Set(reports.map((row) => Number(row.buddy_post_id)).filter(Boolean)));
  const profileMap = new Map();
  const postMap = new Map();
  const sanctionStateMap = new Map();

  if (userIds.length) {
    const profiles = await sb()
      .from("user_profiles")
      .select("provider_user_id, custom_nickname, custom_avatar_url, avatar_type, aida_level, gender, age_group")
      .in("provider_user_id", userIds);
    if (profiles.error) throw profiles.error;
    (profiles.data || []).forEach((profile) => profileMap.set(String(profile.provider_user_id), profile));
  }
  if (postIds.length) {
    const posts = await sb()
      .from("buddy_posts")
      .select("id, point_name, activity_type, event_date, status, user_id")
      .in("id", postIds);
    if (posts.error) throw posts.error;
    (posts.data || []).forEach((post) => postMap.set(Number(post.id), post));
  }
  const reportIds = reports.map((row) => Number(row.id)).filter(Boolean);
  if (reportIds.length) {
    const actions = await sb()
      .from("user_moderation_actions")
      .select("report_id, action_type, created_at")
      .in("report_id", reportIds)
      .order("created_at", { ascending: false });
    if (actions.error) throw actions.error;
    (actions.data || []).forEach((action) => {
      const reportId = Number(action.report_id);
      if (!sanctionStateMap.has(reportId)) sanctionStateMap.set(reportId, { latestSanctionAt: null, latestClearAt: null });
      const state = sanctionStateMap.get(reportId);
      if (action.action_type === "CLEAR" && !state.latestClearAt) state.latestClearAt = action.created_at;
      if (["WARNING", "SUSPEND_3_DAYS", "SUSPEND_7_DAYS", "SUSPEND_30_DAYS", "PERMANENT_BAN"].includes(action.action_type) && !state.latestSanctionAt) {
        state.latestSanctionAt = action.created_at;
      }
    });
  }

  const countMap = new Map();
  reports.forEach((row) => countMap.set(String(row.target_user_id), (countMap.get(String(row.target_user_id)) || 0) + 1));
  return reports.map((row) => ({
    ...row,
    target_profile: profileMap.get(String(row.target_user_id)) || null,
    reporter_profile: profileMap.get(String(row.reporter_user_id)) || null,
    related_post: postMap.get(Number(row.buddy_post_id)) || null,
    cumulative_report_count: countMap.get(String(row.target_user_id)) || 0,
    sanction_cancelled: (() => {
      const state = sanctionStateMap.get(Number(row.id));
      return Boolean(state?.latestClearAt && state?.latestSanctionAt && new Date(state.latestClearAt) > new Date(state.latestSanctionAt));
    })()
  }));
}

async function moderateUserReportAdmin(reportId, status, actionType, actionReason) {
  await requireAdmin();
  const result = await sb().rpc("moderate_user_report", {
    p_report_id: Number(reportId),
    p_status: status,
    p_action_type: actionType || null,
    p_action_reason: actionReason || null
  });
  if (result.error) throw result.error;
  return result.data;
}

async function cancelUserReportSanctionAdmin(reportId) {
  await requireAdmin();
  const result = await sb().rpc("cancel_user_report_sanction", { p_report_id: Number(reportId) });
  if (result.error) throw result.error;
  return result.data;
}

async function cancelBuddyPostFromReportAdmin(reportId, buddyPostId, reason) {
  await requireAdmin();
  const result = await sb().rpc("moderate_buddy_post_admin", {
    p_report_id: Number(reportId),
    p_buddy_post_id: Number(buddyPostId),
    p_reason: reason || null
  });
  if (result.error) throw result.error;
  return result.data;
}

async function loadUsersAdmin(search = "") {
  await requireAdmin();
  const result = await sb().rpc("get_admin_users", { p_search: search || null });
  if (result.error) throw result.error;
  return result.data || [];
}

async function moderateUserAdmin(userId, actionType, actionReason) {
  await requireAdmin();
  const result = await sb().rpc("moderate_user_direct", { p_user_id: userId, p_action_type: actionType, p_action_reason: actionReason || null });
  if (result.error) throw result.error;
  return result.data;
}

window.SNORKYAdmin = {
  login,
  logout,
  addRegion,
  renameRegion,
  deleteRegion,
  saveNew,
  saveDetail,
  persistCoordinates,
  deletePoint,
  uploadPhotos,
  restoreSession,
  bindSecretEntry,
  loadIndoorCentersAdmin,
  saveIndoorCenterAdmin,
  loadRegionsAdmin,
  loadPointsAdmin,
  saveRegionAdmin,
  deleteRegionAdmin,
  savePointAdmin,
  deletePointAdmin,
  uploadPointPhotoAdmin,
  deletePointPhotoAdmin,
  primaryPointPhotoAdmin,
  loadPointGearAdmin,
  savePointGearAdmin,
  deleteIndoorCenterAdmin,
  uploadCenterPhotosAdmin,
  deleteCenterPhotoAdmin,
  primaryCenterPhotoAdmin,
  loadCertificationRequestsAdmin,
  reviewCertificationRequestAdmin,
  getCertificationPhotoUrlAdmin,
  deleteCertificationPhotoAdmin,
  revokeCertificationApprovalAdmin,
  loadUserReportsAdmin,
  getReportEvidenceUrlAdmin,
  moderateUserReportAdmin,
  cancelUserReportSanctionAdmin,
  cancelBuddyPostFromReportAdmin,
  loadUsersAdmin,
  moderateUserAdmin,loadCommunityConfig,saveCommunityConfig
};
window.addAdminRegion=function(){return addRegion()};window.renameAdminRegion=function(id){return renameRegion(id)};window.deleteAdminRegion=function(){return deleteRegion()};
window.saveNewPoint=function(){return saveNew()};window.savePointDetailOverride=function(){return saveDetail()};window.persistPointCoordinate=function(regionName,point){return persistCoordinates(regionName,point)};
window.saveCoordinateEdit=function(){return savePin()};
window.deleteManagedPoint=function(point){return deletePoint(point)};window.refreshPointPhotos=function(point){return renderPhotos(point)};
bindSecretEntry();
window.addEventListener("DOMContentLoaded",bindCommunitySettings,{once:true});
window.addEventListener("load",bindSecretEntry,{once:true});
function initializeAuth(){sb().auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT")dispatchAdminState(false,{stage:"login"})});setTimeout(restoreSession,0)}
if(window.supabase?.createClient)initializeAuth();else window.addEventListener("snorky:supabase-ready",initializeAuth,{once:true});
})();
