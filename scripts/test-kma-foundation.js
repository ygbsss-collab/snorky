"use strict";

const assert=require("node:assert/strict");
const {toKmaGrid,buildKmaGridRegistry}=require("../api/_lib/kma-grid");
const weather=require("../api/_lib/kma-weather");
const {calculateSunTimes}=require("../api/_lib/sun-times");

const sampleItems=[
  {fcstDate:"20260816",fcstTime:"1500",category:"TMP",fcstValue:"27"},
  {fcstDate:"20260816",fcstTime:"1500",category:"WSD",fcstValue:"3.1"},
  {fcstDate:"20260816",fcstTime:"1500",category:"VEC",fcstValue:"90"},
  {fcstDate:"20260816",fcstTime:"1500",category:"PCP",fcstValue:"강수없음"},
  {fcstDate:"20260816",fcstTime:"1500",category:"POP",fcstValue:"10"},
  {fcstDate:"20260816",fcstTime:"1500",category:"SKY",fcstValue:"1"},
  {fcstDate:"20260816",fcstTime:"1500",category:"PTY",fcstValue:"0"},
  {fcstDate:"20260816",fcstTime:"1500",category:"TMX",fcstValue:"29"},
  {fcstDate:"20260816",fcstTime:"1500",category:"TMN",fcstValue:"22"}
];
const payload=JSON.stringify({response:{header:{resultCode:"00",resultMsg:"NORMAL_SERVICE"},body:{items:{item:sampleItems}}}});
function fakeResponse(){return{ok:true,status:200,text:async()=>payload}}

async function main(){
  process.env.KMA_API_KEY="test-only-not-logged";weather.resetRuntimeState();
  assert.deepEqual(toKmaGrid(38.373191067146,128.509633744093),{nx:86,ny:145});
  const registry=buildKmaGridRegistry([{id:1,name:"A",lat:38.373191067146,lng:128.509633744093},{id:2,name:"B",lat:38.3732,lng:128.5096}]);
  assert.equal(registry.uniqueGridCount,1);
  const persistentRows=new Map(),adapter={async get(key){if(persistentRows.has(key))return persistentRows.get(key);if(key.endsWith(":last-known-good")){const prefix=key.replace(":last-known-good",":");return[...persistentRows].filter(([stored])=>stored.startsWith(prefix)).at(-1)?.[1]||null}return null},async set(key,value){if(!key.endsWith(":latest-base"))persistentRows.set(key,value)}};weather.setCacheAdapter(adapter);
  let calls=0;const fetchImpl=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,10));return fakeResponse()};
  const base={baseDate:"20260816",baseTime:"1100"};
  const [first,second]=await Promise.all([weather.getKmaForecast(86,145,base.baseDate,base.baseTime,{fetchImpl}),weather.getKmaForecast(86,145,base.baseDate,base.baseTime,{fetchImpl})]);
  assert.equal(calls,1);assert.equal(first.hourly.length,1);assert.equal(second.hourly.length,1);assert.equal(weather.getTrafficStats().inFlightReuse,1);
  await weather.getKmaForecast(86,145,base.baseDate,base.baseTime,{fetchImpl});assert.equal(calls,1);assert.equal(weather.getTrafficStats().cacheHit,1);
  weather.resetRuntimeState();await weather.getKmaForecast(86,145,base.baseDate,base.baseTime,{fetchImpl});assert.equal(calls,1);
  weather.resetRuntimeState();calls=0;const now=new Date("2026-08-16T05:00:00Z"),oneGrid={totalActivePoints:2,validCoordinatePoints:2,invalidCoordinatePoints:0,uniqueGridCount:1,grids:registry.grids,invalidPoints:[]};
  const refreshed=await weather.refreshKmaForecastCache({registry:oneGrid,now,fetchImpl}),unchanged=await weather.refreshKmaForecastCache({registry:oneGrid,now,fetchImpl});
  assert.equal(refreshed.apiCalls,1);assert.equal(unchanged.apiCalls,0);assert.equal(calls,1);
  const sun=calculateSunTimes({latitude:38.373191067146,longitude:128.509633744093,date:"2026-08-16",timezone:"Asia/Seoul"});assert.match(sun.sunrise,/T\d{2}:\d{2}:00\+09:00$/);assert.match(sun.sunset,/T\d{2}:\d{2}:00\+09:00$/);
  console.log(JSON.stringify({grid:{nx:86,ny:145},singleFlightActualCalls:1,cacheHit:true,sameBaseApiCalls:unchanged.apiCalls,sunrise:sun.sunrise,sunset:sun.sunset,traffic:weather.getTrafficStats()},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1});
