-- 사용자 프로필 테이블에 AIDA 레벨 컬럼 추가
alter table public.user_profiles
  add column if not exists aida_level text default '없음';

-- buddy_posts 테이블에 host_aida_level 컬럼 추가
alter table public.buddy_posts
  add column if not exists host_aida_level text default '없음';
