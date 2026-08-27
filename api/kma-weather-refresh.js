"use strict";

const {randomUUID}=require("node:crypto");
const {refreshKmaForecastCache,getTrafficStats,setCacheAdapter}=require("./_lib/kma-weather");
const {createSupabaseKmaCache}=require("./_lib/supabase-kma-cache");
const {loadActiveSnorkyPoints}=require("./_lib/snorky-points");

function authorized(req){
  const secret=process.env.KMA_REFRESH_SECRET;if(!secret)return false;
  const supplied=req.headers?.authorization?.replace(/^Bearer\s+/i,"")||req.headers?.["x-kma-refresh-secret"];
  return supplied===secret;
}
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({status:"ERROR",message:"Method Not Allowed"})}
  if(!authorized(req))return res.status(401).json({status:"ERROR",message:"Unauthorized"});
  let cache,ownerToken,locked=false;
  try{
    cache=createSupabaseKmaCache();setCacheAdapter(cache);ownerToken=randomUUID();
    locked=await cache.acquireRefreshLock(ownerToken,Number(process.env.KMA_REFRESH_LOCK_TTL_SECONDS)||600);
    if(!locked)return res.status(202).json({status:"LOCKED",message:"KMA refresh is already running",traffic:getTrafficStats()});
    const points=await loadActiveSnorkyPoints(),result=await refreshKmaForecastCache({points});
    return res.status(200).json({status:"READY",refresh:{status:result.status,base:result.base,totalActivePoints:result.totalActivePoints,validCoordinatePoints:result.validCoordinatePoints,uniqueGridCount:result.uniqueGridCount,apiCalls:result.apiCalls,success:result.success,failed:result.failed,failures:result.failures||[]},traffic:getTrafficStats()});
  }catch(error){
    console.error("[KMA WEATHER REFRESH]",{code:error?.code||"UNKNOWN",status:error?.status??null,message:error?.message});
    return res.status(502).json({status:"ERROR",code:error?.code||"UNKNOWN",message:"KMA weather refresh failed",traffic:getTrafficStats()});
  }finally{if(locked&&cache&&ownerToken){try{await cache.releaseRefreshLock(ownerToken)}catch(error){console.error("[KMA WEATHER LOCK RELEASE]",{code:error?.code||"UNKNOWN",status:error?.status??null})}}}
};

module.exports._test={authorized};
