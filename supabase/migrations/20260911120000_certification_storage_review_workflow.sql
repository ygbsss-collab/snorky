-- 자격인증 사진을 private Storage에서 검수하고 처리 결과를 사용자에게 알린다.

alter table public.certification_requests
  add column if not exists photo_path text,
  add column if not exists photo_mime_type text,
  add column if not exists photo_deleted_at timestamptz;

alter table public.certification_requests
  drop constraint if exists certification_requests_status_check;

alter table public.certification_requests
  add constraint certification_requests_status_check
  check (status in ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED'));

drop index if exists public.uq_certification_requests_pending_user;

create or replace function public.prevent_duplicate_pending_certification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id));
  if exists (
    select 1
    from public.certification_requests
    where user_id = new.user_id
      and status = 'PENDING'
      and id is distinct from new.id
  ) then
    raise exception 'CERTIFICATION_REQUEST_ALREADY_PENDING';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_pending_certification on public.certification_requests;
create trigger trg_prevent_duplicate_pending_certification
before insert or update of user_id, status on public.certification_requests
for each row
when (new.status = 'PENDING')
execute function public.prevent_duplicate_pending_certification();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'certification-photos',
  'certification-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Admins read certification photos" on storage.objects;
create policy "Admins read certification photos"
  on storage.objects
  for select to authenticated
  using (bucket_id = 'certification-photos' and public.is_snorky_admin());

drop policy if exists "Admins delete certification photos" on storage.objects;
create policy "Admins delete certification photos"
  on storage.objects
  for delete to authenticated
  using (bucket_id = 'certification-photos' and public.is_snorky_admin());

create or replace function public.review_certification_request(
  p_request_id bigint,
  p_status text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.certification_requests%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_title text;
  v_content text;
begin
  if not public.is_snorky_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_status not in ('APPROVED', 'REJECTED') then raise exception 'INVALID_CERTIFICATION_STATUS'; end if;
  if p_status = 'REJECTED' and nullif(btrim(p_rejection_reason), '') is null then
    raise exception 'REJECTION_REASON_REQUIRED';
  end if;

  select * into v_request
  from public.certification_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'CERTIFICATION_REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'PENDING' then raise exception 'CERTIFICATION_REQUEST_ALREADY_REVIEWED'; end if;

  update public.certification_requests
  set status = p_status,
      rejection_reason = case when p_status = 'REJECTED' then btrim(p_rejection_reason) else null end,
      reviewed_at = v_now,
      reviewed_by = auth.uid()
  where id = p_request_id;

  update public.user_profiles
  set aida_level = case when p_status = 'APPROVED' then v_request.level else aida_level end,
      certification_status = p_status,
      certification_organization = case when p_status = 'APPROVED' then v_request.agency else certification_organization end,
      certification_number = case when p_status = 'APPROVED' then v_request.certification_number else certification_number end,
      updated_at = v_now
  where provider_user_id = v_request.user_id;
  if not found then raise exception 'CERTIFICATION_PROFILE_NOT_FOUND'; end if;

  if p_status = 'APPROVED' then
    v_title := '자격 인증이 승인되었습니다.';
    v_content := v_request.agency || ' ' || v_request.level || ' 자격 인증이 완료되었습니다.';
  else
    v_title := '자격 인증이 거절되었습니다.';
    v_content := '거절 사유: ' || btrim(p_rejection_reason);
  end if;

  insert into public.user_notifications (user_id, type, title, content, link_url)
  values (
    v_request.user_id,
    case when p_status = 'APPROVED' then 'certification_approved' else 'certification_rejected' end,
    v_title,
    v_content,
    './mypage.html'
  );

  return jsonb_build_object(
    'id', p_request_id,
    'status', p_status,
    'reviewed_at', v_now,
    'reviewed_by', auth.uid(),
    'photo_path', v_request.photo_path
  );
end;
$$;

revoke all on function public.review_certification_request(bigint, text, text) from public;
grant execute on function public.review_certification_request(bigint, text, text) to authenticated, service_role;

create or replace function public.clear_certification_photo_path(
  p_request_id bigint,
  p_photo_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_snorky_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  update public.certification_requests
  set photo_path = null,
      photo_mime_type = null,
      photo_deleted_at = timezone('utc'::text, now())
  where id = p_request_id
    and status <> 'PENDING'
    and photo_path = p_photo_path;
end;
$$;

revoke all on function public.clear_certification_photo_path(bigint, text) from public;
grant execute on function public.clear_certification_photo_path(bigint, text) to authenticated, service_role;

create or replace function public.revoke_certification_approval(
  p_request_id bigint,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.certification_requests%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_reason text := coalesce(nullif(btrim(p_reason), ''), '관리자에 의해 승인이 취소되었습니다.');
begin
  if not public.is_snorky_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select * into v_request
  from public.certification_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'CERTIFICATION_REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'APPROVED' then raise exception 'CERTIFICATION_REQUEST_NOT_APPROVED'; end if;

  update public.certification_requests
  set status = 'REVOKED',
      rejection_reason = v_reason,
      reviewed_at = v_now,
      reviewed_by = auth.uid()
  where id = p_request_id;

  update public.user_profiles
  set certification_status = null,
      certification_organization = null,
      certification_number = null,
      updated_at = v_now
  where provider_user_id = v_request.user_id
    and certification_status = 'APPROVED'
    and certification_number is not distinct from v_request.certification_number;

  insert into public.user_notifications (user_id, type, title, content, link_url)
  values (
    v_request.user_id,
    'certification_revoked',
    '자격 인증 승인이 취소되었습니다.',
    v_reason,
    './mypage.html'
  );

  return jsonb_build_object('id', p_request_id, 'status', 'REVOKED', 'reviewed_at', v_now, 'reviewed_by', auth.uid());
end;
$$;

revoke all on function public.revoke_certification_approval(bigint, text) from public;
grant execute on function public.revoke_certification_approval(bigint, text) to authenticated, service_role;

notify pgrst, 'reload schema';
