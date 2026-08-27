-- ==============================================================================
-- Migration: Add Evaluation Source Caches (RN1, KASI, KMA Mid Weather)
-- Date: 2026-08-25
-- ==============================================================================

-- 1. KMA RN1 Cache (1시간 실황 강수량 관측 누적)
create table if not exists public.kma_rn1_cache (
  id bigint generated always as identity primary key,
  nx integer not null,
  ny integer not null,
  observed_at timestamptz not null,
  rn1 numeric(5, 2) not null default 0.0,
  fetched_at timestamptz not null default timezone('utc'::text, now()),
  status varchar(20) not null default 'fresh',
  constraint uq_kma_rn1_cache unique (nx, ny, observed_at)
);

create index if not exists idx_kma_rn1_cache_grid_time
  on public.kma_rn1_cache (nx, ny, observed_at desc);

alter table public.kma_rn1_cache enable row level security;

create policy "Allow service role full access on kma_rn1_cache"
  on public.kma_rn1_cache for all
  to service_role
  using (true)
  with check (true);

create policy "Allow public read access on kma_rn1_cache"
  on public.kma_rn1_cache for select
  to public, anon, authenticated
  using (true);

-- 2. KASI SunTimes Cache (한국천문연구원 일출·일몰 출몰시각 정보)
create table if not exists public.kasi_sun_times_cache (
  id bigint generated always as identity primary key,
  locdate date not null,
  latitude numeric(6, 3) not null,
  longitude numeric(6, 3) not null,
  location_name varchar(50),
  sunrise timestamptz,
  sunset timestamptz,
  source varchar(20) not null default 'KASI',
  fetched_at timestamptz not null default timezone('utc'::text, now()),
  constraint uq_kasi_sun_times_cache unique (locdate, latitude, longitude)
);

create index if not exists idx_kasi_sun_times_cache_date_pos
  on public.kasi_sun_times_cache (locdate, latitude, longitude);

alter table public.kasi_sun_times_cache enable row level security;

create policy "Allow service role full access on kasi_sun_times_cache"
  on public.kasi_sun_times_cache for all
  to service_role
  using (true)
  with check (true);

create policy "Allow public read access on kasi_sun_times_cache"
  on public.kasi_sun_times_cache for select
  to public, anon, authenticated
  using (true);

-- 3. KMA Mid Weather Cache (중기 육상/기온 예보: KMA_MID_LAND / KMA_MID_TA)
create table if not exists public.kma_mid_weather_cache (
  id bigint generated always as identity primary key,
  source varchar(20) not null check (source in ('KMA_MID_LAND', 'KMA_MID_TA')),
  reg_id varchar(20) not null,
  tm_fc varchar(12) not null, -- YYYYMMDD0600 or YYYYMMDD1800
  forecast_data jsonb not null,
  fetched_at timestamptz not null default timezone('utc'::text, now()),
  constraint uq_kma_mid_weather_cache unique (source, reg_id, tm_fc)
);

create index if not exists idx_kma_mid_weather_cache_source_reg
  on public.kma_mid_weather_cache (source, reg_id, tm_fc desc);

alter table public.kma_mid_weather_cache enable row level security;

create policy "Allow service role full access on kma_mid_weather_cache"
  on public.kma_mid_weather_cache for all
  to service_role
  using (true)
  with check (true);

create policy "Allow public read access on kma_mid_weather_cache"
  on public.kma_mid_weather_cache for select
  to public, anon, authenticated
  using (true);

notify pgrst, 'reload schema';
