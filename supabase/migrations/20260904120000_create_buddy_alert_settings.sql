-- 버디 공고 맞춤 알림 설정 테이블 생성
create table if not exists public.buddy_alert_settings (
  id bigint generated always as identity primary key,
  user_id text not null unique,
  enabled boolean not null default true,
  date_filter text not null default '',
  region text not null default '',
  sub_region text not null default '',
  activity_type text not null default '',
  difficulty text not null default '',
  recruit_gender text not null default '',
  host_gender text not null default '',
  participant_level text not null default '',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- 검색 및 조회용 인덱스
create index if not exists idx_buddy_alert_settings_user_id
  on public.buddy_alert_settings (user_id);

create index if not exists idx_buddy_alert_settings_enabled
  on public.buddy_alert_settings (enabled);

-- RLS 활성화
alter table public.buddy_alert_settings enable row level security;

-- 권한 부여
grant select, insert, update, delete on public.buddy_alert_settings to anon, authenticated, service_role;
grant usage, select on sequence public.buddy_alert_settings_id_seq to anon, authenticated, service_role;

-- RLS 정책 설정
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'buddy_alert_settings' and policyname = 'Allow select buddy_alert_settings'
  ) then
    create policy "Allow select buddy_alert_settings" on public.buddy_alert_settings for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'buddy_alert_settings' and policyname = 'Allow insert buddy_alert_settings'
  ) then
    create policy "Allow insert buddy_alert_settings" on public.buddy_alert_settings for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'buddy_alert_settings' and policyname = 'Allow update buddy_alert_settings'
  ) then
    create policy "Allow update buddy_alert_settings" on public.buddy_alert_settings for update using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'buddy_alert_settings' and policyname = 'Allow delete buddy_alert_settings'
  ) then
    create policy "Allow delete buddy_alert_settings" on public.buddy_alert_settings for delete using (true);
  end if;
end $$;
