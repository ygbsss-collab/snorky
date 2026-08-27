const KMA_ENDPOINT="https://apihub.kma.go.kr/api/typ01/url/wrn_now_data.php";

function toWarningName(wrn){
  const w=String(wrn||"").trim();
  if(w==="V"||w==="풍랑")return "풍랑";
  if(w==="W"||w==="강풍")return "강풍";
  if(w==="T"||w==="태풍")return "태풍";
  if(w==="O"||w==="폭풍해일")return "폭풍해일";
  if(w==="N"||w==="지진해일")return "지진해일";
  return null;
}

function toLevelName(lvl){
  const l=String(lvl||"").trim();
  if(l==="3"||l==="경보")return "경보";
  if(l==="2"||l==="주의보"||l==="주의")return "주의보";
  if(l==="1"||l==="예비특보")return "예비특보";
  return l;
}

function isReleaseCommand(cmd){
  const c=String(cmd||"").trim();
  return c==="3"||c==="4"||c==="7"||c==="해제"||c==="대치해제"||c==="변경해제";
}

function toCommandName(cmd){
  const c=String(cmd||"").trim();
  const map={1:"발표",2:"대치",3:"해제",4:"대치해제",5:"연장",6:"변경",7:"변경해제"};
  return map[c]||c;
}

function kstTimestamp(date=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
  const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));return`${value.year}${value.month}${value.day}${value.hour}${value.minute}`;
}
function csvFields(line){
  const fields=[];let value="",quoted=false;
  for(let index=0;index<line.length;index++){const char=line[index];if(char==='"'){if(quoted&&line[index+1]==='"'){value+='"';index++}else quoted=!quoted}else if(char===","&&!quoted){fields.push(value.trim());value=""}else value+=char}
  fields.push(value.trim());return fields;
}
function parseRows(text){
  if(!text||/^\s*\{/.test(text)){let payload;try{payload=JSON.parse(text)}catch{}throw new Error(payload?.result?.message||"KMA 응답 형식 오류")}
  const rows=[];
  for(const raw of text.split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith("#"))continue;const fields=csvFields(line);if(fields.length<9)continue;
    const [regUp,regUpKo,regId,regKo,tmFc,tmEf,wrn,lvl,cmd]=fields;
    if(!/^S\d{7}$/.test(regId||"")||!/^\d{12}$/.test(tmFc||""))continue;
    rows.push({regUp,regUpKo,regId,regKo,tmFc,tmEf,wrn,lvl,cmd});
  }
  return rows;
}
function latestWarnings(rows){
  const latest=new Map();
  for(const row of rows){
    const warningName=toWarningName(row.wrn);
    if(!warningName)continue;
    const key=`${row.regId}:${warningName}`,previous=latest.get(key);
    if(!previous||`${row.tmFc}:${row.tmEf}`>=`${previous.tmFc}:${previous.tmEf}`)latest.set(key,{...row,warningName});
  }
  return[...latest.values()].map(row=>{
    const levelName=toLevelName(row.lvl);
    const active=!isReleaseCommand(row.cmd)&&(levelName==="주의보"||levelName==="경보");
    return {
      ...row,
      areaName:row.regKo||row.regUpKo,
      warningName:row.warningName,
      levelName,
      commandName:toCommandName(row.cmd),
      active
    };
  });
}
module.exports=async function handler(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({status:"UNKNOWN",message:"Method Not Allowed"})}
  const key=process.env.KMA_API_KEY;
  if(!key)return res.status(503).json({status:"UNKNOWN",message:"KMA 인증 설정을 확인할 수 없습니다."});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try{
    const url=new URL(KMA_ENDPOINT);url.searchParams.set("fe","f");url.searchParams.set("tm",kstTimestamp());url.searchParams.set("disp","0");url.searchParams.set("help","1");url.searchParams.set("authKey",key);
    const response=await fetch(url,{signal:controller.signal,headers:{Accept:"text/plain, application/json"}}),text=await response.text();
    if(!response.ok)throw new Error(`KMA HTTP ${response.status}`);
    const rows=parseRows(text),warnings=latestWarnings(rows);
    res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=120");return res.status(200).json({status:"READY",updatedAt:new Date().toISOString(),rowCount:rows.length,warnings});
  }catch(error){return res.status(502).json({status:"UNKNOWN",message:error?.name==="AbortError"?"KMA 조회 시간이 초과되었습니다.":"KMA 현재특보를 확인할 수 없습니다."})}finally{clearTimeout(timer)}
};

module.exports._test={csvFields,parseRows,latestWarnings,kstTimestamp,toWarningName,toLevelName,isReleaseCommand};
