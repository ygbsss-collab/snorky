begin;

update public.indoor_diving_centers
set address = '경기 고양시 일산동구 애니골길 97'
where name = '메르다이빙센터';

update public.indoor_diving_centers
set address = '강원특별자치도 강릉시 주문진읍 연주로 272'
where name = '강릉북부수영장 잠수풀';

update public.indoor_diving_centers
set address = '경기 화성시 효행구 봉담읍 하가등안길 100'
where name = '화성그린환경센터';

update public.indoor_diving_centers
set address = '충남 아산시 실옥로 234'
where name = '아산 배미수영장 다이빙풀';

update public.indoor_diving_centers
set address = '전북 군산시 옥도면 무녀도3길 45-64'
where name = '군산 오션팔레트 잠수풀';

update public.indoor_diving_centers
set address = '제주 제주시 한경면 일주서로 4408'
where name = '다이브자이언트 제주교육센터';

update public.indoor_diving_centers
set address = '전북 익산시 금마면 미륵사지로4길 30'
where name = '전북잠수전문학교 익산점';

commit;
