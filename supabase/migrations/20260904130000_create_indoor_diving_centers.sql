-- 실내다이빙 센터 및 센터 사진 테이블 생성 마이그레이션

create table if not exists public.indoor_diving_centers (
  id text primary key,
  name text not null,
  region text not null,
  sub_region text,
  address text,
  lat double precision,
  lng double precision,
  max_depth numeric,
  has_freediving boolean default true,
  has_scuba boolean default true,
  has_parking boolean default true,
  status text default '운영중' check (status in ('운영중', '확인필요', '휴장')),
  business_hours text,
  holiday text,
  parking_info text,
  phone text,
  homepage text,
  map_guide text,
  facilities text,
  feature_short text,
  feature_full text,
  description text,
  pool_temp text,
  pool_specs text,
  price_short text,
  price_full text,
  rental_info text,
  reservation_info text,
  buddy_condition text,
  image_url text,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.indoor_center_images (
  id bigint generated always as identity primary key,
  center_id text not null references public.indoor_diving_centers(id) on delete cascade,
  storage_path text not null,
  file_name text,
  mime_type text,
  is_primary boolean default false,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_indoor_centers_region on public.indoor_diving_centers(region);
create index if not exists idx_indoor_centers_status on public.indoor_diving_centers(status);
create index if not exists idx_indoor_center_images_center_id on public.indoor_center_images(center_id);

-- RLS 활성화
alter table public.indoor_diving_centers enable row level security;
alter table public.indoor_center_images enable row level security;

-- 조회: 모든 사용자(익명/인증) 허용
create policy "Allow public read indoor centers"
  on public.indoor_diving_centers for select
  using (true);

create policy "Allow public read indoor center images"
  on public.indoor_center_images for select
  using (true);

-- 관리자 CUD 정책 (admin_users 기준)
create policy "Allow admin insert indoor centers"
  on public.indoor_diving_centers for insert
  with check (
    auth.uid() in (select user_id from public.admin_users)
  );

create policy "Allow admin update indoor centers"
  on public.indoor_diving_centers for update
  using (
    auth.uid() in (select user_id from public.admin_users)
  );

create policy "Allow admin delete indoor centers"
  on public.indoor_diving_centers for delete
  using (
    auth.uid() in (select user_id from public.admin_users)
  );

create policy "Allow admin insert indoor center images"
  on public.indoor_center_images for insert
  with check (
    auth.uid() in (select user_id from public.admin_users)
  );

create policy "Allow admin update indoor center images"
  on public.indoor_center_images for update
  using (
    auth.uid() in (select user_id from public.admin_users)
  );

create policy "Allow admin delete indoor center images"
  on public.indoor_center_images for delete
  using (
    auth.uid() in (select user_id from public.admin_users)
  );

-- 기본 3개 센터 초기 Seed 데이터
insert into public.indoor_diving_centers (
  id, name, region, sub_region, address, lat, lng, max_depth,
  has_freediving, has_scuba, has_parking, status,
  business_hours, holiday, parking_info, phone, homepage, map_guide,
  facilities, feature_short, feature_full, description,
  pool_temp, pool_specs, price_short, price_full, rental_info, reservation_info, buddy_condition, image_url, sort_order
) values
(
  'deepstation',
  '딥스테이션',
  '경기',
  '용인시',
  '경기 용인시 처인구 포곡읍 성산로 523',
  37.2882,
  127.1856,
  36,
  true,
  true,
  true,
  '운영중',
  '08:00 ~ 22:00 (입장마감 20:00)',
  '연중무휴',
  '센터 전용 야외 주차장 완비 (이용객 무료)',
  '031-333-8888',
  'https://www.deepstation.kr',
  '에버랜드 인근, 전용 주차장 무료 이용 가능',
  '국내 최대 36m 딥다이빙 풀, 수온 29~30℃ 유지, 프리다이빙/스쿠버 장비 렌탈샵, 핀샤워실/드라이기 완비, 카페테리아, 관람 라운지',
  '수심 36m 아시아 최고 수준의 딥다이빙풀 및 전용 라운지',
  '아시아 최고 수심 36m 실내 다이빙풀로, 초심자부터 전문 프리다이버까지 훈련 가능한 단계별 수심 플랫폼과 안전 시설이 완비되어 있습니다.',
  '수심 36m 아시아 최고 수준의 딥다이빙 시설과 쾌적한 전용 라운지',
  '사계절 29℃ ~ 30℃ 항온 유지',
  '최대 36m 딥풀 · 1.3/2.5/5/16/36m 단계별 플랫폼 · 수중 포토존',
  '평일 44,000원 / 주말·공휴일 66,000원 (사전예약제)',
  '평일 44,000원 / 주말·공휴일 66,000원 (3시간 기준 이용권)',
  '슈트, 마스크, 스노클, 롱핀 렌탈 지원 (현장 대여 가능)',
  '100% 공식 홈페이지 사전 예약제 운영 (현장 접수 불가)',
  '2인 1조 버디 동반 필수 (자격증 소지자 또는 강사 동반)',
  'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&auto=format&fit=crop&q=80',
  1
),
(
  'k26',
  'K26 잠수풀',
  '경기',
  '가평군',
  '경기 가평군 청평면 고성리 59-1',
  37.7126,
  127.4646,
  26,
  true,
  true,
  true,
  '운영중',
  '평일 09:00 ~ 21:00 / 주말 06:00 ~ 21:00',
  '연중무휴',
  '센터 앞 전용 주차장 (무료 주차 가능)',
  '031-585-5757',
  'http://k-26.com',
  '청평호 인근 위치, 자차 이동 권장',
  '아시아 최초 26m 잠수풀, 단계별 플랫폼(1.3m, 2.5m, 5m, 10m, 26m), 에어포켓 트레이닝 룸, 청평호 전망 라운지',
  '26m 수심과 계단식 트레이닝 플랫폼을 갖춘 국내 대표 잠수풀',
  '국내 최초 26m 딥풀로 1.3m, 2.5m, 5m, 10m, 26m 계단식 구조 및 수중 에어포켓 트레이닝 룸을 갖추고 있습니다.',
  '26m 수심과 다양한 수심별 트레이닝 플랫폼을 갖춘 국내 대표 잠수풀',
  '29℃ ~ 30℃ 항온 유지',
  '최대 26m 계단식 구조 (1.3m~26m) · 에어포켓 트레이닝 룸',
  '평일 33,000원 / 주말 44,000원 (3시간 기준)',
  '평일 33,000원 / 주말 44,000원 (3시간 기준)',
  '스쿠버 풀세트, 프리다이빙 장비 렌탈샵 완비',
  '사전 예약 및 현장 입장 가능 (주말 사전 예약 권장)',
  '2인 이상 버디 필수 (라이선스 소지자 입장 가능)',
  'https://images.unsplash.com/photo-1682687220063-4742bd7fd538?w=800&auto=format&fit=crop&q=80',
  2
),
(
  'paradive35',
  '파라다이브35',
  '경기',
  '시흥시',
  '경기 시흥시 거북섬둘레길 10',
  37.3245,
  126.6853,
  35,
  true,
  true,
  true,
  '운영중',
  '09:00 ~ 22:00 (입장마감 20:30)',
  '매주 월요일 정기휴무',
  '건물 지하 전용 주차장 (3시간 무료 지원)',
  '031-432-3535',
  'https://paradive35.com',
  '시흥 거북섬 웨이브파크 인근 위치',
  '35m 초심도 딥풀, 30℃ 사계절 항온 유지, 수중 동굴/터널 코스, 최신 스쿠버/프리다이빙 렌탈 장비, 스마트 락커 시스템',
  '35m 초심도 딥풀과 인공 해저동굴 및 수중 터널 어트랙션',
  '35m 초심도 풀과 함께 이색적인 수중 터널 및 동굴 코스가 조성된 최신형 복합 다이빙 시설입니다.',
  '35m 딥풀과 수중 터널/동굴 어트랙션이 마련된 신규 복합 다이빙 시설',
  '30℃ 사계절 항온 유지',
  '최대 35m 초심도 딥풀 · 인공 해저동굴 & 수중 터널 코스',
  '평일 40,000원 / 주말 60,000원 (입장마감 20:30)',
  '평일 40,000원 / 주말 60,000원 (입장마감 20:30)',
  '최신 프리/스쿠버 장비 렌탈 및 스마트 락커 시스템',
  '공식 홈페이지 및 네이버 사전 예약제 운영',
  '버디 동반 필수 (미동반 시 강사 인솔 프로그램 필수)',
  'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800&auto=format&fit=crop&q=80',
  3
)
on conflict (id) do update set
  name = excluded.name,
  region = excluded.region,
  sub_region = excluded.sub_region,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  max_depth = excluded.max_depth,
  has_freediving = excluded.has_freediving,
  has_scuba = excluded.has_scuba,
  has_parking = excluded.has_parking,
  status = excluded.status,
  business_hours = excluded.business_hours,
  holiday = excluded.holiday,
  parking_info = excluded.parking_info,
  phone = excluded.phone,
  homepage = excluded.homepage,
  map_guide = excluded.map_guide,
  facilities = excluded.facilities,
  feature_short = excluded.feature_short,
  feature_full = excluded.feature_full,
  description = excluded.description,
  pool_temp = excluded.pool_temp,
  pool_specs = excluded.pool_specs,
  price_short = excluded.price_short,
  price_full = excluded.price_full,
  rental_info = excluded.rental_info,
  reservation_info = excluded.reservation_info,
  buddy_condition = excluded.buddy_condition,
  image_url = excluded.image_url,
  sort_order = excluded.sort_order,
  updated_at = now();
