"use strict";

const cache=new Map();
const rad=value=>value*Math.PI/180;

function dayOfYear(dateString){
  const [year,month,day]=dateString.split("-").map(Number);
  return Math.floor((Date.UTC(year,month-1,day)-Date.UTC(year,0,0))/86400000);
}
function clock(minutes){
  const normalized=(Math.round(minutes)%1440+1440)%1440,hour=Math.floor(normalized/60),minute=normalized%60;
  return`${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
}

// NOAA solar equations, using the standard 90.833-degree apparent horizon.
function calculateSunTimes({latitude,longitude,date,timezone="Asia/Seoul"}){
  if(timezone!=="Asia/Seoul")throw new RangeError("The KMA foundation currently supports Asia/Seoul only");
  const lat=Number(latitude),lon=Number(longitude),dateString=String(date);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||!/^\d{4}-\d{2}-\d{2}$/.test(dateString))throw new TypeError("Valid latitude, longitude and YYYY-MM-DD date are required");
  const key=`${lat.toFixed(6)}:${lon.toFixed(6)}:${dateString}:${timezone}`;
  if(cache.has(key))return{...cache.get(key),cacheHit:true};
  const gamma=2*Math.PI/365*(dayOfYear(dateString)-1),eqtime=229.18*(.000075+.001868*Math.cos(gamma)-.032077*Math.sin(gamma)-.014615*Math.cos(2*gamma)-.040849*Math.sin(2*gamma));
  const decl=.006918-.399912*Math.cos(gamma)+.070257*Math.sin(gamma)-.006758*Math.cos(2*gamma)+.000907*Math.sin(2*gamma)-.002697*Math.cos(3*gamma)+.00148*Math.sin(3*gamma);
  const cosine=(Math.cos(rad(90.833))/(Math.cos(rad(lat))*Math.cos(decl)))-Math.tan(rad(lat))*Math.tan(decl);
  if(cosine>1||cosine< -1)return{sunrise:null,sunset:null,timezone,cacheHit:false};
  const hourAngle=Math.acos(cosine)*180/Math.PI,solarNoon=720-4*lon-eqtime+540;
  const sunriseTime=clock(solarNoon-4*hourAngle),sunsetTime=clock(solarNoon+4*hourAngle);
  const result={sunrise:`${dateString}T${sunriseTime}:00+09:00`,sunset:`${dateString}T${sunsetTime}:00+09:00`,sunriseTime,sunsetTime,timezone,method:"NOAA-solar-equations"};
  cache.set(key,result);return{...result,cacheHit:false};
}

module.exports={calculateSunTimes,_sunCache:cache};
