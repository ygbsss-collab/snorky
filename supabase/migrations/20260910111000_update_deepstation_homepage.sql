begin;

update public.indoor_diving_centers
set homepage = 'https://deepstation.kr/'
where name = '딥스테이션'
  and homepage = 'https://deepstation.co.kr/';

commit;
