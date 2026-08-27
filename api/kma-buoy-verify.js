const KMA_BUOY_ENDPOINT="https://apihub.kma.go.kr/api/typ01/url/kma_buoy.php";
const FIELD_NAMES=["TM","STN","WD1","WS1","WS1_GST","WD2","WS2","WS2_GST","PA","HM","TA","TW","WH_MAX","WH_SIG","WH_AVE","WP","WO"];

function usable(value){return Number.isFinite(value)&&value>-90}
function number(value){const parsed=Number(value);return usable(parsed)?parsed:null}
function parseRows(text){
  return String(text||"").split(/\r?\n/).map(line=>line.trim()).filter(line=>/^\d{12}\s+\d+\s+/.test(line)).map(line=>{
    const values=line.split(/\s+/),row={};FIELD_NAMES.forEach((field,index)=>{row[field]=index<2?values[index]:number(values[index])});return row;
  }).filter(row=>/^\d{12}$/.test(row.TM||"")&&/^\d+$/.test(row.STN||""));
}
function preferred(row,first,second){return usable(row[first])?row[first]:usable(row[second])?row[second]:null}
function sample(row){return{stn:row.STN,time:row.TM,windDirection:preferred(row,"WD1","WD2"),windSpeed:preferred(row,"WS1","WS2"),waterTemperature:row.TW,significantWaveHeight:row.WH_SIG,wavePeriod:row.WP,waveDirection:row.WO}}

module.exports=async function handler(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({status:"ERROR",message:"Method Not Allowed"})}
  const key=process.env.KMA_API_KEY;
  if(!key)return res.status(503).json({status:"ERROR",message:"KMA 인증 설정이 없습니다."});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000),started=Date.now();
  try{
    const url=new URL(KMA_BUOY_ENDPOINT);url.searchParams.set("stn","0");url.searchParams.set("help","1");url.searchParams.set("authKey",key);
    const response=await fetch(url,{signal:controller.signal,headers:{Accept:"text/plain"}}),text=await response.text(),rows=parseRows(text),samples=rows.filter(row=>[row.WH_SIG,row.WP,row.WO,row.TW,preferred(row,"WS1","WS2"),preferred(row,"WD1","WD2")].some(usable)).slice(0,5).map(sample),times=rows.map(row=>row.TM).sort();
    const result={status:response.ok&&rows.length?"READY":"ERROR",upstreamStatus:response.status,contentType:response.headers.get("content-type"),stationCount:new Set(rows.map(row=>row.STN)).size,rowCount:rows.length,observationTime:times.at(-1)||null,elapsedMs:Date.now()-started,availability:{WH_SIG:rows.some(row=>usable(row.WH_SIG)),WP:rows.some(row=>usable(row.WP)),WO:rows.some(row=>usable(row.WO)),TW:rows.some(row=>usable(row.TW)),windSpeed:rows.some(row=>usable(preferred(row,"WS1","WS2"))),windDirection:rows.some(row=>usable(preferred(row,"WD1","WD2")))},samples};
    console.info("[KMA BUOY VERIFY]",{HTTPStatus:result.upstreamStatus,ContentType:result.contentType,stationCount:result.stationCount,observationTime:result.observationTime,samples});
    res.setHeader("Cache-Control","no-store");return res.status(response.ok?200:502).json(result);
  }catch(error){return res.status(502).json({status:"ERROR",upstreamStatus:null,message:error?.name==="AbortError"?"KMA 조회 시간이 초과되었습니다.":"KMA 부이자료를 확인하지 못했습니다."})}finally{clearTimeout(timer)}
};

module.exports._test={parseRows,preferred,sample};
