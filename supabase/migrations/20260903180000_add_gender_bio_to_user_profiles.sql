-- 프로필 성별은 현재 사용자 직접 설정값이며, 추후 카카오 자동값도 같은 컬럼을 갱신한다.
alter table public.user_profiles
  add column if not exists gender text not null default '비공개',
  add column if not exists bio text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_gender_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_gender_check
      check (gender in ('남성', '여성', '비공개'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_bio_length_check'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_bio_length_check
      check (bio is null or char_length(bio) <= 100);
  end if;
end $$;

-- 기존 중복은 삭제/변경하지 않는다. 중복이 있으면 index 생성 전에 migration을 중단해 먼저 보고한다.
do $$
declare
  duplicate_group_count bigint;
begin
  select count(*)
    into duplicate_group_count
  from (
    select lower(btrim(custom_nickname))
    from public.user_profiles
    where nullif(btrim(custom_nickname), '') is not null
    group by lower(btrim(custom_nickname))
    having count(*) > 1
  ) duplicates;

  if duplicate_group_count > 0 then
    raise exception 'custom_nickname 정규화 중복 그룹이 %건 있습니다. 기존 데이터를 확인한 뒤 다시 적용하세요.', duplicate_group_count;
  end if;
end $$;

create unique index if not exists uq_user_profiles_custom_nickname_normalized
  on public.user_profiles (lower(btrim(custom_nickname)))
  where nullif(btrim(custom_nickname), '') is not null;

notify pgrst, 'reload schema';
