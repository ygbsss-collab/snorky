-- user_diving_schedules 테이블에 planned_time 컬럼 추가
alter table public.user_diving_schedules
  add column if not exists planned_time text;
