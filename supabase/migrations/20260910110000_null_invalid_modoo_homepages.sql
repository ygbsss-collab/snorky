begin;

update public.indoor_diving_centers
set homepage = null
where name = '씨네블루 파주 잠수풀'
  and homepage like '%modoo.at%';

update public.indoor_diving_centers
set homepage = null
where name = '뉴서울다이빙풀'
  and homepage like '%modoo.at%';

update public.indoor_diving_centers
set homepage = null
where name = '대부잠수풀'
  and homepage like '%modoo.at%';

update public.indoor_diving_centers
set homepage = null
where name = '서브마린다이빙풀'
  and homepage like '%modoo.at%';

update public.indoor_diving_centers
set homepage = null
where name = '수원 스킨스쿠버 다이빙풀'
  and homepage like '%modoo.at%';

update public.indoor_diving_centers
set homepage = null
where name = '메르다이빙센터 일산점'
  and homepage like '%modoo.at%';

update public.indoor_diving_centers
set homepage = null
where name = '포프라자'
  and homepage like '%modoo.at%';

update public.indoor_diving_centers
set homepage = null
where name = '수작코리아 수중촬영장'
  and homepage like '%modoo.at%';

update public.indoor_diving_centers
set homepage = null
where name = '알프스다이빙'
  and homepage like '%modoo.at%';

update public.indoor_diving_centers
set homepage = null
where name = '패스나인 다이빙센터'
  and homepage like '%modoo.at%';

update public.indoor_diving_centers
set homepage = null
where name = '풀식스다이빙풀'
  and homepage like '%modoo.at%';

update public.indoor_diving_centers
set homepage = null
where name = '전북잠수전문학교 익산점'
  and homepage like '%modoo.at%';

update public.indoor_diving_centers
set homepage = null
where name = '군산오션팔레트 잠수풀'
  and homepage like '%modoo.at%';

update public.indoor_diving_centers
set homepage = null
where name = '다이브자이언트 제주교육센터'
  and homepage like '%modoo.at%';

commit;
