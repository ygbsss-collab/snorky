-- 다이빙 스케줄 테이블 생성
create table if not exists public.user_diving_schedules (
  id bigint generated always as identity primary key,
  user_id text not null,
  schedule_date date not null,
  point_type text not null check (point_type in ('official', 'custom')),
  point_id text,
  custom_spot_id text,
  point_name text not null,
  memo text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- 사용자 및 날짜별 빠른 조회를 위한 인덱스
create index if not exists idx_user_diving_schedules_user_date
  on public.user_diving_schedules (user_id, schedule_date);

-- RLS 활성화
alter table public.user_diving_schedules enable row level security;

-- 권한 부여
grant select, insert, update, delete on public.user_diving_schedules to anon, authenticated, service_role;
grant usage, select on sequence public.user_diving_schedules_id_seq to anon, authenticated, service_role;

-- RLS 정책 설정 (사용자 분리 및 허용)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_diving_schedules' and policyname = 'Allow user select user_diving_schedules'
  ) then
    create policy "Allow user select user_diving_schedules" on public.user_diving_schedules for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_diving_schedules' and policyname = 'Allow user insert user_diving_schedules'
  ) then
    create policy "Allow user insert user_diving_schedules" on public.user_diving_schedules for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_diving_schedules' and policyname = 'Allow user update user_diving_schedules'
  ) then
    create policy "Allow user update user_diving_schedules" on public.user_diving_schedules for update using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_diving_schedules' and policyname = 'Allow user delete user_diving_schedules'
  ) then
    create policy "Allow user delete user_diving_schedules" on public.user_diving_schedules for delete using (true);
  end if;
end $$;
