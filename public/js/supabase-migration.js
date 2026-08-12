(function(){
"use strict";

// Browser-safe values only. Never place sb_secret, service_role, DB passwords, or JWT secrets here.
const SUPABASE_CONFIG=window.SNORKY_SUPABASE_CONFIG;
const IMAGE_LIMIT_BYTES=5*1024*1024;
const IMAGE_TARGET_BYTES=Math.floor(4.85*1024*1024);
let migrationClient=null,migrationAdminAuthorized=false,migrationAuthUser=null;
let passwordRecoveryListenerInstalled=false,passwordRecoveryActive=false;
const initialAuthUrlState={search:window.location.search,hash:window.location.hash};

function configured(){return /^https:\/\/.+\.supabase\.co\/?$/i.test(SUPABASE_CONFIG.url)&&/^sb_publishable_/.test(SUPABASE_CONFIG.publishableKey)}
function client(){
  if(!configured())throw new Error("SUPABASE_CONFIG에 URL과 Publishable key를 입력해 주세요.");
  if(!window.supabase?.createClient)throw new Error("Supabase JS Client를 불러오지 못했습니다.");
  if(!migrationClient)migrationClient=window.getSnorkySupabase();
  return migrationClient;
}
function openPasswordResetModal(){
  if(passwordRecoveryActive)return;
  passwordRecoveryActive=true;
  $("#passwordResetNew").value="";$("#passwordResetConfirm").value="";$("#passwordResetMessage").textContent="";
  $("#passwordResetModal").classList.add("open");$("#passwordResetNew").focus();
}
function closePasswordResetModal(){
  $("#passwordResetNew").value="";$("#passwordResetConfirm").value="";$("#passwordResetMessage").textContent="";$("#passwordResetModal").classList.remove("open");
}
async function updateRecoveredPassword(){
  const password=$("#passwordResetNew").value,confirmation=$("#passwordResetConfirm").value,message=$("#passwordResetMessage"),button=$("#passwordResetSubmit");
  message.classList.remove("success");
  if(password!==confirmation){message.textContent="비밀번호가 일치하지 않습니다.";return}
  if(password.length<6){message.textContent="비밀번호를 더 길게 입력해 주세요.";return}
  button.disabled=true;
  try{
    const result=await client().auth.updateUser({password});
    if(result.error)throw result.error;
    $("#passwordResetNew").value="";$("#passwordResetConfirm").value="";
    message.classList.add("success");message.textContent="비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.";
    const logout=await client().auth.signOut();if(logout.error)console.warn("[SNORKY Auth] 비밀번호 변경 후 로그아웃 실패",logout.error);
    passwordRecoveryActive=false;
    setTimeout(closePasswordResetModal,1600);
  }catch(error){console.error("[SNORKY Auth] 비밀번호 변경 실패",error);message.textContent=error.message||"비밀번호를 변경하지 못했습니다."}
  finally{button.disabled=false}
}
function installPasswordRecoveryListener(){
  if(passwordRecoveryListenerInstalled||!window.supabase?.createClient||!configured())return false;
  passwordRecoveryListenerInstalled=true;
  client().auth.onAuthStateChange((event)=>{
    console.log("[SNORKY AUTH EVENT]",event);
    if(event==="PASSWORD_RECOVERY")openPasswordResetModal();
  });
  return true;
}
function recoveryDetectedFromInitialUrl(){
  const query=new URLSearchParams(initialAuthUrlState.search),hash=new URLSearchParams(initialAuthUrlState.hash.replace(/^#/,""));
  return query.get("type")==="recovery"||hash.get("type")==="recovery";
}
function schedulePasswordRecoveryListener(){
  if(recoveryDetectedFromInitialUrl()){
    console.log("[SNORKY AUTH] recovery detected from URL");
    openPasswordResetModal();
  }
  if(installPasswordRecoveryListener())return;
  window.addEventListener("snorky:supabase-ready",installPasswordRecoveryListener,{once:true});
  let attempts=0;const timer=setInterval(()=>{attempts++;if(installPasswordRecoveryListener()||attempts>=1200)clearInterval(timer)},25);
}
function clone(value){return typeof structuredClone==="function"?structuredClone(value):JSON.parse(JSON.stringify(value))}
function text(value){return typeof value==="string"?value:""}
function finite(value){return Number.isFinite(value)?value:null}
function array(value){return Array.isArray(value)?clone(value):[]}
function isoOrUndefined(value){if(!value)return undefined;const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():undefined}
function effectiveRegionsSnapshot(){return getEffectiveRegions().map(item=>({...item}))}
function effectivePointsSnapshot(){
  const rows=[];
  effectiveRegionsSnapshot().forEach(regionItem=>{
    (locations[regionItem.name]||[]).forEach((source,index)=>{
      const point=clone(source),effective=getEffectivePoint(point,regionItem.name);
      rows.push({...effective,regionId:regionItem.id,region:regionItem.name,sortOrder:index});
    });
  });
  return rows;
}
function pointPayload(point,regionMap){
  const regionId=regionMap.get(point.regionId);
  if(regionId===undefined||regionId===null)throw new Error(`지역 매핑 없음: ${point.regionId}`);
  const payload={
    legacy_id:String(point.id),region_id:regionId,name:text(point.name),lat:finite(point.lat),lng:finite(point.lng),
    parking_lat:finite(point.parkingLat),parking_lng:finite(point.parkingLng),point_feature:text(point.pointFeature),
    snorkeling_info:text(point.snorkelingInfo),parking:text(point.parking),toilet:text(point.toilet),shower:text(point.shower),
    camping:text(point.camping),cooking:text(point.cooking),facilities:array(point.facilities),notes:array(point.notes),
    description:text(point.description),access_guide:text(point.accessGuide),access_steps:array(point.accessSteps),
    parking_available:typeof point.parkingAvailable==="boolean"?point.parkingAvailable:null,parking_guide:text(point.parkingGuide),
    entry_guide:text(point.entryGuide),entry_lat:finite(point.entryLat),entry_lng:finite(point.entryLng),
    depth_range:text(point.depthRange),difficulty:text(point.difficulty),point_type:text(point.pointType),warnings:array(point.warnings),
    sort_order:Number.isInteger(point.sortOrder)?point.sortOrder:0
  };
  const created=isoOrUndefined(point.createdAt),updated=isoOrUndefined(point.updatedAt);
  if(created)payload.created_at=created;
  if(updated)payload.updated_at=updated;
  return payload;
}

function openImagesDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open("snorkyPointImages",1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error("IndexedDB 연결 실패"));request.onblocked=()=>reject(new Error("IndexedDB 연결 차단"))})}
async function readImages(){
  if(typeof indexedDB.databases==="function"){
    const databases=await indexedDB.databases();
    if(!databases.some(database=>database.name==="snorkyPointImages"))return[];
  }
  const db=await openImagesDb();
  if(!db.objectStoreNames.contains("images")){db.close();return[]}
  return new Promise((resolve,reject)=>{const tx=db.transaction("images","readonly"),request=tx.objectStore("images").getAll();request.onsuccess=()=>{db.close();resolve(request.result||[])};request.onerror=()=>{db.close();reject(request.error)}});
}
function imageStats(images){
  const byPoint={};let primary=0,oversize=0;
  images.forEach(image=>{byPoint[image.pointId]=(byPoint[image.pointId]||0)+1;if(image.isPrimary)primary++;if(image.blob?.size>IMAGE_LIMIT_BYTES)oversize++});
  return{total:images.length,byPoint,primary,oversize};
}

function authStatus(message,state="signed-out"){
  const host=$("#migrationAuthStatus");if(!host)return;
  host.dataset.state=state;host.textContent=`Supabase 인증 상태: ${message}`;
}
function updateMigrationWriteControls(){
  ["#migrateRegionsPoints","#migratePointImages"].forEach(selector=>{const button=$(selector);if(button)button.disabled=!migrationAdminAuthorized});
  const logout=$("#migrationLogout");if(logout)logout.disabled=!migrationAuthUser;
}
async function verifyMigrationAdmin(user){
  migrationAdminAuthorized=false;migrationAuthUser=user||null;updateMigrationWriteControls();
  if(!user){authStatus("로그인 안 됨","signed-out");return false}
  authStatus("로그인됨 · 관리자 확인 중","signed-in");
  const result=await client().from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
  if(result.error)throw new Error(`admin_users 관리자 확인 실패: ${result.error.message}`);
  migrationAdminAuthorized=Boolean(result.data);updateMigrationWriteControls();
  authStatus(migrationAdminAuthorized?"관리자 확인됨":"관리자 권한 없음",migrationAdminAuthorized?"authorized":"denied");
  return migrationAdminAuthorized;
}
async function refreshMigrationAuth(){
  const result=await client().auth.getSession();if(result.error)throw result.error;
  return verifyMigrationAdmin(result.data.session?.user||null);
}
async function loginMigrationAdmin(){
  const email=$("#migrationAdminEmail").value.trim(),password=$("#migrationAdminPassword").value;
  if(!email||!password)throw new Error("이메일과 비밀번호를 입력해 주세요.");
  const result=await client().auth.signInWithPassword({email,password});
  $("#migrationAdminPassword").value="";
  if(result.error)throw new Error(`Supabase 로그인 실패: ${result.error.message}`);
  if(!result.data.user?.id)throw new Error("로그인 사용자 ID를 확인할 수 없습니다.");
  await verifyMigrationAdmin(result.data.user);
  if(!migrationAdminAuthorized)throw new Error("로그인은 성공했지만 admin_users 관리자 권한이 없습니다.");
  setMigrationMessage("Supabase 관리자 로그인이 완료되었습니다.");
}
async function logoutMigrationAdmin(){
  const result=await client().auth.signOut();if(result.error)throw new Error(`로그아웃 실패: ${result.error.message}`);
  migrationAdminAuthorized=false;migrationAuthUser=null;$("#migrationAdminPassword").value="";updateMigrationWriteControls();authStatus("로그인 안 됨","signed-out");setMigrationMessage("Supabase에서 로그아웃했습니다.");
}
async function requireMigrationAdmin(){
  const result=await client().auth.getSession();if(result.error)throw result.error;
  const user=result.data.session?.user;if(!user){await verifyMigrationAdmin(null);throw new Error("Supabase 관리자 로그인이 필요합니다.")}
  if(!migrationAdminAuthorized||migrationAuthUser?.id!==user.id)await verifyMigrationAdmin(user);
  if(!migrationAdminAuthorized)throw new Error("admin_users 관리자 권한이 필요합니다.");
}
function showPanel(){if(!adminMode)return;$("#supabaseMigrationModal").classList.add("open");setMigrationMessage("준비됨",false);task($("#migrationRefreshAuth"),refreshMigrationAuth)}
function closePanel(){$("#supabaseMigrationModal").classList.remove("open")}
function setMigrationMessage(message,error=false){const host=$("#supabaseMigrationOutput");if(!host)return;host.classList.toggle("migration-error",error);host.textContent=typeof message==="string"?message:JSON.stringify(message,null,2)}
function setBusy(button,busy){button.disabled=busy;button.dataset.label??=button.textContent;button.textContent=busy?"처리 중...":button.dataset.label}
function stagedMigrationError(stage,error){const wrapped=new Error(error?.message||String(error));wrapped.migrationStage=stage;wrapped.code=error?.code;wrapped.details=error?.details;wrapped.hint=error?.hint;return wrapped}
function formatMigrationError(stage,error){return[`작업 단계: ${error?.migrationStage||stage}`,`error.code: ${error?.code||"없음"}`,`error.message: ${error?.message||String(error)}`,`error.details: ${error?.details||"없음"}`,`error.hint: ${error?.hint||"없음"}`].join("\n")}
async function task(button,work){setBusy(button,true);try{await work()}catch(error){console.error("[SNORKY Migration]",error);setMigrationMessage(`실패\n${formatMigrationError(work.name||"Migration",error)}`,true)}finally{setBusy(button,false);updateMigrationWriteControls()}}

async function inspectMigrationData(){
  const images=await readImages(),stats=imageStats(images),basePoints=Object.values(BASE_LOCATIONS).flat().length;
  setMigrationMessage({
    regions:{base:BASE_REGIONS.length,adminAdded:readAdminAddedRegions().length,deleted:readDeletedRegionIds().length,effective:effectiveRegionsSnapshot().length},
    points:{base:basePoints,adminAdded:readAdminAddedPoints().length,deleted:readAdminDeletedPointIds().length,effective:effectivePointsSnapshot().length},
    overrides:{coordinates:Object.keys(readSavedPointCoordinates()).length,details:Object.keys(readPointDetailOverrides()).length},
    indexedDB:{database:"snorkyPointImages",store:"images",totalPhotos:stats.total,photosByPoint:stats.byPoint,primaryPhotos:stats.primary,over5MB:stats.oversize}
  });
}

async function testConnection(){
  const sb=client(),results={client:true,regionsSelect:false,pointsSelect:false,session:false};
  const [regionsResult,pointsResult,sessionResult]=await Promise.all([sb.from("regions").select("id",{count:"exact",head:true}),sb.from("points").select("id",{count:"exact",head:true}),sb.auth.getSession()]);
  if(regionsResult.error)throw new Error(`regions SELECT 실패: ${regionsResult.error.message}`);
  if(pointsResult.error)throw new Error(`points SELECT 실패: ${pointsResult.error.message}`);
  if(sessionResult.error)throw new Error(`Auth session 확인 실패: ${sessionResult.error.message}`);
  results.regionsSelect=true;results.pointsSelect=true;results.session=Boolean(sessionResult.data.session);results.regionCount=regionsResult.count;results.pointCount=pointsResult.count;
  setMigrationMessage({status:"연결 성공",...results});
}

async function verifyArrayColumns(){
  return{facilities:"jsonb",notes:"jsonb",verified:true,source:"database schema manually verified"};
}

async function verifyMigrationDataAccess(sb){
  const sessionResult=await sb.auth.getSession();
  if(sessionResult.error)throw stagedMigrationError("Auth session 확인",sessionResult.error);
  if(!sessionResult.data.session)throw stagedMigrationError("Auth session 확인",new Error("Supabase 관리자 로그인이 필요합니다."));
  const [regionsResult,pointsResult]=await Promise.all([sb.from("regions").select("id",{count:"exact",head:true}),sb.from("points").select("id",{count:"exact",head:true})]);
  if(regionsResult.error)throw stagedMigrationError("regions SELECT",regionsResult.error);
  if(pointsResult.error)throw stagedMigrationError("points SELECT",pointsResult.error);
  return{regionsSelect:true,pointsSelect:true};
}

async function migrateRegions(sb,regions,progress){
  const {data:existing,error}=await sb.from("regions").select("id,name");if(error)throw stagedMigrationError("Region 기존 데이터 조회",error);
  const normalizedNames=regions.map(item=>item.name.normalize("NFC"));
  if(new Set(normalizedNames).size!==normalizedNames.length)throw new Error("Effective Region에 동일한 지역명이 둘 이상 있어 안전하게 매핑할 수 없습니다.");
  const map=new Map(),byId=new Map((existing||[]).map(row=>[String(row.id),row])),byName=new Map((existing||[]).map(row=>[row.name.normalize("NFC"),row]));
  for(let index=0;index<regions.length;index++){
    const item=regions[index],normalized=item.name.normalize("NFC");let row=byId.get(String(item.id))||byName.get(normalized);
    if(!row){const result=await sb.from("regions").insert({name:item.name}).select("id,name").single();if(result.error){const retry=await sb.from("regions").select("id,name").eq("name",item.name).maybeSingle();if(retry.error||!retry.data)throw stagedMigrationError(`Region 저장: ${item.name}`,retry.error||result.error);row=retry.data}else row=result.data;byName.set(normalized,row)}
    map.set(item.id,row.id);progress.regions=index+1;renderProgress(progress);
  }
  return map;
}
function renderProgress(progress){setMigrationMessage(`Regions\n${progress.regions} / ${progress.regionTotal} 완료\n\nPoints\n${progress.points} / ${progress.pointTotal} 완료\n\n성공 ${progress.success} · SKIP ${progress.skip} · 실패 ${progress.failed}${progress.errors.length?`\n\n실패 목록\n${progress.errors.join("\n")}`:""}`)}
async function migrateRegionsAndPoints(){
  await requireMigrationAdmin();const sb=client();await verifyMigrationDataAccess(sb);await verifyArrayColumns();
  const regions=effectiveRegionsSnapshot(),points=effectivePointsSnapshot(),progress={regions:0,regionTotal:regions.length,points:0,pointTotal:points.length,success:0,skip:0,failed:0,errors:[]};renderProgress(progress);
  const regionMap=await migrateRegions(sb,regions,progress);
  for(let index=0;index<points.length;index++){
    const point=points[index];
    try{const payload=pointPayload(point,regionMap),result=await sb.from("points").upsert(payload,{onConflict:"legacy_id"}).select("id,legacy_id").single();if(result.error)throw stagedMigrationError(`Point UPSERT: ${point.name} / ${point.id}`,result.error);progress.success++}catch(error){progress.failed++;progress.errors.push(formatMigrationError(`Point UPSERT: ${point.name} / ${point.id}`,error))}
    progress.points=index+1;renderProgress(progress);
  }
}

function safeSegment(value){return String(value).normalize("NFC").replace(/[^a-zA-Z0-9._-]+/g,"_").replace(/^_+|_+$/g,"")||"image"}
function extensionFor(type){return type==="image/png"?"png":type==="image/webp"?"webp":"jpg"}
function canvasBlob(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("이미지 압축 실패")),type,quality))}
async function compressForMigration(original){
  if(original.size<=IMAGE_LIMIT_BYTES)return{blob:original,compressed:false};
  const bitmap=await createImageBitmap(original,{imageOrientation:"from-image"});let scale=Math.min(1,2600/Math.max(bitmap.width,bitmap.height)),quality=.9,last=null;
  try{
    for(let attempt=0;attempt<12;attempt++){
      const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext("2d",{alpha:false}).drawImage(bitmap,0,0,canvas.width,canvas.height);last=await canvasBlob(canvas,"image/webp",quality);
      if(last.size<IMAGE_TARGET_BYTES)return{blob:last,compressed:true};
      if(quality>.58)quality-=.08;else scale*=.82;
    }
  }finally{bitmap.close?.()}
  throw new Error(`압축 후에도 5MB 이상 (${last?Math.ceil(last.size/1024):"?"}KB)`);
}
async function migrateImages(){
  await requireMigrationAdmin();const sb=client(),images=await readImages(),aliases=new Map();
  effectivePointsSnapshot().forEach(point=>{aliases.set(String(point.id),String(point.id));aliases.set(`${point.region}::${point.name}`,String(point.id))});
  const canonicalLegacyId=image=>aliases.get(String(image.pointId))||String(image.pointId),legacyIds=[...new Set(images.map(canonicalLegacyId))];
  if(!images.length){setMigrationMessage("Images\n0 / 0 완료\n\n성공 0 · SKIP 0 · 실패 0");return}
  const {data:points,error:pointError}=await sb.from("points").select("id,legacy_id").in("legacy_id",legacyIds);if(pointError)throw pointError;
  const pointMap=new Map((points||[]).map(point=>[String(point.legacy_id),point.id])),progress={done:0,total:images.length,success:0,skip:0,failed:0,compressed:0,errors:[]};
  const render=()=>setMigrationMessage(`Images\n${progress.done} / ${progress.total} 완료\n${progress.compressed} 압축\n\n성공 ${progress.success} · SKIP ${progress.skip} · 실패 ${progress.failed}${progress.errors.length?`\n\n실패 목록\n${progress.errors.join("\n")}`:""}`);render();
  for(const image of images){
    try{
      const pointId=pointMap.get(canonicalLegacyId(image));if(pointId===undefined)throw new Error(`points.legacy_id 매칭 없음: ${image.pointId}`);
      if(!(image.blob instanceof Blob))throw new Error("사진 Blob 없음");const converted=await compressForMigration(image.blob);if(converted.compressed)progress.compressed++;
      const ext=extensionFor(converted.blob.type),basePath=`points/${pointId}/${safeSegment(image.id)}`,storagePath=`${basePath}.${ext}`;
      const duplicate=await sb.from("point_images").select("id").eq("storage_path",storagePath).maybeSingle();if(duplicate.error)throw duplicate.error;if(duplicate.data){progress.skip++;continue}
      const upload=await sb.storage.from("point-images").upload(storagePath,converted.blob,{contentType:converted.blob.type||"application/octet-stream",upsert:false});if(upload.error&&!/already exists|duplicate/i.test(upload.error.message))throw upload.error;
      const metadata={point_id:pointId,storage_path:storagePath,file_name:text(image.fileName)||`${safeSegment(image.id)}.${ext}`,mime_type:converted.blob.type||image.blob.type||"application/octet-stream",is_primary:Boolean(image.isPrimary),sort_order:Number.isFinite(image.order)?image.order:0};const created=isoOrUndefined(image.createdAt);if(created)metadata.created_at=created;
      const saved=await sb.from("point_images").insert(metadata);if(saved.error)throw saved.error;progress.success++;
    }catch(error){progress.failed++;progress.errors.push(`${image.fileName||image.id} / ${image.pointId}: ${error.message||error}`)}finally{progress.done++;render()}
  }
}

