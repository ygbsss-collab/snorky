(function(){
"use strict";

const PHOTO_BUCKET="point-images";
let authorized=false;
let clickTimes=[];

const el=id=>document.getElementById(id);
const sb=()=>window.getSnorkySupabase();
const values=value=>Array.isArray(value)?value:[];
const message=(target,error,fallback)=>{const node=el(target);if(node)node.textContent=error?.message||fallback;};

async function verifyAdmin(user){
  if(!user){authorized=false;setAdminMode(false);return false}
  const result=await sb().from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
  if(result.error)throw result.error;
  authorized=Boolean(result.data);
  setAdminMode(authorized);
  return authorized;
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
    closeAdminLogin();
  }catch(error){console.error("[SNORKY Admin] 로그인 실패",error);errorNode.textContent=error.message||"로그인하지 못했습니다."}
}

async function logout(){
  try{await sb().auth.signOut()}catch(error){console.error("[SNORKY Admin] 로그아웃 실패",error)}
  authorized=false;cancelCoordinateEdit();closePointEditModal();setAdminMode(false);
}

async function restoreSession(){
  try{const result=await sb().auth.getSession();if(result.error)throw result.error;await verifyAdmin(result.data.session?.user||null)}
  catch(error){authorized=false;setAdminMode(false);console.warn("[SNORKY Admin] 세션 확인 실패",error)}
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

function pointPayload(point,regionId){return{
  region_id:regionId,name:point.name,lat:point.lat,lng:point.lng,warning_area_code:point.warningAreaCode||getRegionById(point.regionId)?.warningAreaCode||null,parking_lat:point.parkingLat??null,parking_lng:point.parkingLng??null,
  point_feature:point.pointFeature||"",snorkeling_info:point.snorkelingInfo||"",parking:point.parking||"",toilet:point.toilet||"",shower:point.shower||"",camping:point.camping||"",cooking:point.cooking||"",
  facilities:values(point.facilities),notes:values(point.notes),description:point.description||"",access_guide:point.accessGuide||"",access_steps:values(point.accessSteps),
  parking_available:typeof point.parkingAvailable==="boolean"?point.parkingAvailable:null,parking_guide:point.parkingGuide||"",entry_guide:point.entryGuide||"",entry_lat:point.entryLat??null,entry_lng:point.entryLng??null,
  depth_range:point.depthRange||"",difficulty:point.difficulty||"",point_type:point.pointType||"",warnings:values(point.warnings),environment:point.environment==null?null:normalizePointEnvironment(point.environment),sort_order:Number.isInteger(point.sortOrder)?point.sortOrder:0
}}

async function saveNew(){
  if(!adminMode)return;el("newPointError").textContent="";
  try{
    await requireAdmin();const regionItem=getRegionById(el("newPointRegion").value),name=el("newPointName").value.trim();
    if(!name||!regionItem)throw new Error("포인트명과 지역은 필수입니다.");if(!Number.isFinite(newPointDraft.lat)||!Number.isFinite(newPointDraft.lng))throw new Error("지도에서 스노클링 포인트 위치를 선택해 주세요.");
    const point={name,lat:newPointDraft.lat,lng:newPointDraft.lng,parkingLat:newPointDraft.parkingLat,parkingLng:newPointDraft.parkingLng,pointFeature:el("newPointFeature").value.trim(),snorkelingInfo:el("newSnorkelingInfo").value.trim(),parking:el("newParking").value.trim(),toilet:el("newToilet").value.trim(),shower:el("newShower").value.trim(),camping:el("newCamping")?.value.trim()||"",cooking:el("newCooking")?.value.trim()||"",accessGuide:el("newAccessGuide").value.trim(),facilities:el("newFacilities").value.split(",").map(v=>v.trim()).filter(Boolean),notes:el("newNotes").value.split(",").map(v=>v.trim()).filter(Boolean),sortOrder:(locations[regionItem.name]||[]).length};
    const payload={...pointPayload(point,regionItem.supabaseId),legacy_id:crypto.randomUUID()};const result=await sb().from("points").insert(payload).select("id").single();if(result.error)throw result.error;
    const newPointId=result.data.id;
    try{
      await Promise.allSettled([
        window.SNORKYKmaWeatherCache?.fetch?.(point.lat,point.lng),
        window.SNORKYOpenMeteoMarineCache?.fetch?.(newPointId,point.name,point.lat,point.lng)
      ]);
    }catch(_warmErr){}
    const files=[...el("newPointPhotos").files];if(files.length)await uploadPhotos(newPointId,files);
    closeNewPointModal();closePointManager();await reload(newPointId,regionItem.supabaseId);openPointModal();
  }catch(error){console.error("[SNORKY Admin] 포인트 추가 실패",error);message("newPointError",error,"포인트를 저장하지 못했습니다.")}
}

async function saveDetail(){
  if(!adminMode||!spot)return;el("pointEditError").textContent="";
  try{await requireAdmin();const target=getRegionById(el("editPointRegion").value),point={...spot,name:el("editPointName").value.trim(),pointFeature:el("editPointFeature").value.trim(),snorkelingInfo:el("editSnorkelingInfo").value.trim(),parking:el("editParking").value.trim(),toilet:el("editToilet").value.trim(),shower:el("editShower").value.trim(),camping:el("editCamping")?.value.trim()||"",cooking:el("editCooking")?.value.trim()||"",accessGuide:el("editAccessGuide").value.trim(),facilities:[...adminEditFacilities],notes:[...adminEditNotes],environment:readEnvironmentEditor()};if(!target)throw new Error("지역을 찾을 수 없습니다.");const result=await sb().from("points").update(pointPayload(point,target.supabaseId)).eq("id",spot.supabaseId);if(result.error)throw result.error;const id=spot.supabaseId;closePointEditModal();await reload(id,target.supabaseId);renderPointModal();}
  catch(error){console.error("[SNORKY Admin] 포인트 수정 실패",error);message("pointEditError",error,"저장하지 못했습니다.")}
}

async function persistCoordinates(regionName,point){
  await requireAdmin();const result=await sb().from("points").update({lat:point.lat,lng:point.lng,parking_lat:point.parkingLat??null,parking_lng:point.parkingLng??null}).eq("id",point.supabaseId);if(result.error)throw result.error;
  try{
    await Promise.allSettled([
      window.SNORKYKmaWeatherCache?.fetch?.(point.lat,point.lng),
      window.SNORKYOpenMeteoMarineCache?.fetch?.(point.supabaseId||point.id,point.name,point.lat,point.lng)
    ]);
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

window.SNORKYAdmin={login,logout,addRegion,renameRegion,deleteRegion,saveNew,saveDetail,persistCoordinates,deletePoint,uploadPhotos,restoreSession,bindSecretEntry};
addAdminRegion=function(){return addRegion()};renameAdminRegion=function(id){return renameRegion(id)};deleteAdminRegion=function(id){return deleteRegion(id)};
saveNewPoint=function(){return saveNew()};savePointDetailOverride=function(){return saveDetail()};persistPointCoordinate=function(regionName,point){return persistCoordinates(regionName,point)};
saveCoordinateEdit=function(){return savePin()};
deleteManagedPoint=function(point){return deletePoint(point)};refreshPointPhotos=function(point){return renderPhotos(point)};
bindSecretEntry();
window.addEventListener("load",bindSecretEntry,{once:true});
function initializeAuth(){sb().auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT"){authorized=false;setAdminMode(false)}});restoreSession()}
if(window.supabase?.createClient)initializeAuth();else window.addEventListener("snorky:supabase-ready",initializeAuth,{once:true});
})();
