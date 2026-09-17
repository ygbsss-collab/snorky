-- 실내다이브.xlsx 최종 45개 센터 초기 데이터 반영
alter table public.indoor_diving_centers add column if not exists entry_condition text;
alter table public.indoor_diving_centers add column if not exists weekday_hours text;
alter table public.indoor_diving_centers add column if not exists weekend_hours text;
alter table public.indoor_diving_centers add column if not exists reservation_required text;

do $$
declare
  matched integer;
begin
  select count(*) into matched
  from public.indoor_diving_centers
  where name in ('송파 올림픽수영장 다이빙풀', 'KUA 잠실다이빙풀장', '딥스테이션', '파라다이브35', '송도 스포츠파크 잠수풀', 'K26 잠수풀', '테마 오산 잠수풀', '씨네블루 파주 잠수풀', '뉴서울다이빙풀', '대부잠수풀', '서브마린다이빙풀', '수원 스킨스쿠버 다이빙풀', '메르다이빙센터 일산점', '아르피아 잠수풀', '포프라자', '양주에코스포츠센터', '수작코리아 수중촬영장', '용문국민체육센터', '아쿠아라인 다목적풀', '웨이브파크 블루홀라군', '화성그린환경센터', '알프스다이빙', '충북학생수영장', '강릉 북부수영장', '강릉국민체육센터', '올덴K10잠수풀', '패스나인 다이빙센터', '울진해양레포츠센터', '북항마리나 다이빙풀', '밀양 아리랑 잠수풀', '문수실내수영장 다이빙풀', '사직실내수영장 다이빙풀', '고성해양레포츠아카데미', '송도해양레포츠센터 잠수풀', '풀식스다이빙풀', '창원실내수영장 다이빙풀', 'DIT 잠수풀장', '염주체육관 다이빙풀', '전북잠수전문학교 익산점', '여수시청소년해양교육원 잠수풀', '군산오션팔레트 잠수풀', '전주완산수영장 다이빙풀', '다이브자이언트 제주교육센터', '수원 월드컵경기장 다이빙풀', '아산 실내스킨스쿠버 다이빙풀 (배미수영장)');
  if matched <> 45 then
    raise exception 'Excel center matching failed: expected 45, matched %', matched;
  end if;
end $$;

update public.indoor_diving_centers set
  region = '서울',
  name = '송파 올림픽수영장 다이빙풀',
  description = '서울 올림픽공원 내 위치한 대한민국 대표 다이빙 명소입니다. 수심 5m의 넓은 메인 다이빙풀과 50m 경영풀이 분리되어 있으며, 다이빙샵과 매점이 입점해 있어 접근성과 편의성이 뛰어납니다. 자격증 소지자와 버디 필수 조건으로 안전한 연습이 가능합니다.',
  max_depth = 5,
  pool_specs = '메인 다이빙풀(수심 5m, 25x25m)',
  facilities = '주차 가능(유료), 샤워실/탈의실 완비, 매점/다이빙샵 입점, 수온 다소 시원함',
  buddy_condition = '2인이상 필수',
  entry_condition = '프리다이버 Level 2
스쿠버 어드밴스드 이상
2인 1조 버디 필수 ',
  weekday_hours = '평일 3부
야간 운영 (18:00 ~ 22:00)',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = '매월 둘째 주 일요일 휴관',
  rental_info = NULL,
  reservation_required = '필수
