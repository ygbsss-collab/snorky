-- 1. buddy_posts 테이블에 연락 방법 및 오픈채팅방 링크 컬럼 추가
alter table public.buddy_posts
  add column if not exists contact_method text not null default 'open_chat' check (contact_method in ('open_chat', 'later')),
  add column if not exists open_chat_url text;

-- 2. user_diving_schedules 테이블에 buddy_post_id 컬럼 추가 및 인덱스
alter table public.user_diving_schedules
  add column if not exists buddy_post_id bigint;

create index if not exists idx_user_diving_schedules_buddy_post
  on public.user_diving_schedules (buddy_post_id);

-- 3. buddy_applications (참가 신청 및 승인 관리) 테이블 생성
create table if not exists public.buddy_applications (
  id bigint generated always as identity primary key,
  buddy_post_id bigint not null references public.buddy_posts(id) on delete cascade,
  applicant_user_id text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint uq_buddy_applications_post_user unique (buddy_post_id, applicant_user_id)
);

create index if not exists idx_buddy_applications_post_id
  on public.buddy_applications (buddy_post_id);

create index if not exists idx_buddy_applications_user_id
  on public.buddy_applications (applicant_user_id);

-- RLS 활성화
alter table public.buddy_applications enable row level security;

-- 권한 부여
grant select, insert, update, delete on public.buddy_applications to anon, authenticated, service_role;
grant usage, select on sequence public.buddy_applications_id_seq to anon, authenticated, service_role;

-- RLS 정책 설정
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'buddy_applications' and policyname = 'Allow select buddy_applications'
  ) then
    create policy "Allow select buddy_applications" on public.buddy_applications for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'buddy_applications' and policyname = 'Allow insert buddy_applications'
  ) then
    create policy "Allow insert buddy_applications" on public.buddy_applications for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'buddy_applications' and policyname = 'Allow update buddy_applications'
  ) then
    create policy "Allow update buddy_applications" on public.buddy_applications for update using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'buddy_applications' and policyname = 'Allow delete buddy_applications'
  ) then
    create policy "Allow delete buddy_applications" on public.buddy_applications for delete using (true);
  end if;
end $$;
