(function(){
"use strict";
const DATA_SOURCE={mode:"supabase",active:"local"};
window.SNORKY_DATA_SOURCE=DATA_SOURCE;
const list=value=>Array.isArray(value)?value:[];
const numberOrNull=value=>value===null||value===undefined||value===""?null:Number.isFinite(Number(value))?Number(value):null;
const internalRegionId=id=>`sb-region-${id}`;

function pointFromRow(row,regionItem){
  const lat=numberOrNull(row.lat),lng=numberOrNull(row.lng),point=[row.name,lat,lng];
  return Object.assign(point,{
    id:row.legacy_id||String(row.id),supabaseId:row.id,supabaseRead:true,adminAdded:false,
    regionId:internalRegionId(row.region_id),region:regionItem.name,name:row.name,lat,lng,warningAreaCode:row.warning_area_code||regionItem.warningAreaCode||null,
    parkingLat:numberOrNull(row.parking_lat),parkingLng:numberOrNull(row.parking_lng),
    pointFeature:row.point_feature||"",snorkelingInfo:row.snorkeling_info||"",parking:row.parking||"",toilet:row.toilet||"",shower:row.shower||"",camping:row.camping||"",cooking:row.cooking||"",
    facilities:list(row.facilities),notes:list(row.notes),description:row.description||"",accessGuide:row.access_guide||"",accessSteps:list(row.access_steps),
    parkingAvailable:typeof row.parking_available==="boolean"?row.parking_available:null,parkingGuide:row.parking_guide||"",entryGuide:row.entry_guide||"",entryLat:numberOrNull(row.entry_lat),entryLng:numberOrNull(row.entry_lng),
    depthRange:row.depth_range||"",difficulty:row.difficulty||"",pointType:row.point_type||"",warnings:list(row.warnings),environment:normalizePointEnvironment(row.environment),sortOrder:Number.isFinite(row.sort_order)?row.sort_order:null,
    createdAt:row.created_at||null,updatedAt:row.updated_at||null,images:[]
  });
}
function imageFromRow(sb,row){
  const result=sb.storage.from("point-images").getPublicUrl(row.storage_path),url=result?.data?.publicUrl;
  if(!url)throw new Error(`Storage public URL 생성 실패: ${row.storage_path}`);
  return{id:row.id,url,fileName:row.file_name||"",mimeType:row.mime_type||"",isPrimary:Boolean(row.is_primary),order:Number.isFinite(row.sort_order)?row.sort_order:0,createdAt:row.created_at||null};
}
async function loadRegionsFromSupabase(sb){const result=await sb.from("regions").select("id,name,warning_area_code");if(result.error)throw result.error;return(result.data||[]).map(row=>({id:internalRegionId(row.id),supabaseId:row.id,name:row.name,warningAreaCode:row.warning_area_code||null})).sort((a,b)=>a.name.localeCompare(b.name,"ko-KR"))}
async function loadPointsFromSupabase(sb){const result=await sb.from("points").select("id,legacy_id,region_id,name,lat,lng,warning_area_code,parking_lat,parking_lng,point_feature,snorkeling_info,parking,toilet,shower,camping,cooking,facilities,notes,description,access_guide,access_steps,parking_available,parking_guide,entry_guide,entry_lat,entry_lng,depth_range,difficulty,point_type,warnings,environment,sort_order,created_at,updated_at");if(result.error)throw result.error;return result.data||[]}
async function loadPointImagesFromSupabase(sb){const result=await sb.from("point_images").select("id,point_id,storage_path,file_name,mime_type,is_primary,sort_order,created_at");if(result.error)throw result.error;return result.data||[]}
function applySupabaseData(sb,regions,pointRows,imageRows){
  const regionBySupabaseId=new Map(regions.map(item=>[String(item.supabaseId),item])),imagesByPoint=new Map();
  imageRows.forEach(row=>{try{const image=imageFromRow(sb,row),key=String(row.point_id);if(!imagesByPoint.has(key))imagesByPoint.set(key,[]);imagesByPoint.get(key).push(image)}catch(error){console.warn("[SNORKY Supabase READ] 사진 URL 제외",error)}});
  imagesByPoint.forEach(images=>images.sort((a,b)=>Number(b.isPrimary)-Number(a.isPrimary)||a.order-b.order));
  const groups=new Map(regions.map(item=>[item.id,[]]));
  pointRows.forEach(row=>{const regionItem=regionBySupabaseId.get(String(row.region_id));if(!regionItem)return;const point=pointFromRow(row,regionItem);point.images=imagesByPoint.get(String(row.id))||[];groups.get(regionItem.id).push(point)});
  groups.forEach(points=>points.sort((a,b)=>{const aOrder=Number.isFinite(a.sortOrder)?a.sortOrder:Number.MAX_SAFE_INTEGER,bOrder=Number.isFinite(b.sortOrder)?b.sortOrder:Number.MAX_SAFE_INTEGER;return aOrder-bOrder||a.name.localeCompare(b.name,"ko-KR")}));
  window.SNORKY_SUPABASE_REGIONS=regions;
  window.SNORKY_ACTIVE_POINTS=regions.flatMap(regionItem=>groups.get(regionItem.id)||[]);
  Object.keys(locations).forEach(name=>delete locations[name]);
  Object.keys(BASE_LOCATIONS).forEach(name=>delete BASE_LOCATIONS[name]);
  BASE_REGIONS.splice(0,BASE_REGIONS.length,...regions.map(item=>({...item})));
  regions.forEach(item=>{locations[item.name]=groups.get(item.id)||[];BASE_LOCATIONS[item.name]=locations[item.name]});
  window.SNORKYMarineSafety?.registerPoints(Object.values(locations).flat());
  selectedRegionId=regions.some(item=>item.id===selectedRegionId)?selectedRegionId:regions[0]?.id||null;
  region=regions.find(item=>item.id===selectedRegionId)?.name||regions[0]?.name||"";spot=locations[region]?.[0]||null;
  DATA_SOURCE.active="supabase";
  renderNav();if(spot){load();renderMap()}else renderNoPointState();
  document.dispatchEvent(new CustomEvent("snorky:points-ready",{detail:{points:window.SNORKY_ACTIVE_POINTS.length,images:imageRows.length}}));
}
async function loadSnorkyDataFromSupabase(){
  const sb=window.getSnorkySupabase();
  const [regions,pointRows]=await Promise.all([loadRegionsFromSupabase(sb),loadPointsFromSupabase(sb)]);
  if(!regions.length||!pointRows.length)throw new Error("Supabase Region 또는 Point 데이터가 비어 있습니다.");
  let imageRows=[];try{imageRows=await loadPointImagesFromSupabase(sb)}catch(error){console.warn("[SNORKY Supabase READ] 사진 조회 실패, Point 데이터는 유지합니다.",error)}
  applySupabaseData(sb,regions,pointRows,imageRows);
  console.info(`[SNORKY Supabase READ] Regions loaded: ${regions.length}`);console.info(`[SNORKY Supabase READ] Points loaded: ${pointRows.length}`);console.info(`[SNORKY Supabase READ] Images loaded: ${imageRows.length}`);
  return{regions:regions.length,points:pointRows.length,images:imageRows.length};
}
async function start(){try{await loadSnorkyDataFromSupabase()}catch(error){DATA_SOURCE.active="local";console.warn("[SNORKY Supabase READ] Local fallback 사용",error)}}
function schedule(){if(window.supabase?.createClient){start();return}window.addEventListener("snorky:supabase-ready",start,{once:true})}
window.SNORKYSupabaseRead={loadSnorkyDataFromSupabase,loadRegionsFromSupabase,loadPointsFromSupabase,loadPointImagesFromSupabase,pointFromRow};
schedule();
})();
