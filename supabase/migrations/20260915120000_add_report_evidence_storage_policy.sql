-- report-evidence bucket: 신고자 본인 업로드 + 관리자 조회 policy

-- 신고자 본인: 자신의 폴더에만 업로드 허용
create policy "report_evidence_insert_reporter"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'report-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 관리자: 서명 URL 생성(select) 허용
create policy "report_evidence_select_admin"
on storage.objects for select
to authenticated
using (
  bucket_id = 'report-evidence'
  and exists (
    select 1 from public.admin_users where user_id = auth.uid()
  )
);