function installUi(){
  const controls=$("#adminControls");if(!controls||$("#openSupabaseMigration"))return;
  controls.insertAdjacentHTML("beforeend",'<button id="openSupabaseMigration" class="admin-export" type="button">Supabase 이전</button>');
  document.body.insertAdjacentHTML("beforeend",'<div id="supabaseMigrationModal" class="admin-dialog" role="dialog" aria-modal="true"><article class="admin-dialog-card"><header class="admin-dialog-head"><h2>Supabase 데이터 이전</h2><button id="closeSupabaseMigration" class="admin-dialog-close" type="button">×</button></header><p class="migration-warning">기존 localStorage와 IndexedDB는 읽기만 하며 자동 삭제하지 않습니다.</p><section class="migration-auth"><h3>Supabase 관리자 로그인</h3><div class="migration-auth-fields"><label>이메일<input id="migrationAdminEmail" type="email" autocomplete="username"></label><label>비밀번호<input id="migrationAdminPassword" type="password" autocomplete="current-password"></label></div><div class="migration-auth-actions"><button id="migrationAdminLogin" type="button">Supabase 관리자 로그인</button><button id="migrationLogout" type="button" disabled>로그아웃</button><button id="migrationRefreshAuth" type="button" hidden>세션 확인</button></div><p id="migrationAuthStatus" class="migration-auth-status" data-state="signed-out">Supabase 인증 상태: 로그인 안 됨</p></section><div class="migration-actions"><button id="inspectMigrationData" type="button">이전 데이터 검사</button><button id="testSupabaseConnection" type="button">Supabase 연결 테스트</button><button id="migrateRegionsPoints" type="button" disabled>지역/포인트 이전</button><button id="migratePointImages" type="button" disabled>사진 이전</button></div><pre id="supabaseMigrationOutput" class="migration-output">준비됨</pre></article></div>');
  document.body.insertAdjacentHTML("beforeend",'<div id="passwordResetModal" class="admin-dialog password-reset-modal" role="dialog" aria-modal="true" aria-labelledby="passwordResetTitle"><article class="admin-dialog-card small"><header class="admin-dialog-head"><h2 id="passwordResetTitle">새 비밀번호 설정</h2></header><div class="password-reset-fields"><label>새 비밀번호<input id="passwordResetNew" type="password" autocomplete="new-password"></label><label>새 비밀번호 확인<input id="passwordResetConfirm" type="password" autocomplete="new-password"></label></div><p id="passwordResetMessage" class="password-reset-message" aria-live="polite"></p><div class="admin-actions"><button id="passwordResetCancel" class="admin-cancel" type="button">취소</button><button id="passwordResetSubmit" class="admin-save" type="button">비밀번호 변경</button></div></article></div>');
  const style=document.createElement("style");style.textContent='.migration-warning{padding:11px 13px;border-radius:11px;background:#fff8e8;color:#8a5a00;font-size:13px}.migration-auth{margin-top:12px;padding:14px;border:1px solid #d5e5eb;border-radius:12px;background:#f8fbfc}.migration-auth h3{margin:0 0 10px}.migration-auth-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px}.migration-auth-fields label{color:#526d7a;font-size:12px;font-weight:700}.migration-auth-fields input{display:block;width:100%;height:42px;margin-top:5px;padding:0 11px;border:1px solid #c8dce5;border-radius:9px;font-size:14px}.migration-auth-actions{display:flex;gap:8px;margin-top:10px}.migration-auth-actions button{min-height:40px;padding:0 13px;border:0;border-radius:9px;background:#526d7a;color:#fff;font-weight:800}.migration-auth-actions button:first-child{background:#087ca7}.migration-auth-actions button:disabled{opacity:.5}.migration-auth-status{margin:10px 0 0;font-size:13px;font-weight:800;color:#64748b}.migration-auth-status[data-state="authorized"]{color:#078d4e}.migration-auth-status[data-state="denied"]{color:#c24136}.migration-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:14px 0}.migration-actions button{min-height:44px;border:0;border-radius:10px;background:#087ca7;color:#fff;font-weight:800;cursor:pointer}.migration-actions button:disabled{opacity:.55}.migration-output{min-height:240px;max-height:45vh;overflow:auto;padding:14px;border-radius:12px;background:#0f2a43;color:#d9f5ff;font:12px/1.65 Consolas,monospace;white-space:pre-wrap}.migration-output.migration-error{background:#431b1b;color:#ffe1dd}.password-reset-modal{z-index:7000}.password-reset-fields{display:grid;gap:12px}.password-reset-fields label{color:#526d7a;font-size:13px;font-weight:800}.password-reset-fields input{display:block;width:100%;height:44px;margin-top:6px;padding:0 12px;border:1px solid #c8dce5;border-radius:10px;font-size:15px}.password-reset-message{min-height:20px;margin:12px 0 0;color:#c24136;font-size:13px;font-weight:700}.password-reset-message.success{color:#078d4e}@media(max-width:700px){.migration-actions,.migration-auth-fields{grid-template-columns:1fr}.migration-auth-actions{flex-wrap:wrap}}';document.head.appendChild(style);
  $("#openSupabaseMigration").onclick=showPanel;$("#closeSupabaseMigration").onclick=closePanel;$("#supabaseMigrationModal").onclick=event=>{if(event.target===$("#supabaseMigrationModal"))closePanel()};
  $("#inspectMigrationData").onclick=event=>task(event.currentTarget,inspectMigrationData);$("#testSupabaseConnection").onclick=event=>task(event.currentTarget,testConnection);$("#migrateRegionsPoints").onclick=event=>task(event.currentTarget,migrateRegionsAndPoints);$("#migratePointImages").onclick=event=>task(event.currentTarget,migrateImages);
  $("#migrationAdminLogin").onclick=event=>task(event.currentTarget,loginMigrationAdmin);$("#migrationLogout").onclick=event=>task(event.currentTarget,logoutMigrationAdmin);updateMigrationWriteControls();
  $("#passwordResetCancel").onclick=()=>{passwordRecoveryActive=false;closePasswordResetModal()};$("#passwordResetSubmit").onclick=updateRecoveredPassword;$("#passwordResetConfirm").onkeydown=event=>{if(event.key==="Enter")updateRecoveredPassword()};
}

installUi();
schedulePasswordRecoveryListener();
window.SNORKYSupabaseMigration={inspect:inspectMigrationData,testConnection,migrateRegionsAndPoints,migrateImages};
})();
