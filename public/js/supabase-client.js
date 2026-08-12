(function(){
"use strict";
window.SNORKY_SUPABASE_CONFIG={
  url:"https://vqpkckonpsnzhuwuybav.supabase.co",
  publishableKey:"sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT"
};
let sharedClient=null;
window.getSnorkySupabase=function(){
  const config=window.SNORKY_SUPABASE_CONFIG;
  if(!/^https:\/\/.+\.supabase\.co\/?$/i.test(config?.url||"")||!/^sb_publishable_/.test(config?.publishableKey||""))throw new Error("SNORKY Supabase 설정을 확인해 주세요.");
  if(!window.supabase?.createClient)throw new Error("Supabase JS Client를 불러오지 못했습니다.");
  if(!sharedClient)sharedClient=window.supabase.createClient(config.url,config.publishableKey);
  window.snorkySupabase=sharedClient;
  return sharedClient;
};
})();
