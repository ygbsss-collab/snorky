-- 신고 처리 완료 후 report-evidence를 6개월 뒤 정리할 수 있도록 삭제 예정일을 기록한다.
alter table public.user_reports
  add column if not exists evidence_delete_at timestamptz,
  add column if not exists evidence_deleted_at timestamptz;

create or replace function public.schedule_report_evidence_deletion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'PENDING'
    and new.status in ('REVIEWED', 'ACTIONED', 'DISMISSED')
    and coalesce(array_length(new.image_paths, 1), 0) > 0
    and new.evidence_delete_at is null then
    new.evidence_delete_at := timezone('utc'::text, now()) + interval '6 months';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_schedule_report_evidence_deletion on public.user_reports;
create trigger trg_schedule_report_evidence_deletion
before update of status on public.user_reports
for each row
execute function public.schedule_report_evidence_deletion();

-- 마이그레이션 이전에 이미 처리 완료된 신고도 확인 가능한 검토 시각을 기준으로 정리 일정을 연결한다.
update public.user_reports
set evidence_delete_at = reviewed_at + interval '6 months'
where status in ('REVIEWED', 'ACTIONED', 'DISMISSED')
  and coalesce(array_length(image_paths, 1), 0) > 0
  and reviewed_at is not null
  and evidence_delete_at is null;