(잔여 인원 발생 시 현장 발권 가능)',
  reservation_info = '네이버 예약 (온라인 선착순 결제)',
  price_full = '평일/주말 2시간 기준 15,000원 ~ 20,000원 선 (입장권 및 강습료 별도)',
  address = '서울 송파구 올림픽로 424 (방이동, 올림픽공원 수영장)',
  homepage = 'https://www.ksponco.or.kr/',
  phone = '02-410-1378',
  business_hours = concat_ws(E'\n', '평일 3부
야간 운영 (18:00 ~ 22:00)', '주말 및 공휴일 정상 운영')
where name = '송파 올림픽수영장 다이빙풀';

update public.indoor_diving_centers set
  region = '서울',
  name = 'KUA 잠실다이빙풀장',
  description = '잠실종합운동장 내에 위치한 5m 수심의 실내 다이빙풀장입니다. 소속 강사 단체 예약 및 체계적인 교육 프로그램이 활성화되어 있으며, 슈트 대여 및 드라이기 등 기본 편의시설이 잘 갖추어져 있어 수도권 다이버들이 즐겨 찾는 연습 공간입니다.',
  max_depth = 5,
  pool_specs = '실내 단독 다이빙풀 (수심 5m, 보조 수면 포함)',
  facilities = '주차 가능, 샤워실/탈의실 완비, 수온 25~26도, 드라이기 구비',
  buddy_condition = '2인이상 필수',
  entry_condition = '프리다이버 Level 1 이상 
오픈워터 이상
 2인 1조 버디 필수',
  weekday_hours = '평일 야간 운영 (09:00 ~ 21:00, 하절기 22:00)',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '슈트 및 기본 장비 유료 대여 가능 
(3,000원 ~ 5,000원)',
  reservation_required = '네이버 예약 사전 필수 
(잔여 인원 발생 시 현장 발권 가능)',
  reservation_info = '네이버 예약 (온라인 선착순 결제)',
  price_full = '평일 15,000원 / 주말 및 공휴일 20,000원 (2시간 기준)',
  address = '서울 송파구 올림픽로 25 (잠실동, 잠실종합운동장 내)',
  homepage = 'http://www.kua.or.kr/',
  phone = '02-2203-2525',
  business_hours = concat_ws(E'\n', '평일 야간 운영 (09:00 ~ 21:00, 하절기 22:00)', '주말 및 공휴일 정상 운영')
where name = 'KUA 잠실다이빙풀장';

update public.indoor_diving_centers set
  region = '경기',
  name = '딥스테이션',
  description = '국내 최대 수심 36m를 자랑하는 월드클래스 실내 프리다이빙/스쿠버 딥풀입니다. 1.5m부터 36m까지 단계별 수심 존과 연중 29~30도의 따뜻한 수온, 넓은 무료 주차장, 고급 파우더룸 및 카페테리아를 갖추어 최고의 다이빙 환경을 제공합니다.',
  max_depth = 36,
  pool_specs = '메인 36m 딥웰 
다단계 수심 존(1.5m, 3m, 5m, 10m, 20m, 36m) 복합 구성',
  facilities = '넓은 주차장 무료, 온수 샤워실, 파우더룸, 장비샵, 카페, 수온 29~30도(따뜻함)',
  buddy_condition = '2인이상 필수',
  entry_condition = 'Lv1/오픈워터 5m~10m
Lv2/어드밴스드 20m
Lv3 이상 36m 전층 이용 가능
(미동반자 홈페이지 사전 매칭 신청 가능)',
  weekday_hours = '평일 풀타임 야간 운영 (08:00 ~ 23:00)',
  weekend_hours = '주말 및 공휴일 08:00 ~ 23:00 운영',
  holiday = NULL,
  rental_info = '마스크, 슈트, 핀, 카본핀 등 전 품목 유료 대여 가능',
  reservation_required = '사전 예약 필수',
  reservation_info = '딥스테이션 공식 홈페이지 (회원가입 및 사전 예약)',
  price_full = '평일 44,000원 ~ 55,000원 / 주말 및 공휴일 66,000원 (타임별/시간대별 상이)',
  address = '경기 용인시 처인구 포곡읍 성산로 523',
  homepage = 'https://deepstation.co.kr/',
  phone = '031-334-3535',
  business_hours = concat_ws(E'\n', '평일 풀타임 야간 운영 (08:00 ~ 23:00)', '주말 및 공휴일 08:00 ~ 23:00 운영')
where name = '딥스테이션';

update public.indoor_diving_centers set
  region = '경기',
  name = '파라다이브35',
  description = '시흥 거북섬에 위치한 35m 수심의 최첨단 실내 다이빙 센터입니다. 메인 딥웰과 웜업풀, 교육용 얕은 풀이 분리되어 있으며 쾌적한 파우더룸과 장비샵, 기본 장비 무료 대여 서비스로 초급부터 상급 다이버까지 모두 만족하는 인기 핫플입니다.',
  max_depth = 35,
  pool_specs = '메인 35m 딥웰 
웜업풀 및 교육용 얕은 풀(1.3m~3m) 분리 구성',
  facilities = '넓은 주차장 무료, 고급 샤워실/파우더룸, 다이빙샵, 강의실, 수온 28~30도',
  buddy_condition = '2인이상 필수',
  entry_condition = '프리다이빙 Lv2(20m) 
Lv3 이상(35m 전층)
스쿠버 어드밴스드 이상',
  weekday_hours = '평일 야간 타임 운영 (09:00 ~ 22:00)',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '기본 장비(마스크, 스노클, 핀, 슈트) 무료, 카본핀 10,000원 유료',
  reservation_required = '사전 예약 필수',
  reservation_info = '파라다이브35 공식 홈페이지 (타임별 온라인 예약)',
  price_full = '평일 3시간 이용 45,000원 / 주말 및 공휴일 3시간 이용 67,000원',
  address = '경기 시흥시 거북섬남로 16 (정왕동)',
  homepage = 'https://paradive.co.kr/',
  phone = '031-432-3535',
  business_hours = concat_ws(E'\n', '평일 야간 타임 운영 (09:00 ~ 22:00)', '주말 및 공휴일 정상 운영')
where name = '파라다이브35';

update public.indoor_diving_centers set
  region = '인천',
  name = '송도 스포츠파크 잠수풀',
  description = '인천환경공단에서 운영하는 공공 실내 잠수풀로 수심 5m를 제공합니다. 실내 체육시설과 연계되어 있어 경제적인 요금으로 이용할 수 있으며, 깔끔한 샤워실과 체계적인 온라인 사전 예약 시스템을 갖추고 있습니다.',
  max_depth = 5,
  pool_specs = '실내 잠수풀(수심 5m) ',
  facilities = '주차 가능(저렴), 샤워실/탈의실, 실내 체육시설 연계, 수온 적정',
  buddy_condition = '2인이상 필수',
  entry_condition = 'Level 1 이상 오픈워터 이상',
  weekday_hours = '화~금 주중 야간 타임 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = '매주 월요일 휴관',
  rental_info = NULL,
  reservation_required = '사전 예약 필수',
  reservation_info = '인천환경공단 통합예약시스템 (온라인 사전예약)',
  price_full = '성인 기준 5,000원 (공공시설 요금, 2시간 기준)',
  address = '인천 연수구 컨벤시아대로 391 (송도동)',
  homepage = 'https://www.eco-i.or.kr/',
  phone = '032-899-4870',
  business_hours = concat_ws(E'\n', '화~금 주중 야간 타임 운영', '주말 및 공휴일 정상 운영')
where name = '송도 스포츠파크 잠수풀';

update public.indoor_diving_centers set
  region = '경기',
  name = 'K26 잠수풀',
  description = '북한강의 아름다운 자연경관 속에 위치한 대한민국 최초의 대형 딥풀(수심 26m)입니다. 단계별 수심 존(10m, 20m, 26m)과 온수 샤워실, 카페, 장비샵이 완비되어 있어 수도권 및 강원권 다이버들의 성지로 사랑받고 있습니다.',
  max_depth = 26,
  pool_specs = '메인 26m 딥웰
웜업풀(수심 1.3m) 분리 구성',
  facilities = '주차장 완비, 온수 샤워실, 카페/매점, 장비 샵, 수온 26~28도',
  buddy_condition = '2인이상 필수',
  entry_condition = ' 프리다이빙 Lv1(10m)  
Lv2(20m) / Lv3(26m), 스쿠버 어드밴스드 이상, 2인 1조 버디 필수',
  weekday_hours = '평일 야간 타임 운영 (밤 10시까지)',
  weekend_hours = '토요일 및 공휴일 운영',
  holiday = '일요일휴무',
  rental_info = '슈트, 마스크, 핀 등 유료 대여 가능',
  reservation_required = '사전 예약 필수 (잔여시 현장 가능)',
  reservation_info = 'K26 공식 홈페이지 예약 시스템',
  price_full = '평일 33,000원 ~ 44,000원 / 주말 및 공휴일 55,000원 (시간대별 상이)',
  address = '경기 가평군 청평면 북한강변로 360-64',
  homepage = 'https://www.k26.co.kr/',
  phone = '031-585-6126',
  business_hours = concat_ws(E'\n', '평일 야간 타임 운영 (밤 10시까지)', '토요일 및 공휴일 운영')
where name = 'K26 잠수풀';

update public.indoor_diving_centers set
  region = '경기',
  name = '테마 오산 잠수풀',
  description = '수심 11m의 다단계 수심 존을 갖춘 오산의 대표 실내 다이빙 연습장입니다. 프리다이빙과 스쿠버다이빙 교육에 최적화된 시설과 온수 샤워실, 친절한 운영으로 동호인들의 발길이 끊이지 않는 곳입니다.',
  max_depth = 11,
  pool_specs = '메인 잠수풀(수심 11m) + 다단계 수심 교육 존',
  facilities = '주차 가능, 온수 샤워실, 탈의실, 다이빙 교육 시설',
  buddy_condition = '2인이상 필수',
  entry_condition = '프리다이빙 Lv1 이상 또는 오픈워터 이상, 2인 1조 버디 필수 (11m 전층)',
  weekday_hours = '평일 야간 타임 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '슈트, 핀 등 일부 장비 대여 가능',
  reservation_required = '네이버 예약 또는 사전 예약 필수',
  reservation_info = '네이버 예약 및 공식 홈페이지',
  price_full = '일반 이용 38,000원 ~ 45,000원 (세션별 상이)',
  address = '경기 오산시 경기동로 115 (은계동)',
  homepage = 'https://smartstore.naver.com/themadive',
  phone = '031-372-3535',
  business_hours = concat_ws(E'\n', '평일 야간 타임 운영', '주말 및 공휴일 정상 운영')
where name = '테마 오산 잠수풀';

update public.indoor_diving_centers set
  region = '경기',
  name = '씨네블루 파주 잠수풀',
  description = '수심 6.3m의 실내 다이빙 풀로 수중 촬영 및 특수 조명 세트 존이 함께 마련되어 있는 이색적인 다이빙 공간입니다. 제휴 다이빙샵과 연계하여 전문 교육 및 연습을 즐기기에 좋습니다.',
  max_depth = 6.3,
  pool_specs = '실내 다이빙 풀 (수심 6.3m, 촬영용 특수 조명 및 세트 존 포함)',
  facilities = '주차 가능, 샤워실/탈의실, 제휴 다이빙샵 연계',
  buddy_condition = '2인이상 필수',
  entry_condition = '프리다이빙 Lv1 이상 또는 오픈워터 이상 (초급자는 반드시 강사 동반 필수)',
  weekday_hours = '요일별 지정 시간대 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '장비 대여 가능 (제휴 샵 연계)',
  reservation_required = '사전 예약 우선 / 잔여 시 현장 가능',
  reservation_info = '공식 홈페이지 예약 및 유선/카카오채널 문의',
  price_full = '평일 30,000원 ~ 주말 40,000원 선',
  address = '경기 파주시 문산읍 임진나루로 279',
  homepage = 'https://cinebluedive.modoo.at/',
  phone = '031-953-3535',
  business_hours = concat_ws(E'\n', '요일별 지정 시간대 야간 운영', '주말 및 공휴일 정상 운영')
where name = '씨네블루 파주 잠수풀';

update public.indoor_diving_centers set
  region = '경기',
  name = '뉴서울다이빙풀',
  description = '수심 5.5m의 아늑하고 실속 있는 실내 다이빙풀입니다. 광명 및 서울 서남권 다이버들이 평일 야간이나 주말에 가볍게 찾아 스킬업과 물놀이 연습을 하기 좋은 접근성을 자랑합니다.',
  max_depth = 5.5,
  pool_specs = '실내 단독 다이빙풀 (수심 5.5m)',
  facilities = '주차 가능, 샤워실, 탈의실 완비',
  buddy_condition = '2인이상 필수',
  entry_condition = '프리다이버 Level 1 이상 또는 오픈워터 이상, 버디 동반 필수',
  weekday_hours = '평일 야간 타임 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '일부 장비 대여 가능',
  reservation_required = '사전 예약 필수',
  reservation_info = '유선 문의 및 현장/사전 접수',
  price_full = '기본 세션 16,000원 ~ 25,000원',
  address = '경기 광명시 범안로 1023 (하안동)',
  homepage = 'https://newseouldive.modoo.at/',
  phone = '02-899-2525',
  business_hours = concat_ws(E'\n', '평일 야간 타임 운영', '주말 및 공휴일 정상 운영')
where name = '뉴서울다이빙풀';

update public.indoor_diving_centers set
  region = '경기',
  name = '대부잠수풀',
  description = '대부도 인근에 위치한 수심 5.3m의 실내 다이빙 및 교육용 풀장입니다. 부담 없는 시설 이용료와 알찬 기본 편의시설을 갖추어 인근 지역 다이버들의 아지트로 활용됩니다.',
  max_depth = 5.3,
  pool_specs = '실내 다이빙풀 (수심 5.3m, 교육 및 연습용)',
  facilities = '주차 가능, 샤워실, 기본 편의시설',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 2인 1조 버디 필수',
  weekday_hours = '요일별 지정 시간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '일부 장비 대여 가능',
  reservation_required = '사전 예약 필수',
  reservation_info = '공식 웹사이트 및 네이버 예약',
  price_full = '시설 이용료 1,000원 + 장비/타임별 추가 요금 발생',
  address = '경기 안산시 단원구 대부중앙로 38-1 (대부동)',
  homepage = 'https://daebudive.modoo.at/',
  phone = '032-886-2525',
  business_hours = concat_ws(E'\n', '요일별 지정 시간 운영', '주말 및 공휴일 정상 운영')
where name = '대부잠수풀';

update public.indoor_diving_centers set
  region = '경기',
  name = '서브마린다이빙풀',
  description = '부천 상동 중심가에 위치한 수심 15m의 실내 딥다이빙 풀입니다. 도심 속에서 중·상급 수심 연습을 할 수 있도록 단계별 수심 존과 온수 샤워실, 장비 세척장을 잘 갖추고 있습니다.',
  max_depth = 15,
  pool_specs = '실내 딥다이빙 풀 (수심 15m, 단계별 수심 존)',
  facilities = '주차 가능, 온수 샤워실, 장비 세척장',
  buddy_condition = '2인이상 필수',
  entry_condition = '프리다이버 Lv2 또는 어드밴스드 이상 권장 (초급 단독 입장 불가, 강사 동반 또는 버디 필수)',
  weekday_hours = '평일 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = '격주 월요일 휴관',
  rental_info = '일부 장비 대여 가능',
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '공식 홈페이지 예약 시스템',
  price_full = '기본 타임 40,000원 ~ 50,000원',
  address = '경기 부천시 원미구 길주로 210 (상동)',
  homepage = 'https://submarinedive.modoo.at/',
  phone = '032-321-2525',
  business_hours = concat_ws(E'\n', '평일 야간 운영', '주말 및 공휴일 정상 운영')
where name = '서브마린다이빙풀';

update public.indoor_diving_centers set
  region = '경기',
  name = '수원 스킨스쿠버 다이빙풀',
  description = '수원 서둔동에 위치한 수심 5m의 전통 있는 실내 다이빙 연습장입니다. 오랜 운영 노하우를 바탕으로 다이버들의 기초 교육 및 동호회 연습 모임이 활발하게 이루어지는 곳입니다.',
  max_depth = 5,
  pool_specs = '실내 다이빙풀 (수심 5m)',
  facilities = '주차 가능, 샤워실, 탈의실',
  buddy_condition = '2인이상 필수',
  entry_condition = '프리다이버 Lv1 이상 또는 오픈워터 이상, 2인 1조 버디 필수',
  weekday_hours = '평일 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '장비 대여 가능',
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '온라인 사전 예약 및 유선 문의',
  price_full = '기본 세션 18,000원 ~ 25,000원',
  address = '경기 수원시 권선구 수성로 10 (서둔동)',
  homepage = 'https://suwondive.modoo.at/',
  phone = '031-295-2525',
  business_hours = concat_ws(E'\n', '평일 야간 운영', '주말 및 공휴일 정상 운영')
where name = '수원 스킨스쿠버 다이빙풀';

update public.indoor_diving_centers set
  region = '경기',
  name = '메르다이빙센터 일산점',
  description = '일산 백석역 인근에 위치한 수심 5m의 프리미엄 다이빙 센터입니다. 쾌적한 파우더룸과 전문 다이빙샵 연계를 통해 일산/고양 권역 다이버들에게 최적의 교육 및 연습 환경을 제공합니다.',
  max_depth = 5,
  pool_specs = '실내 다이빙풀 (수심 5m, 교육장 연계)',
  facilities = '주차 가능, 샤워실, 파우더룸, 샵 연계',
  buddy_condition = '2인이상 필수',
  entry_condition = '프리다이버 Lv1 이상 또는 오픈워터 이상, 2인 1조 버디 필수',
  weekday_hours = '평일 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '장비 대여 가능',
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '공식 홈페이지 / 네이버 예약',
  price_full = '기본 세션 28,000원 ~ 35,000원',
  address = '경기 고양시 일산동구 중앙로 1275 (백석동)',
  homepage = 'https://merdive.modoo.at/',
  phone = '031-901-2525',
  business_hours = concat_ws(E'\n', '평일 야간 운영', '주말 및 공휴일 정상 운영')
where name = '메르다이빙센터 일산점';

update public.indoor_diving_centers set
  region = '경기',
  name = '아르피아 잠수풀',
  description = '용인 죽전 포은아트홀(아르피아 스포츠센터) 내 위치한 수심 5m의 깔끔한 실내 잠수풀입니다. 지자체 공공 문화체육시설로 쾌적한 환경과 합리적인 요금으로 이용할 수 있습니다.',
  max_depth = 5,
  pool_specs = '실내 다이빙풀 (수심 5m, 포은아트홀 부대시설)',
  facilities = '주차 가능(용인 포은아트홀 연계), 샤워실 완비',
  buddy_condition = '2인이상 필수',
  entry_condition = '프리다이버 Lv1 이상 또는 오픈워터 이상, 버디 필수',
  weekday_hours = '평일 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '일부 장비 대여 가능',
  reservation_required = '사전 예약 필수',
  reservation_info = '용인도시공사 통합예약 시스템',
  price_full = '용인 시민 및 일반 10,000원 ~ 15,000원 (공공 감면 혜택 있음)',
  address = '경기 용인시 기흥구 포은대로 499 (죽전동, 용인포은아트홀)',
  homepage = 'https://www.yuc.or.kr/',
  phone = '031-896-3535',
  business_hours = concat_ws(E'\n', '평일 야간 운영', '주말 및 공휴일 정상 운영')
where name = '아르피아 잠수풀';

update public.indoor_diving_centers set
  region = '경기',
  name = '포프라자',
  description = '경기 북부 포천 지역에 위치한 수심 5m의 실내 다이빙 풀입니다. 넓은 휴게 공간과 주차 시설을 갖추어 경기 북부권 다이버들이 편하게 방문하여 연습할 수 있습니다.',
  max_depth = 5,
  pool_specs = '실내 다이빙풀 (수심 5m)',
  facilities = '주차 가능, 샤워실, 휴게 공간',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 2인 1조 버디 필수',
  weekday_hours = '요일별 지정 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '장비 대여 가능',
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '공식 홈페이지 예약',
  price_full = '기본 세션 25,000원 ~ 35,000원',
  address = '경기 포천시 소흘읍 호국로 375',
  homepage = 'https://pochundive.modoo.at/',
  phone = '031-543-2525',
  business_hours = concat_ws(E'\n', '요일별 지정 운영', '주말 및 공휴일 정상 운영')
where name = '포프라자';

update public.indoor_diving_centers set
  region = '경기',
  name = '양주에코스포츠센터',
  description = '양주시 시설관리공단에서 운영하는 친환경 에코스포츠센터 내 수심 4.5m 잠수풀입니다. 공공시설의 장점인 저렴한 요금과 깨끗한 수영장 연계 시설을 자랑합니다.',
  max_depth = 4.5,
  pool_specs = '실내 잠수풀(수심 4.5m)',
  facilities = '주차 가능(공공시설), 샤워실/탈의실, 수영장 연계',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 2인 이상 버디 필수 (공공시설 규정)',
  weekday_hours = '평일 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = NULL,
  reservation_required = '사전 예약 필수',
  reservation_info = '양주시 시설관리공단 인터넷 예약',
  price_full = '시민/일반 9,680원 (공공 체육시설 기준)',
  address = '경기 양주시 평화로 1335 (마전동)',
  homepage = 'https://www.yjfmc.or.kr/',
  phone = '031-828-9700',
  business_hours = concat_ws(E'\n', '평일 야간 운영', '주말 및 공휴일 정상 운영')
where name = '양주에코스포츠센터';

update public.indoor_diving_centers set
  region = '경기',
  name = '수작코리아 수중촬영장',
  description = '수심 7m의 수중 촬영 및 특수 세트가 특화된 전문 촬영용 다이빙 풀입니다. 수중 모델 연출, 영상 촬영, 그리고 동호회 스킬업 연습을 동시에 진행할 수 있는 독보적인 시설입니다.',
  max_depth = 7,
  pool_specs = '수중 촬영 전문 풀 (수심 7m, 수중 세트장 및 호호흡 존)',
  facilities = '주차 가능, 수중 촬영 전문 조명/장비 세팅, 샤워실',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 2인 이상 버디 필수 (촬영 팀 단위 입장)',
  weekday_hours = '평일 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '장비 대여 가능',
  reservation_required = '사전 예약 필수',
  reservation_info = '유선 예약 및 공식 홈페이지',
  price_full = '촬영 및 연습 세션 20,000원 ~ 30,000원 (시간당/타임별)',
  address = '경기 고양시 덕양구 대주로 393',
  homepage = 'https://sujak.modoo.at/',
  phone = '031-962-2525',
  business_hours = concat_ws(E'\n', '평일 야간 운영', '주말 및 공휴일 정상 운영')
where name = '수작코리아 수중촬영장';

update public.indoor_diving_centers set
  region = '경기',
  name = '용문국민체육센터',
  description = '양평군 용문면에 신축된 깔끔한 국민체육센터 내 수심 6m 다이빙풀입니다. 현대적인 샤워실과 쾌적한 부대시설을 공공 요금으로 이용할 수 있어 인기가 높습니다.',
  max_depth = 6,
  pool_specs = '실내 다이빙풀 수심 6m',
  facilities = '주차 가능(공공시설), 신축 샤워실/탈의실 깔끔함',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 강사/버디 동반 필수',
  weekday_hours = '평일 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = NULL,
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '양평군 시설관리공단 통합예약',
  price_full = '양평군민 및 일반 8,000원 (공공 요금)',
  address = '경기 양평군 용문면 다문중앙길 55',
  homepage = 'https://www.ypregion.or.kr/',
  phone = '031-770-2525',
  business_hours = concat_ws(E'\n', '평일 야간 운영', '주말 및 공휴일 정상 운영')
where name = '용문국민체육센터';

update public.indoor_diving_centers set
  region = '경기',
  name = '아쿠아라인 다목적풀',
  description = '성남도시개발공사에서 관리하는 수심 5m의 다목적 수중 풀입니다. 성남 및 분당 권역 다이버들이 평일과 주말에 편리하게 접근하여 연습할 수 있는 공공 체육 인프라입니다.',
  max_depth = 5,
  pool_specs = '다목적 수중 풀 (수심 5m)',
  facilities = '주차 가능, 샤워실, 다목적풀 시설',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 2인 이상 버디 필수',
  weekday_hours = '평일 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '장비 대여 가능',
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '성남도시개발공사 통합예약',
  price_full = '기본 세션 15,000원 ~ 22,000원',
  address = '경기 성남시 중원구 둔촌대로 394 (여수동)',
  homepage = 'https://www.snis.or.kr/',
  phone = '031-755-2525',
  business_hours = concat_ws(E'\n', '평일 야간 운영', '주말 및 공휴일 정상 운영')
where name = '아쿠아라인 다목적풀';

update public.indoor_diving_centers set
  region = '경기',
  name = '웨이브파크 블루홀라군',
  description = '세계 최대 인공서핑장 웨이브파크 단지 내에 위치한 야외 블루홀라군(수심 5m)입니다. 탁 트인 야외에서 이국적인 분위기와 함께 다이빙을 즐길 수 있는 리조트형 복합 레저 시설입니다.',
  max_depth = 5,
  pool_specs = '야외 블루홀라군 딥풀 수심 5m',
  facilities = '야외 풀장, 넓은 주차장, 샤워실/탈의실, 리조트형 부대시설',
  buddy_condition = '2인이상 필수',
  entry_condition = '야외 풀장: 레벨별/자격증별 입장 규정 준수, 버디 필수',
  weekday_hours = '시즌별 야간 운영 (변동 있음)',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '일부 장비 대여 가능',
  reservation_required = '사전 예약 필수',
  reservation_info = '웨이브파크 공식 홈페이지 예매',
  price_full = '야외 블루홀라군 세션 30,000원 ~ 50,000원 (시즌별 변동)',
  address = '경기 시흥시 거북섬로 27 (정왕동)',
  homepage = 'https://www.wavepark.co.kr/',
  phone = '1544-9662',
  business_hours = concat_ws(E'\n', '시즌별 야간 운영 (변동 있음)', '주말 및 공휴일 정상 운영')
where name = '웨이브파크 블루홀라군';

update public.indoor_diving_centers set
  region = '경기',
  name = '화성그린환경센터',
  description = '화성시 친환경 에너지 타운 내에 위치한 수심 6m의 깨끗한 실내 다이빙풀입니다. 주민 친화적 시설로 온수 공급이 원활하며 쾌적한 환경에서 다이빙 연습을 즐길 수 있습니다.',
  max_depth = 6,
  pool_specs = '실내 다이빙풀 수심 6m',
  facilities = '주차 가능, 친환경 에너지 연계 온수 샤워실, 깨끗한 시설',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 2인 이상 버디 필수',
  weekday_hours = '평일 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '장비 대여 가능',
  reservation_required = '사전 예약 필수',
  reservation_info = '화성도시공사 통합예약 시스템',
  price_full = '일반 이용 12,000원 (친환경시설 주민 감면 등 적용)',
  address = '경기 화성시 향남읍 동오길 85',
  homepage = 'https://www.hsuco.or.kr/',
  phone = '031-369-2525',
  business_hours = concat_ws(E'\n', '평일 야간 운영', '주말 및 공휴일 정상 운영')
where name = '화성그린환경센터';

update public.indoor_diving_centers set
  region = '대전',
  name = '알프스다이빙',
  description = '대전 시내 중심가에 위치한 수심 15m의 중·상급자용 실내 딥다이빙 풀입니다. 충청권 다이버들이 멀리 이동하지 않고도 깊은 수심에서 트레이닝을 할 수 있는 핵심 거점입니다.',
  max_depth = 15,
  pool_specs = '실내 딥다이빙 풀 (수심 15m, 교육 및 연습용 존)',
  facilities = '주차 가능, 온수 샤워실, 다이빙 샵',
  buddy_condition = '2인이상 필수',
  entry_condition = '프리다이빙/스쿠버 자격증 소지자, 레벨별 버디 필수 (15m)',
  weekday_hours = '평일 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '장비 대여 가능',
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '공식 홈페이지 및 유선 예약',
  price_full = '대전권 15m 풀 기본 세션 30,000원 ~ 40,000원',
  address = '대전 중구 대종로 373 (문화동)',
  homepage = 'https://alpsdive.modoo.at/',
  phone = '042-253-2525',
  business_hours = concat_ws(E'\n', '평일 야간 운영', '주말 및 공휴일 정상 운영')
where name = '알프스다이빙';

update public.indoor_diving_centers set
  region = '충북',
  name = '충북학생수영장',
  description = '청주시 중심가에 위치한 충북학생수영장 내 다이빙풀(수심 5m)입니다. 교육청 산하 시설로 학생 교육 및 지역 동호인들에게 개방되어 저렴한 비용으로 이용할 수 있습니다.',
  max_depth = 5,
  pool_specs = '경영풀 및 다이빙풀 겸용 (수심 5m)',
  facilities = '주차 가능, 학생/일반 겸용 샤워실/탈의실',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 버디 필수',
  weekday_hours = '요일별 지정 시간 운영',
  weekend_hours = '토요일 운영',
  holiday = ' 일요일 및 공휴일 휴무',
  rental_info = '일부 장비 대여 가능',
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '기관 홈페이지 사전 예약 / 단체 접수',
  price_full = '학생 및 일반 공공 요금 (약 5,000원 ~ 10,000원 내외)',
  address = '충북 청주시 상당구 사직대로 405',
  homepage = 'https://www.cbe.go.kr/pool/',
  phone = '043-229-1811',
  business_hours = concat_ws(E'\n', '요일별 지정 시간 운영', '토요일 운영')
where name = '충북학생수영장';

update public.indoor_diving_centers set
  region = '강원',
  name = '강릉 북부수영장',
  description = '강릉 동해바다 인근에 신축된 최신식 북부수영장 내 수심 5.6m 다이빙풀입니다. 동해안 투어 전후로 프리다이빙 및 스쿠버 연습을 하기 좋은 강원권 필수 방문 코스입니다.',
  max_depth = 5.6,
  pool_specs = '실내 다이빙풀 수심 5.6m',
  facilities = '신축 시설, 주차 가능, 샤워실 완비',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 버디 필수 (프리다이빙/스쿠버)',
  weekday_hours = '평일 운영',
  weekend_hours = '토요일 운영',
  holiday = ' 일요일 및 공휴일 휴무',
  rental_info = '일부 장비 대여 가능',
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '강릉시 시설관리공단 통합예약',
  price_full = '강릉시 공공 체육시설 요금 (약 7,000원 ~ 12,000원)',
  address = '강원특별자치도 강릉시 사천면 진리해변길 113',
  homepage = 'https://www.gngn.or.kr/',
  phone = '033-660-3535',
  business_hours = concat_ws(E'\n', '평일 운영', '토요일 운영')
where name = '강릉 북부수영장';

update public.indoor_diving_centers set
  region = '강원',
  name = '강릉국민체육센터',
  description = '강릉종합운동장 내 위치한 국민체육센터 수영장 및 다이빙풀(수심 5m)입니다. 공공 체육시설 특유의 깔끔한 관리와 저렴한 요금으로 지역 다이버들에게 사랑받고 있습니다.',
  max_depth = 5,
  pool_specs = '다이빙풀 (수심 5m) ',
  facilities = '주차 가능, 샤워실/탈의실, 공공 체육시설',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 2인 이상 버디 필수',
  weekday_hours = '요일별 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = '월요일 또는 지정일 휴관',
  rental_info = '일부 장비 대여 가능',
  reservation_required = '사전 예약 필수',
  reservation_info = '강릉시 시설관리공단 인터넷 예약',
  price_full = '성인 기준 4,000원부터 (공공 수영장 요금)',
  address = '강원특별자치도 강릉시 종합운동장길 69',
  homepage = 'https://www.gngn.or.kr/',
  phone = '033-660-3535',
  business_hours = concat_ws(E'\n', '요일별 운영', '주말 및 공휴일 정상 운영')
where name = '강릉국민체육센터';

update public.indoor_diving_centers set
  region = '경북',
  name = '올덴K10잠수풀',
  description = '경북 울진의 아름다운 동해 바다 뷰를 품은 올덴리조트 부속 수심 10m 잠수풀입니다. 글램핑 및 숙박 시설이 연계되어 있어 다이빙 여행과 휴양을 동시에 즐길 수 있는 리조트형 풀장입니다.',
  max_depth = 10,
  pool_specs = '야외/실내 연계형 잠수풀 수심 10m',
  facilities = '캠핑리조트 내 위치, 주차 가능, 글램핑/숙박 부대시설 연계',
  buddy_condition = '2인이상 필수',
  entry_condition = '캠핑리조트 부속: 자격증 소지자 및 강사 동반 또는 버디 필수',
  weekday_hours = '평일 야간 미운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = NULL,
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '올덴 리조트 공식 홈페이지 / 네이버 예약',
  price_full = '캠핑리조트 부속 10m 풀 30,000원 ~ 40,000원',
  address = '경북 울진군 북면 나기고길 100 (올덴리조트)',
  homepage = 'http://www.oldenresort.com/',
  phone = '054-782-2525',
  business_hours = concat_ws(E'\n', '평일 야간 미운영', '주말 및 공휴일 정상 운영')
where name = '올덴K10잠수풀';

update public.indoor_diving_centers set
  region = '경북',
  name = '패스나인 다이빙센터',
  description = '경북 칠곡에 위치한 수심 9m의 전문 실내 다이빙 교육 센터입니다. 대구 및 경북권 다이버들이 깊이 있는 수중 스킬 연습과 자격증 교육을 받기 위해 즐겨 찾는 명소입니다.',
  max_depth = 9,
  pool_specs = '실내 다이빙 풀 수심 9m',
  facilities = '주차 가능, 샤워실, 장비 세척 및 보관함',
  buddy_condition = '2인이상 필수',
  entry_condition = '프리다이빙/스쿠버 자격증 소지자, 2인 1조 버디 필수 (9m)',
  weekday_hours = '평일 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '장비 대여 가능',
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '공식 홈페이지 및 네이버 예약',
  price_full = '9m 풀 기본 세션 30,000원 ~ 40,000원',
  address = '경북 칠곡군 약목면 복성리 730-1',
  homepage = 'https://passninedive.modoo.at/',
  phone = '054-971-2525',
  business_hours = concat_ws(E'\n', '평일 야간 운영', '주말 및 공휴일 정상 운영')
where name = '패스나인 다이빙센터';

update public.indoor_diving_centers set
  region = '경북',
  name = '울진해양레포츠센터',
  description = '동해안 해양 레포츠의 메카인 울진에 위치한 수심 5m 전문 교육 센터입니다. 아카데미 숙박 시설과 해양 연계 프로그램이 완벽하게 구축되어 있어 전국 스쿠버/프리다이버들이 모이는 곳입니다.',
  max_depth = 5,
  pool_specs = '해양 레포츠 전문 풀 수심 5m',
  facilities = '해양 레포츠 전문 숙박/교육 시설 연계, 샤워실 완비',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 버디 필수 (5m)',
  weekday_hours = '요일별 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '일부 장비 대여 가능',
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '해양레포츠센터 공식 홈페이지 예약',
  price_full = '기본 세션 15,000원 ~ 25,000원 (교육생 할인 별도)',
  address = '경북 울진군 매화면 오산항길 59',
  homepage = 'https://www.uljinleports.or.kr/',
  phone = '054-782-5300',
  business_hours = concat_ws(E'\n', '요일별 운영', '주말 및 공휴일 정상 운영')
where name = '울진해양레포츠센터';

update public.indoor_diving_centers set
  region = '부산',
  name = '북항마리나 다이빙풀',
  description = '영남권 최고 수심인 24m를 자랑하는 부산 북항마리나의 오션뷰 프리미엄 다이빙풀입니다. 최신식 인프라와 쾌적한 딥웰, 마리나 항만의 멋진 풍경을 동시에 누릴 수 있는 남부권 최고의 핫플입니다.',
  max_depth = 24,
  pool_specs = '메인 24m 딥웰  보조 교육풀 ',
  facilities = '오션뷰, 최신식 건물, 넓은 주차장, 고급 샤워실/탈의실',
  buddy_condition = '2인이상 필수',
  entry_condition = '영남 최고 수심 24m: 프리다이빙/스쿠버 자격증 등급별 수심 제한 적용, 버디 필수',
  weekday_hours = '평일 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '장비 대여 가능',
  reservation_required = '사전 예약 우선',
  reservation_info = '부산항만공사 / 북항마리나 공식 홈페이지 예약',
  price_full = '영남 최고 수심 24m 프리미엄 요금 (평일/주말 30,000원 ~ 50,000원 대)',
  address = '부산 동구 충장대로 396 (북항마리나)',
  homepage = 'https://www.busanportmarina.or.kr/',
  phone = '051-400-3535',
  business_hours = concat_ws(E'\n', '평일 야간 운영', '주말 및 공휴일 정상 운영')
where name = '북항마리나 다이빙풀';

update public.indoor_diving_centers set
  region = '경남',
  name = '밀양 아리랑 잠수풀',
  description = '밀양시 시설관리공단에서 운영하는 수심 12m의 신축 최신식 실내 잠수풀입니다. 경남권에서 중급 수심 트레이닝을 하기 매우 쾌적한 환경과 깔끔한 부대시설을 자랑합니다.',
  max_depth = 12,
  pool_specs = '실내 다이빙 풀 수심 12m, ',
  facilities = '주차 가능, 신축 샤워실/탈의실, 쾌적한 부대시설',
  buddy_condition = '2인이상 필수',
  entry_condition = '프리다이빙/스쿠버 자격증 소지자, 2인 1조 버디 필수 (12m)',
  weekday_hours = '평일 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '일부 장비 대여 가능',
  reservation_required = '사전 예약 필수',
  reservation_info = '밀양시 시설관리공단 통합예약',
  price_full = '기본 세션 22,000원 ~ 30,000원',
  address = '경남 밀양시 교동 575-1',
  homepage = 'https://www.myfmc.or.kr/',
  phone = '055-359-4500',
  business_hours = concat_ws(E'\n', '평일 야간 운영', '주말 및 공휴일 정상 운영')
where name = '밀양 아리랑 잠수풀';

update public.indoor_diving_centers set
  region = '울산',
  name = '문수실내수영장 다이빙풀',
  description = '울산대공원 인근 문수실내수영장 내에 위치한 올림픽 규격 다이빙풀(수심 5m)입니다. 넓은 주차장과 뛰어난 접근성으로 울산 지역 다이버들의 핵심 연습 장소입니다.',
  max_depth = 5,
  pool_specs = '올림픽 규격 경영풀 및 다이빙풀 (수심 5m)',
  facilities = '울산 대공원 내 위치, 넓은 주차장, 샤워실 완비',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 2인 이상 버디 필수 (5m)',
  weekday_hours = '평일 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '장비 대여 가능',
  reservation_required = '사전 예약 필수',
  reservation_info = '울산시설공단 통합예약 시스템',
  price_full = '울산시 공공 체육시설 요금 15,000원 내외',
  address = '울산 남구 문수로 44 (옥동)',
  homepage = 'https://www.uuc.or.kr/',
  phone = '052-226-4830',
  business_hours = concat_ws(E'\n', '평일 야간 운영', '주말 및 공휴일 정상 운영')
where name = '문수실내수영장 다이빙풀';

update public.indoor_diving_centers set
  region = '부산',
  name = '사직실내수영장 다이빙풀',
  description = '부산 사직종합운동장 내에 위치한 전통 있는 수심 5m 다이빙풀입니다. 부산권 다이버들이 오랜 기간 이용해 온 대표적인 공공 체육시설 기반의 다이빙 연습 공간입니다.',
  max_depth = 5,
  pool_specs = '부산 사직종합운동장 내 다이빙풀 (수심 5m) + 경영풀',
  facilities = '종합운동장 내 위치, 주차 편리, 샤워실/탈의실',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 2인 이상 버디 필수 (5m)',
  weekday_hours = '평일 야간 미운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = NULL,
  reservation_required = '사전 예약 필수',
  reservation_info = '부산시설공단 통합예약 시스템',
  price_full = '부산시 공공 체육시설 요금 12,000원 내외',
  address = '부산 동래구 사직로 55 (사직동)',
  homepage = 'https://www.bisco.or.kr/',
  phone = '051-550-6300',
  business_hours = concat_ws(E'\n', '평일 야간 미운영', '주말 및 공휴일 정상 운영')
where name = '사직실내수영장 다이빙풀';

update public.indoor_diving_centers set
  region = '경남',
  name = '고성해양레포츠아카데미',
  description = '경남 고성에 위치한 수심 11m의 전문 해양 레포츠 아카데미 풀장입니다. 숙박 시설과 교육 강의실이 완비되어 있어 단체 트레이닝과 워크숍에 최적화되어 있습니다.',
  max_depth = 11,
  pool_specs = '실내 다이빙 풀 (수심 11m, 교육 시설 연계)',
  facilities = '해양 레포츠 교육 시설, 숙박 및 샤워실 연계',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 2인 이상 버디 필수 (11m)',
  weekday_hours = '평일 야간 미운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = NULL,
  reservation_required = '사전 예약 필수',
  reservation_info = '고성군 해양레포츠 아카데미 홈페이지',
  price_full = '기본 세션 12,000원 ~ 20,000원',
  address = '경남 고성군 회화면 당항만로 1116',
  homepage = 'https://www.goseong.go.kr/leports/',
  phone = '055-673-3535',
  business_hours = concat_ws(E'\n', '평일 야간 미운영', '주말 및 공휴일 정상 운영')
where name = '고성해양레포츠아카데미';

update public.indoor_diving_centers set
  region = '부산',
  name = '송도해양레포츠센터 잠수풀',
  description = '부산 송도 암남공원 인근 바다와 맞닿은 곳에 위치한 수심 7m의 해양레포츠센터 잠수풀입니다. 바다 다이빙과 실내 연습을 연계하기 좋은 최적의 입지 조건을 갖추고 있습니다.',
  max_depth = 7,
  pool_specs = '바다 인근 실내 잠수풀 (수심 7m, 세척장 및 교육 존)',
  facilities = '바다 인근 위치, 주차 가능, 샤워실/세척장',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 2인 이상 버디 필수 (7m)',
  weekday_hours = '요일별 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '장비 대여 가능',
  reservation_required = '사전 예약 필수',
  reservation_info = '부산 서구 해양레포츠센터 홈페이지',
  price_full = '부산 서구 시설 기준 12,000원 ~ 18,000원',
  address = '부산 서구 암남공원로 181',
  homepage = 'https://www.bsseogu.go.kr/tour/',
  phone = '051-240-4086',
  business_hours = concat_ws(E'\n', '요일별 운영', '주말 및 공휴일 정상 운영')
where name = '송도해양레포츠센터 잠수풀';

update public.indoor_diving_centers set
  region = '부산',
  name = '풀식스다이빙풀',
  description = '부산 금정구에 위치한 수심 6m의 스노클링 및 스킨다이빙 중심 실내 풀장입니다. 초급자들과 가벼운 수중 활동을 즐기는 동호인들이 편하게 방문할 수 있는 아담한 공간입니다.',
  max_depth = 6,
  pool_specs = '스노클링 및 스킨다이빙 전용 풀 (수심 6m)',
  facilities = '부산 금정구 위치, 주차 가능, 샤워실',
  buddy_condition = '2인이상 필수',
  entry_condition = '스노클링/스킨다이빙 중심, 초급자 강사 동반 권장 (6m)',
  weekday_hours = '평일 야간 미운영',
  weekend_hours = '토요일 운영',
  holiday = ' 일요일 휴무',
  rental_info = NULL,
  reservation_required = '현장 발권 가능 / 단체 예약',
  reservation_info = '유선 문의 및 현장 발권',
  price_full = '스노클링/스킨다이빙 세션 요금 문의 (약 20,000원 선)',
  address = '부산 금정구 중앙대로 1819',
  homepage = 'https://poolsix.modoo.at/',
  phone = '051-512-2525',
  business_hours = concat_ws(E'\n', '평일 야간 미운영', '토요일 운영')
where name = '풀식스다이빙풀';

update public.indoor_diving_centers set
  region = '경남',
  name = '창원실내수영장 다이빙풀',
  description = '창원 종합운동장 내 창원실내수영장 부속 수심 5m 다이빙풀입니다. 창원 시민과 경남권 다이버들이 저렴한 공공 요금으로 꾸준히 찾는 대표적인 실내 연습장입니다.',
  max_depth = 5,
  pool_specs = '창원 종합운동장 내 다이빙풀 (수심 5m) + 경영풀',
  facilities = '창원 종합운동장 내, 주차 편리, 샤워실 완비',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 버디 필수 (5m)',
  weekday_hours = '요일별 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '일부 장비 대여 가능',
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '창원시설공단 통합예약 시스템',
  price_full = '창원시 공공 체육시설 요금 10,000원 ~ 15,000원',
  address = '경남 창원시 성산구 원이대로 450 (용호동)',
  homepage = 'https://www.cwsisul.or.kr/',
  phone = '055-712-7300',
  business_hours = concat_ws(E'\n', '요일별 운영', '주말 및 공휴일 정상 운영')
where name = '창원실내수영장 다이빙풀';

update public.indoor_diving_centers set
  region = '부산',
  name = 'DIT 잠수풀장',
  description = '동의과학대학교 내에 위치한 수심 6m의 잠수풀장으로, 국내 유일의 **100% 온천수**를 공급하는 특색 있는 다이빙 풀입니다. 따뜻하고 수질이 좋아 겨울철에도 인기가 높습니다.',
  max_depth = 6,
  pool_specs = '100% 온천수 공급형 다이빙 풀 (수심 6m)',
  facilities = '100% 온천수 공급, 주차 가능, 샤워실',
  buddy_condition = '2인이상 필수',
  entry_condition = '100% 온천수: 자격증 소지자 및 버디 필수 (6m)',
  weekday_hours = '요일별 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = '월요일 또는 지정일 휴관',
  rental_info = '일부 장비 대여 가능',
  reservation_required = '사전 예약 필수',
  reservation_info = '동의과학대학교 수영장 예약 접수',
  price_full = '100% 온천수 풀 이용 요금 (약 20,000원 ~ 30,000원 선)',
  address = '부산 부산진구 엄광로 176 (동의과학대학교)',
  homepage = 'https://www.dit.ac.kr/',
  phone = '051-850-3535',
  business_hours = concat_ws(E'\n', '요일별 운영', '주말 및 공휴일 정상 운영')
where name = 'DIT 잠수풀장';

update public.indoor_diving_centers set
  region = '광주',
  name = '염주체육관 다이빙풀',
  description = '광주 염주종합체육관 내에 위치한 수심 5m의 광주 대표 다이빙풀입니다. 호남권 다이버들이 모여 기초 교육 및 스킨스쿠버 연습을 진행하는 핵심 체육 인프라입니다.',
  max_depth = 5,
  pool_specs = '광주 염주체육관 내 다이빙풀 (수심 5m) + 경영풀',
  facilities = '광주 염주체육관 내, 주차 편리, 샤워실/탈의실',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 버디 필수 (5m)',
  weekday_hours = '요일별 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '일부 장비 대여 가능',
  reservation_required = '사전 예약 필수',
  reservation_info = '광주광역시 시설관리공단 통합예약',
  price_full = '광주광역시 공공 요금 (약 10,000원 ~ 15,000원 선)',
  address = '광주 서구 금화로 278 (염주종합체육관)',
  homepage = 'https://www.gjif.or.kr/',
  phone = '062-600-3535',
  business_hours = concat_ws(E'\n', '요일별 운영', '주말 및 공휴일 정상 운영')
where name = '염주체육관 다이빙풀';

update public.indoor_diving_centers set
  region = '전북',
  name = '전북잠수전문학교 익산점',
  description = '전북 익산에 위치한 수심 5m의 전문 잠수 교육 및 트레이닝 풀장입니다. 전북권 다이버들의 자격증 취득 및 스킬 향상을 위한 교육 전문 시설로 운영되고 있습니다.',
  max_depth = 5,
  pool_specs = '전문 잠수 교육용 풀 (수심 5m)',
  facilities = '전문 교육시설, 주차 가능, 장비 세척장',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 2인 1조 버디 필수 (5m)',
  weekday_hours = '평일 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '장비 대여 가능',
  reservation_required = '사전 예약 필수',
  reservation_info = '전문학교 공식 홈페이지 / 유선 예약',
  price_full = '전문 교육 및 연습 세션 25,000원 ~ 35,000원',
  address = '전북 익산시 무왕로 (신동)',
  homepage = 'https://jbdive.modoo.at/',
  phone = '063-853-2525',
  business_hours = concat_ws(E'\n', '평일 야간 운영', '주말 및 공휴일 정상 운영')
where name = '전북잠수전문학교 익산점';

update public.indoor_diving_centers set
  region = '전남',
  name = '여수시청소년해양교육원 잠수풀',
  description = '여수 바다를 품은 청소년해양교육원 내 최신식 수심 5m 실내 잠수풀입니다. 깨끗한 시설과 넓은 공간을 갖추어 남해안 권역 다이버들과 해양 교육 프로그램의 거점으로 꼽힙니다.',
  max_depth = 5,
  pool_specs = '청소년 해양 교육원 내 최신식 다이빙 풀 (수심 5m)',
  facilities = '청소년 해양 교육원 부속, 최신식 실내 시설, 주차 가능',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 버디 필수 (5m)',
  weekday_hours = '요일별 운영',
  weekend_hours = '토요일 운영',
  holiday = ' 일요일 및 공휴일 휴무',
  rental_info = '일부 장비 대여 가능',
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '해양교육원 홈페이지 사전 접수',
  price_full = '청소년/일반 공공 요금 (약 10,000원 ~ 15,000원 선)',
  address = '전남 여수시 소라면 마린로 592',
  homepage = 'https://www.ysleports.or.kr/',
  phone = '061-681-3535',
  business_hours = concat_ws(E'\n', '요일별 운영', '토요일 운영')
where name = '여수시청소년해양교육원 잠수풀';

update public.indoor_diving_centers set
  region = '전북',
  name = '군산오션팔레트 잠수풀',
  description = '전북 군산 새만금 인근에 위치한 수심 5m의 실내 다이빙 및 레저 연습 풀장입니다. 군산 및 전북 서해안 권역 다이버들에게 쾌적한 실내 수중 연습 환경을 제공합니다.',
  max_depth = 5,
  pool_specs = '실내 다이빙 풀 (수심 5m, 교육 및 연습용)',
  facilities = '주차 가능, 샤워실, 휴게 공간',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 버디 필수 (5m)',
  weekday_hours = '요일별 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '일부 장비 대여 가능',
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '공식 홈페이지 및 네이버 예약',
  price_full = '기본 세션 30,000원 ~ 40,000원',
  address = '전북 군산시 새만금북로',
  homepage = 'https://gunsandive.modoo.at/',
  phone = '063-443-2525',
  business_hours = concat_ws(E'\n', '요일별 운영', '주말 및 공휴일 정상 운영')
where name = '군산오션팔레트 잠수풀';

update public.indoor_diving_centers set
  region = '전북',
  name = '전주완산수영장 다이빙풀',
  description = '전주 완산수영장 내에 위치한 수심 5m 다이빙 전용 타임 운영 풀장입니다. 전주 지역 다이버들이 저렴한 공공 요금으로 시간대에 맞춰 수중 연습을 할 수 있는 공간입니다.',
  max_depth = 5,
  pool_specs = '전주 완산수영장 내 다이빙 전용 타임 운영 풀 (수심 5m)',
  facilities = '전주 완산수영장 내 다이빙 풀, 주차 가능, 샤워실',
  buddy_condition = '2인이상 필수',
  entry_condition = '다이빙 전용 시간 준수, 자격증 소지자 및 강사 동반 권장',
  weekday_hours = '평일 야간 미운영',
  weekend_hours = '주말 부분 운영',
  holiday = NULL,
  rental_info = '장비 대여 불가',
  reservation_required = '현장 발권 가능 / 단체 예약',
  reservation_info = '전주기전대학/완산수영장 유선 및 현장 접수',
  price_full = '공공 체육시설 다이빙 전용 타임 요금 (약 5,000원 ~ 10,000원 선)',
  address = '전북 전주시 완산구 백제대로 310',
  homepage = 'https://www.jjss.or.kr/',
  phone = '063-239-2525',
  business_hours = concat_ws(E'\n', '평일 야간 미운영', '주말 부분 운영')
where name = '전주완산수영장 다이빙풀';

update public.indoor_diving_centers set
  region = '제주',
  name = '다이브자이언트 제주교육센터',
  description = '세계적인 다이빙의 성지 제주도에 위치한 수심 4m 교육 연계형 잠수풀입니다. 외부 강사 프로그램 및 제주 바다 투어와 연계하여 사전 적응 및 교육을 진행하기 좋습니다.',
  max_depth = 4,
  pool_specs = '제주 교육센터 연계 다이빙 풀 (수심 4m)',
  facilities = '제주도 위치, 외부 강사 프로그램 연계, 주차 및 샤워실',
  buddy_condition = '2인이상 필수',
  entry_condition = '외부 강사 프로그램 연계, 자격증 소지자 및 버디 필수 (4m)',
  weekday_hours = '야간 미운영 (주간 중심)',
  weekend_hours = '주말 예약제 운영 (사전 문의 필수)',
  holiday = NULL,
  rental_info = '장비 대여 불가',
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '제주 교육센터 공식 채널 및 유선 예약',
  price_full = '제주 교육 센터 세션 22,000원 ~ 30,000원',
  address = '제주특별자치도 제주시 연삼로',
  homepage = 'https://jejudive.modoo.at/',
  phone = '064-753-2525',
  business_hours = concat_ws(E'\n', '야간 미운영 (주간 중심)', '주말 예약제 운영 (사전 문의 필수)')
where name = '다이브자이언트 제주교육센터';

update public.indoor_diving_centers set
  region = '경기',
  name = '수원 월드컵경기장 다이빙풀',
  description = '수원 월드컵경기장 스포츠 센터 내에 위치한 수심 5m 공공 다이빙풀입니다. 50m 경영풀과 넓은 주차 공간, 수원도시공사의 체계적인 관리로 경기 남부 다이버들의 사랑을 받는 곳입니다.',
  max_depth = 5,
  pool_specs = '실내 다이빙풀 (수심 5m) ',
  facilities = '주차 편리, 넓은 월드컵경기장 부대시설, 샤워실/탈의실 완비',
  buddy_condition = '2인이상 필수',
  entry_condition = '프리다이버 Lv1 이상 또는 오픈워터 이상, 2인 1조 버디 필수',
  weekday_hours = '평일 야간 타임 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = NULL,
  reservation_required = '사전 예약 우선 / 현장 잔여시 가능',
  reservation_info = '수원도시공사 통합예약 시스템',
  price_full = '수원도시공사 공공 요금 (약 6,000원 ~ 12,000원 선)',
  address = '경기 수원시 팔달구 월드컵로 310 (우만동)',
  homepage = 'https://www.suwonworldcup.or.kr/',
  phone = '031-259-2000',
  business_hours = concat_ws(E'\n', '평일 야간 타임 운영', '주말 및 공휴일 정상 운영')
where name = '수원 월드컵경기장 다이빙풀';

update public.indoor_diving_centers set
  region = '충남',
  name = '아산 실내스킨스쿠버 다이빙풀 (배미수영장)',
  description = '아산 배미수영장 내에 위치한 충청권 대표 수심 5m 실내 다이빙풀입니다. 아산시 시설관리공단에서 운영하여 요금이 경제적이며 온수 샤워실 등 편의시설이 잘 갖추어져 있습니다.',
  max_depth = 5,
  pool_specs = '실내 다이빙풀 (수심 5m)',
  facilities = '배미수영장 내 위치, 넓은 주차장, 온수 샤워실/탈의실 완비',
  buddy_condition = '2인이상 필수',
  entry_condition = '자격증 소지자 및 2인 이상 버디 필수',
  weekday_hours = '평일 야간 운영',
  weekend_hours = '주말 및 공휴일 정상 운영',
  holiday = NULL,
  rental_info = '일부 장비 대여 가능',
  reservation_required = '사전 예약 필수',
  reservation_info = '아산시 시설관리공단 통합예약 시스템',
  price_full = '아산시 시설관리공단 공공 요금 (약 5,000원 ~ 10,000원 선)',
  address = '충남 아산시 배미길 410 (배미동)',
  homepage = 'https://www.asanfmc.or.kr/',
  phone = '041-534-3535',
  business_hours = concat_ws(E'\n', '평일 야간 운영', '주말 및 공휴일 정상 운영')
where name = '아산 실내스킨스쿠버 다이빙풀 (배미수영장)';

