-- 사용자 알림 테이블 생성
create table if not exists public.user_notifications (
  id bigint generated always as identity primary key,
  user_id text not null,
  type text not null default 'buddy_application',
  title text not null,
  content text not null,
  buddy_post_id bigint references public.buddy_posts(id) on delete cascade,
  buddy_application_id bigint references public.buddy_applications(id) on delete cascade,
  applicant_user_id text,
  applicant_nickname text,
  point_name text,
  link_url text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- 인덱스
create index if not exists idx_user_notifications_user_id
  on public.user_notifications (user_id);

create index if not exists idx_user_notifications_is_read
  on public.user_notifications (user_id, is_read);

-- RLS 활성화
alter table public.user_notifications enable row level security;

-- 권한 부여
grant select, insert, update, delete on public.user_notifications to anon, authenticated, service_role;
grant usage, select on sequence public.user_notifications_id_seq to anon, authenticated, service_role;

-- RLS 정책 설정
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_notifications' and policyname = 'Allow select user_notifications'
  ) then
    create policy "Allow select user_notifications" on public.user_notifications for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_notifications' and policyname = 'Allow insert user_notifications'
  ) then
    create policy "Allow insert user_notifications" on public.user_notifications for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_notifications' and policyname = 'Allow update user_notifications'
  ) then
    create policy "Allow update user_notifications" on public.user_notifications for update using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_notifications' and policyname = 'Allow delete user_notifications'
  ) then
    create policy "Allow delete user_notifications" on public.user_notifications for delete using (true);
  end if;
end $$;
