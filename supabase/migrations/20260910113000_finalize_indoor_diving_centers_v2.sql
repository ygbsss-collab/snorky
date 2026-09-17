begin;

delete from public.indoor_diving_centers
where name in (
  '포프라자',
  '수작코리아 수중촬영장',
  'KUA 잠실다이빙풀장',
  '웨이브파크 블루홀라군',
  '강릉국민체육센터',
  '씨네블루 파주 잠수풀'
);

update public.indoor_diving_centers
set homepage = 'http://www.deepstation.kr'
where name = '딥스테이션';

update public.indoor_diving_centers
set name = 'K-26 실전잠수풀', homepage = 'https://k-26.com/'
where name = 'K26 잠수풀';

update public.indoor_diving_centers
set homepage = 'https://www.paradive.co.kr/'
where name = '파라다이브35';

update public.indoor_diving_centers
set homepage = 'http://www.scubapool.com/page/sub02.php#2'
where name = '뉴서울다이빙풀';

update public.indoor_diving_centers
set name = '메르다이빙센터', homepage = 'https://merdive.co.kr/'
where name = '메르다이빙센터 일산점';

update public.indoor_diving_centers
set phone = '070-8818-8888', homepage = null
where name = '아르피아 잠수풀';

update public.indoor_diving_centers
set name = '성남종합스포츠센터 다이빙풀'
where name = '아쿠아라인 다목적풀';

update public.indoor_diving_centers
set name = '충북학생수영장 다이빙장', homepage = 'https://www.cbstc.go.kr/pool/main.php'
where name = '충북학생수영장';

update public.indoor_diving_centers
set name = '강릉북부수영장 잠수풀', homepage = 'https://gtdc.or.kr/pub/SportsNorth.do'
where name = '강릉 북부수영장';

update public.indoor_diving_centers
set name = '울진 올덴 K-10 잠수풀',
    region = '경북',
    sub_region = '울진군',
    max_depth = 10,
    homepage = 'http://olden-resort.com/document/diving'
where name = '올덴K10잠수풀';

update public.indoor_diving_centers
set name = '패스나인'
where name = '패스나인 다이빙센터';

update public.indoor_diving_centers
set name = '부산 북항 마리나 다이빙풀',
    max_depth = 24,
    homepage = 'https://marina.busanpa.com/'
where name = '북항마리나 다이빙풀';

update public.indoor_diving_centers
set homepage = null
where name = '밀양 아리랑 잠수풀';

update public.indoor_diving_centers
set name = '풀식스 다이빙풀', max_depth = 6
where name = '풀식스다이빙풀';

update public.indoor_diving_centers
set name = '염주 다이빙풀장'
where name = '염주체육관 다이빙풀';

update public.indoor_diving_centers
set name = '여수시청소년해양교육원 다이빙풀장',
    homepage = 'https://book.ysse.kr/'
where name = '여수시청소년해양교육원 잠수풀';

update public.indoor_diving_centers
set name = '군산 오션팔레트 잠수풀', homepage = 'https://www.oceanpalette.kr/'
where name = '군산오션팔레트 잠수풀';

update public.indoor_diving_centers
set name = '수원 월드컵다이빙풀', homepage = 'https://www.worldcupdivingpool.com/'
where name = '수원 월드컵경기장 다이빙풀';

update public.indoor_diving_centers
set name = '아산 배미수영장 다이빙풀'
where name = '아산 실내스킨스쿠버 다이빙풀 (배미수영장)';

update public.indoor_diving_centers
set buddy_condition = '버디 필수',
    entry_condition = '프리다이빙 오픈워터 이상',
    reservation_info = '전화 예약',
    price_full = '3시간 / 1인 12,000원',
    phone = '010-8926-1382'
where name = '화성그린환경센터';

update public.indoor_diving_centers
set name = '두류수영장 다이빙풀',
    homepage = 'https://duryuswim.dpfc.or.kr/',
    region = '대구',
    sub_region = '달서구',
    max_depth = 5
where id = 'daegu_duryu';

update public.indoor_diving_centers
set name = '용운국제수영장 다이빙풀',
    region = '대전',
    sub_region = '동구',
    max_depth = 5
where id = 'daejeon_yongun';

update public.indoor_diving_centers
set name = '남부대학교 시립국제수영장',
    region = '광주',
    sub_region = '광산구',
    max_depth = 5
where id = 'gwangju_nambu_univ';

commit;
