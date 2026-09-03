-- 버디 모집 포스트 테이블 생성
create table if not exists public.buddy_posts (
  id bigint generated always as identity primary key,
  user_id text not null,
  activity_type text not null check (activity_type in ('스노쿨링', '프리다이빙', '실내다이빙')),
  region text not null,
  point_id text,
  point_name text not null,
  is_snorky_point boolean not null default true,
  event_date date not null,
  entry_time text not null,
  host_gender text not null,
  preferred_gender text not null,
  capacity int not null check (capacity >= 2),
  current_count int not null default 1,
  difficulty text not null,
  description text,
  application_notification_enabled boolean not null default true,
  status text not null default 'RECRUITING',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- 검색 및 필터링용 인덱스
create index if not exists idx_buddy_posts_user_id
  on public.buddy_posts (user_id);

create index if not exists idx_buddy_posts_event_date
  on public.buddy_posts (event_date);

create index if not exists idx_buddy_posts_region
  on public.buddy_posts (region);

create index if not exists idx_buddy_posts_status
  on public.buddy_posts (status);

-- RLS 활성화
alter table public.buddy_posts enable row level security;

-- 권한 부여
grant select, insert, update, delete on public.buddy_posts to anon, authenticated, service_role;
grant usage, select on sequence public.buddy_posts_id_seq to anon, authenticated, service_role;

-- RLS 정책 설정
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'buddy_posts' and policyname = 'Allow select buddy_posts'
  ) then
    create policy "Allow select buddy_posts" on public.buddy_posts for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'buddy_posts' and policyname = 'Allow insert buddy_posts'
  ) then
    create policy "Allow insert buddy_posts" on public.buddy_posts for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'buddy_posts' and policyname = 'Allow update buddy_posts'
  ) then
    create policy "Allow update buddy_posts" on public.buddy_posts for update using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'buddy_posts' and policyname = 'Allow delete buddy_posts'
  ) then
    create policy "Allow delete buddy_posts" on public.buddy_posts for delete using (true);
  end if;
end $$;
