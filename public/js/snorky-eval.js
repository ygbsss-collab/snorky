(function(){
  "use strict";
  function getSnorkyConditionStatus(pointOrScore,safety){
    let score=pointOrScore,status=safety;
    if(pointOrScore&&typeof pointOrScore==="object"){
      const v12=pointOrScore.v12||pointOrScore;
      status=status||v12.safety||pointOrScore.kma||pointOrScore.safety;
      score=v12.conditionScore??pointOrScore.score;
    }
    if(status==="BLOCK")return "입수 비추천";
    if(status==="UNKNOWN")return "안전정보 확인 필요";
    const value=Number(score);
    if(!Number.isFinite(value))return "확인 필요";
    if(value>=80)return "좋음";
    if(value>=65)return "보통";
    if(value>=50)return "주의";
    return "주의 필요";
  }
  function getSnorkyConditionStatusInfo(pointOrScore,safety){
    const status=getSnorkyConditionStatus(pointOrScore,safety),info={status,color:"#64748b",dot:"⚪"};
    if(status==="좋음")Object.assign(info,{color:"#10b981",dot:"🟢"});
    else if(status==="보통")Object.assign(info,{color:"#3b82f6",dot:"🔵"});
    else if(status==="주의")Object.assign(info,{color:"#f59e0b",dot:"🟡"});
    else if(status==="나쁨")Object.assign(info,{color:"#f97316",dot:"🟠"});
    else if(status==="입수 비추천")Object.assign(info,{color:"#ef4444",dot:"🔴"});
    return info;
  }
  function rankSnorkyBestPoints(points,options={}){
    if(!Array.isArray(points))return [];
    let candidates=points;
    if(options.userCoords&&Number.isFinite(Number(options.radius))){
      const radius=Number(options.radius);
      candidates=candidates.filter(point=>{
        const distance=Number.isFinite(point.distance)?point.distance:((point.lat!=null&&point.lng!=null&&typeof window!=="undefined"&&window.SNORKYNearbyBest?.haversineKm)?window.SNORKYNearbyBest.haversineKm(options.userCoords.latitude,options.userCoords.longitude,Number(point.lat),Number(point.lng)):Infinity);
        return distance<=radius;
      });
    }
    if(options.region)candidates=candidates.filter(point=>point.region===options.region||point.regionId===options.region||String(point.region||"").includes(options.region));
    const eligible=candidates.filter(point=>{const result=point?.v12,score=Number(result?.conditionScore);return (result?.safety||point?.kma)==="PASS"&&Number.isFinite(score)&&score>=50});
    eligible.sort((a,b)=>{
      const scoreDiff=Number(b.v12?.conditionScore)-Number(a.v12?.conditionScore);
      if(scoreDiff)return scoreDiff;
      if(Number.isFinite(a.distance)&&Number.isFinite(b.distance)&&a.distance!==b.distance)return a.distance-b.distance;
      return String(a.region||"").localeCompare(String(b.region||""),"ko-KR")||String(a.name||"").localeCompare(String(b.name||""),"ko-KR")||String(a.id||a.supabaseId||"").localeCompare(String(b.id||b.supabaseId||""));
    });
    const limit=Number.isFinite(Number(options.limit))?Number(options.limit):10;
    return eligible.slice(0,limit).map((point,index)=>({...point,rank:index+1}));
  }
  const getConditionStatus=getSnorkyConditionStatus,getConditionStatusInfo=getSnorkyConditionStatusInfo,rankBestPoints=rankSnorkyBestPoints;
  const api=Object.freeze({getSnorkyConditionStatus,getSnorkyConditionStatusInfo,rankSnorkyBestPoints,getConditionStatus,getConditionStatusInfo,rankBestPoints});
  if(typeof window!=="undefined"){
    window.SNORKYEval=api;
    window.getSnorkyConditionStatus=getSnorkyConditionStatus;
    window.getSnorkyConditionStatusInfo=getSnorkyConditionStatusInfo;
    window.rankSnorkyBestPoints=rankSnorkyBestPoints;
  }
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})();
