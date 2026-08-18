const cache=new Map<string,SunTimes>();
type SunTimes={sunrise:string|null;sunset:string|null;sunriseTime?:string;sunsetTime?:string;timezone:string;method?:string};
const rad=(value:number)=>value*Math.PI/180;
const dayOfYear=(date:string)=>{const[y,m,d]=date.split("-").map(Number);return Math.floor((Date.UTC(y,m-1,d)-Date.UTC(y,0,0))/86400000)};
const clock=(minutes:number)=>{const value=(Math.round(minutes)%1440+1440)%1440;return`${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`};

// NOAA solar equations with the standard 90.833-degree apparent horizon.
export function calculateSunTimes({latitude,longitude,date,timezone="Asia/Seoul"}:{latitude:number;longitude:number;date:string;timezone?:string}){
  if(timezone!=="Asia/Seoul")throw new RangeError("Only Asia/Seoul is supported");
  const key=`${latitude.toFixed(6)}:${longitude.toFixed(6)}:${date}:${timezone}`;if(cache.has(key))return{...cache.get(key)!,cacheHit:true};
  const gamma=2*Math.PI/365*(dayOfYear(date)-1),eqtime=229.18*(.000075+.001868*Math.cos(gamma)-.032077*Math.sin(gamma)-.014615*Math.cos(2*gamma)-.040849*Math.sin(2*gamma));
  const decl=.006918-.399912*Math.cos(gamma)+.070257*Math.sin(gamma)-.006758*Math.cos(2*gamma)+.000907*Math.sin(2*gamma)-.002697*Math.cos(3*gamma)+.00148*Math.sin(3*gamma);
  const cosine=Math.cos(rad(90.833))/(Math.cos(rad(latitude))*Math.cos(decl))-Math.tan(rad(latitude))*Math.tan(decl);
  if(cosine>1||cosine< -1)return{sunrise:null,sunset:null,timezone,cacheHit:false};
  const hourAngle=Math.acos(cosine)*180/Math.PI,noon=720-4*longitude-eqtime+540,sunriseTime=clock(noon-4*hourAngle),sunsetTime=clock(noon+4*hourAngle);
  const result:SunTimes={sunrise:`${date}T${sunriseTime}:00+09:00`,sunset:`${date}T${sunsetTime}:00+09:00`,sunriseTime,sunsetTime,timezone,method:"NOAA-solar-equations"};cache.set(key,result);return{...result,cacheHit:false};
}
