-- 모임장 차단 테이블 생성
create table if not exists public.buddy_blocks (
  blocker_user_id text not null,
  blocked_user_id text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (blocker_user_id, blocked_user_id),
  constraint chk_buddy_blocks_no_self_block check (blocker_user_id <> blocked_user_id)
);

create index if not exists idx_buddy_blocks_blocker
  on public.buddy_blocks (blocker_user_id);

create index if not exists idx_buddy_blocks_blocked
  on public.buddy_blocks (blocked_user_id);

-- RLS 활성화
alter table public.buddy_blocks enable row level security;

-- 권한 부여
grant select, insert, delete on public.buddy_blocks to anon, authenticated, service_role;

-- RLS 정책 설정
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'buddy_blocks' and policyname = 'Allow select buddy_blocks'
  ) then
    create policy "Allow select buddy_blocks" on public.buddy_blocks for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'buddy_blocks' and policyname = 'Allow insert buddy_blocks'
  ) then
    create policy "Allow insert buddy_blocks" on public.buddy_blocks for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'buddy_blocks' and policyname = 'Allow delete buddy_blocks'
  ) then
    create policy "Allow delete buddy_blocks" on public.buddy_blocks for delete using (true);
  end if;
end $$;
