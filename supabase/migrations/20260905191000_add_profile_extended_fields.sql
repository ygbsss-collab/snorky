-- 사용자 프로필에 나이대, 활동지역, 활동수심 컬럼 추가
alter table public.user_profiles
  add column if not exists age_group text,
  add column if not exists activity_region text,
  add column if not exists activity_depth text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_age_group_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_age_group_check
      check (age_group is null or age_group in ('20대', '30대', '40대', '50대', '60대', '70대'));
  end if;
end $$;

notify pgrst, 'reload schema';
