export type KhoaXmlResult={status:number;contentType:string|null;body:string;bytes:number;resultCode:string|null;resultMsg:string|null;items:Record<string,string>[];fetchedAt:string};

const text=(xml:string,tag:string)=>xml.match(new RegExp(`<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`,`i`))?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").trim()||null;
const items=(xml:string)=>[...xml.matchAll(/<(?:[\w.-]+:)?item(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?item>/gi)].map(match=>Object.fromEntries([...match[1].matchAll(/<(?:[\w.-]+:)?([\w.-]+)(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?\1>/gi)].map(field=>[field[1],field[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").trim()])));

export async function fetchKhoaXml(endpoint:string,params:Record<string,string>,timeoutMs=12000):Promise<KhoaXmlResult>{
  const apiKey=Deno.env.get("KHOA_API_KEY");
  if(!apiKey)throw Object.assign(new Error("KHOA server configuration unavailable"),{code:"KHOA_SECRET_MISSING"});
  const url=new URL(endpoint);for(const[key,value]of Object.entries({...params,serviceKey:apiKey}))url.searchParams.set(key,value);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs),started=new Date().toISOString();
  try{
    // One request only. Callers deliberately do not retry.
    const response=await fetch(url,{signal:controller.signal,headers:{Accept:"application/xml,text/xml,*/*"}}),body=await response.text(),code=text(body,"resultCode")||text(body,"returnReasonCode"),message=text(body,"resultMsg")||text(body,"returnAuthMsg")||text(body,"errMsg");
    if(response.status===429)throw Object.assign(new Error("KHOA rate limited"),{code:"KHOA_429",status:429});
    if(!response.ok)throw Object.assign(new Error(`KHOA HTTP ${response.status}`),{code:"KHOA_HTTP",status:response.status});
    if(code&&!['00','0','NORMAL_SERVICE','INFO-000'].includes(code))throw Object.assign(new Error(message||`KHOA result ${code}`),{code:"KHOA_RESULT",resultCode:code});
    return{status:response.status,contentType:response.headers.get("content-type"),body,bytes:new TextEncoder().encode(body).byteLength,resultCode:code,resultMsg:message,items:items(body),fetchedAt:started};
  }catch(error){if(error instanceof Error&&error.name==="AbortError")throw Object.assign(new Error("KHOA timeout"),{code:"KHOA_TIMEOUT"});throw error}finally{clearTimeout(timer)}
}

export const khoaField=(item:Record<string,string>,...names:string[])=>{for(const name of names)if(item[name]!==undefined&&item[name]!=="")return item[name];return null};
export const finite=(value:unknown)=>value===null||value===undefined||value===""?null:Number.isFinite(Number(value))?Number(value):null;
export function kstInstant(dateValue:string|null,timeValue:string|null){
  const date=String(dateValue||"").replace(/\D/g,"").slice(0,8),time=String(timeValue||"000000").replace(/\D/g,"").padEnd(6,"0").slice(0,6);
  if(!/^\d{8}$/.test(date))return null;const value=new Date(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${time.slice(0,2)}:${time.slice(2,4)}:${time.slice(4,6)}+09:00`);return Number.isNaN(value.valueOf())?null:value.toISOString();
}
