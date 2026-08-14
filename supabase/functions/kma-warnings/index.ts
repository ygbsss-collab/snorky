const KMA_ENDPOINT="https://apihub.kma.go.kr/api/typ01/url/wrn_now_data.php";
const TARGET_WARNING_CODES=new Set(["V","T","O","N"]);
const RELEASE_COMMANDS=new Set(["3","4","7"]);
const WARNING_NAMES:Record<string,string>={V:"풍랑",T:"태풍",O:"폭풍해일",N:"지진해일"};
const LEVEL_NAMES:Record<string,string>={1:"예비특보",2:"주의보",3:"경보"};
const COMMAND_NAMES:Record<string,string>={1:"발표",2:"대치",3:"해제",4:"대치해제",5:"연장",6:"변경",7:"변경해제"};
const CORS_HEADERS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
  "Content-Type":"application/json; charset=utf-8"
};

type WarningRow={regUp:string;regUpKo:string;regId:string;regKo:string;tmFc:string;tmEf:string;wrn:string;lvl:string;cmd:string};
type ActiveWarning=WarningRow&{areaName:string;warningName:string;levelName:string;commandName:string;active:boolean};

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:CORS_HEADERS})}
function kstTimestamp(date=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
  const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));return`${value.year}${value.month}${value.day}${value.hour}${value.minute}`;
}
function csvFields(line:string){
  const fields:string[]=[];let value="",quoted=false;
  for(let index=0;index<line.length;index++){const char=line[index];if(char==='"'){if(quoted&&line[index+1]==='"'){value+='"';index++}else quoted=!quoted}else if(char===","&&!quoted){fields.push(value.trim());value=""}else value+=char}
  fields.push(value.trim());return fields;
}
function parseRows(text:string){
  if(!text||/^\s*\{/.test(text)){let payload;try{payload=JSON.parse(text)}catch{}throw new Error(payload?.result?.message||"KMA 응답 형식 오류")}
  const rows:WarningRow[]=[];
  for(const raw of text.split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith("#"))continue;const fields=csvFields(line);if(fields.length<9)continue;
    const [regUp,regUpKo,regId,regKo,tmFc,tmEf,wrn,lvl,cmd]=fields;
    if(!/^S\d{7}$/.test(regId||"")||!/^\d{12}$/.test(tmFc||""))continue;
    rows.push({regUp,regUpKo,regId,regKo,tmFc,tmEf,wrn,lvl,cmd});
  }
  return rows;
}
function latestWarnings(rows:WarningRow[]){
  const latest=new Map<string,WarningRow>();
  for(const row of rows){if(!TARGET_WARNING_CODES.has(row.wrn))continue;const key=`${row.regId}:${row.wrn}`,previous=latest.get(key);if(!previous||`${row.tmFc}:${row.tmEf}`>=`${previous.tmFc}:${previous.tmEf}`)latest.set(key,row)}
  return[...latest.values()].map<ActiveWarning>(row=>({...row,areaName:row.regKo||row.regUpKo,warningName:WARNING_NAMES[row.wrn],levelName:LEVEL_NAMES[row.lvl]||row.lvl,commandName:COMMAND_NAMES[row.cmd]||row.cmd,active:!RELEASE_COMMANDS.has(row.cmd)&&(row.lvl==="2"||row.lvl==="3")}));
}
function warningIndex(warnings:ActiveWarning[]){
  const index:Record<string,ActiveWarning[]>=Object.create(null);

  for(const warning of warnings){
    if(!warning.active)continue;

    const codes=[...new Set(
      [warning.regId,warning.regUp]
        .filter(code=>/^S\d{7}$/.test(code||""))
    )];

    for(const code of codes){
      (index[code]??=[]).push(warning);
    }
  }

  return index;
}

Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS_HEADERS});
  if(request.method!=="GET"&&request.method!=="POST")return json({status:"UNKNOWN",message:"Method Not Allowed"},405);
  const key=Deno.env.get("KMA_API_KEY");
  if(!key)return json({status:"UNKNOWN",upstreamStatus:null,message:"KMA 인증 설정을 확인할 수 없습니다.",warnings:[],warningIndex:{}});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const url=new URL(KMA_ENDPOINT);url.searchParams.set("fe","f");url.searchParams.set("tm",kstTimestamp());url.searchParams.set("disp","0");url.searchParams.set("help","1");url.searchParams.set("authKey",key);
    const response=await fetch(url,{signal:controller.signal,headers:{Accept:"text/plain, application/json"}}),text=await response.text();
    if(!response.ok)return json({status:"UNKNOWN",upstreamStatus:response.status,message:"KMA 현재특보를 확인할 수 없습니다.",warnings:[],warningIndex:{}});
    const rows=parseRows(text),warnings=latestWarnings(rows);
    return json({status:"READY",upstreamStatus:response.status,updatedAt:new Date().toISOString(),rowCount:rows.length,warnings,warningIndex:warningIndex(warnings)});
  }catch(error){return json({status:"UNKNOWN",upstreamStatus:null,message:error instanceof Error&&error.name==="AbortError"?"KMA 조회 시간이 초과되었습니다.":"KMA 현재특보를 확인할 수 없습니다.",warnings:[],warningIndex:{}})}finally{clearTimeout(timer)}
});
