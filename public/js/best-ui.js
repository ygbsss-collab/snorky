(function(){
"use strict";
const SEA_CONDITION_LEVELS=Object.freeze([
  Object.freeze({min:80,label:"오늘 바다 정말 좋아요!"}),
  Object.freeze({min:65,label:"오늘 바다 괜찮아요"}),
  Object.freeze({min:50,label:"오늘 바다는 좀 아쉬워요"}),
  Object.freeze({min:35,label:"오늘 바다는 많이 아쉬워요"}),
  Object.freeze({min:0,label:"오늘은 바다 쉬어가요"})
]);
function getSnorkySeaConditionLabel(score){
  const value=Number(score);
  if(!Number.isFinite(value))return"바다 상태를 확인할 수 없어요";
  return SEA_CONDITION_LEVELS.find(level=>value>=level.min)?.label||SEA_CONDITION_LEVELS.at(-1).label;
}
window.SNORKYBestUI=Object.freeze({SEA_CONDITION_LEVELS,getSnorkySeaConditionLabel});
window.getSnorkySeaConditionLabel=getSnorkySeaConditionLabel;
})();
