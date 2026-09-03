-- buddy_applications 테이블에 신청서 상세 필드 추가
alter table public.buddy_applications
  add column if not exists introduction text,
  add column if not exists applicant_gender text default '비공개',
  add column if not exists applicant_aida_level text default '없음';
