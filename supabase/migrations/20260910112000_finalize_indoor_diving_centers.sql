begin;

delete from public.indoor_diving_centers
where name in (
  '포프라자',
  '수작코리아 수중촬영장',
  'KUA 잠실다이빙풀장',
  '웨이브파크 블루홀라군',
  '아르피아 잠수풀',
  '강릉국민체육센터'
);

update public.indoor_diving_centers
set name = '스포츠아일랜드 다이빙풀 (수원월드컵경기장)'
where name = '수원 월드컵경기장 다이빙풀';

update public.indoor_diving_centers
set name = '아산 배미수영장 다이빙풀'
where name = '아산 실내스킨스쿠버 다이빙풀 (배미수영장)';

update public.indoor_diving_centers
set name = '가평 올덴 잠수풀 (올덴 K-10)'
where name = '올덴K10잠수풀';

update public.indoor_diving_centers
set name = '성남종합스포츠센터 다이빙풀'
where name = '아쿠아라인 다목적풀';

insert into public.indoor_diving_centers (
  id,
  name,
  region,
  sub_region,
  address,
  max_depth,
  homepage,
  operation_status,
  status
)
values
  (
    'daegu_duryu',
    '대구 두류수영장 다이빙풀',
    '대구',
    '달서구',
    '대구광역시 달서구 공원순환로 237 (두류수영장)',
    5,
    'https://www.dpfc.or.kr/',
    'OPERATIONAL',
    '운영중'
  ),
  (
    'daejeon_yongun',
    '대전 용운국제수영장 다이빙풀',
    '대전',
    '동구',
    '대전광역시 동구 동부로 138 (용운동)',
    5,
    'https://www.djsiseol.or.kr/',
    'OPERATIONAL',
    '운영중'
  ),
  (
    'gwangju_nambu_univ',
    '광주 남부대시립국제수영장 다이빙풀',
    '광주',
    '광산구',
    '광주광역시 광산구 남부대길 25 (월계동)',
    5,
    'https://worldswimming.nambu.ac.kr/',
    'OPERATIONAL',
    '운영중'
  );

commit;
