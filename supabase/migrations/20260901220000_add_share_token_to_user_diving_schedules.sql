-- user_diving_schedules 테이블에 share_token 컬럼 추가
alter table public.user_diving_schedules
  add column if not exists share_token text unique;

create index if not exists idx_user_diving_schedules_share_token
  on public.user_diving_schedules (share_token)
  where share_token is not null;

-- 비로그인 사용자도 share_token이 있는 단일 스케줄은 조회 가능하도록 정책 보강
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_diving_schedules' and policyname = 'Allow select schedule with share_token'
  ) then
    create policy "Allow select schedule with share_token" on public.user_diving_schedules
      for select using (share_token is not null);
  end if;
end $$;
