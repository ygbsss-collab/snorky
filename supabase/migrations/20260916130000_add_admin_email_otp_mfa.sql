create table if not exists public.admin_email_otp_challenges (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  resend_available_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_email_otp_challenges_user_idx
  on public.admin_email_otp_challenges (user_id);

create table if not exists public.admin_email_mfa_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  verified_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists admin_email_mfa_sessions_user_idx
  on public.admin_email_mfa_sessions (user_id);

alter table public.admin_email_otp_challenges enable row level security;
alter table public.admin_email_mfa_sessions enable row level security;

revoke all on public.admin_email_otp_challenges from public, anon, authenticated;
revoke all on public.admin_email_mfa_sessions from public, anon, authenticated;
grant all on public.admin_email_otp_challenges to service_role;
grant all on public.admin_email_mfa_sessions to service_role;

create or replace function public.create_admin_email_otp_challenge(
  p_user_id uuid,
  p_session_id uuid,
  p_otp_hash text,
  p_expires_at timestamptz,
  p_resend_available_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.admin_email_otp_challenges%rowtype;
  v_retry_after integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_session_id::text));

  select * into v_existing
  from public.admin_email_otp_challenges
  where session_id = p_session_id
  for update;

  if found and v_existing.resend_available_at > now() then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_existing.resend_available_at - now())))::integer);
    return jsonb_build_object('ok', false, 'code', 'RESEND_COOLDOWN', 'retry_after', v_retry_after);
  end if;

  insert into public.admin_email_otp_challenges (
    session_id, user_id, otp_hash, expires_at, attempt_count,
    resend_available_at, consumed_at, created_at, updated_at
  ) values (
    p_session_id, p_user_id, p_otp_hash, p_expires_at, 0,
    p_resend_available_at, null, now(), now()
  )
  on conflict (session_id) do update set
    user_id = excluded.user_id,
    otp_hash = excluded.otp_hash,
    expires_at = excluded.expires_at,
    attempt_count = 0,
    resend_available_at = excluded.resend_available_at,
    consumed_at = null,
    updated_at = now();

  delete from public.admin_email_mfa_sessions
  where session_id = p_session_id;

  return jsonb_build_object('ok', true, 'retry_after', 60);
end;
$$;

create or replace function public.verify_admin_email_otp_challenge(
  p_user_id uuid,
  p_session_id uuid,
  p_otp_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge public.admin_email_otp_challenges%rowtype;
  v_attempts integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  select * into v_challenge
  from public.admin_email_otp_challenges
  where session_id = p_session_id
    and user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'OTP_NOT_FOUND');
  end if;

  if v_challenge.consumed_at is not null then
    return jsonb_build_object('ok', false, 'code', 'OTP_ALREADY_USED');
  end if;

  if v_challenge.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'OTP_EXPIRED');
  end if;

  if v_challenge.attempt_count >= 5 then
    return jsonb_build_object('ok', false, 'code', 'OTP_LOCKED');
  end if;

  if v_challenge.otp_hash <> p_otp_hash then
    v_attempts := v_challenge.attempt_count + 1;
    update public.admin_email_otp_challenges
    set attempt_count = v_attempts, updated_at = now()
    where session_id = p_session_id;

    if v_attempts >= 5 then
      return jsonb_build_object('ok', false, 'code', 'OTP_LOCKED', 'attempts_remaining', 0);
    end if;

    return jsonb_build_object('ok', false, 'code', 'OTP_INVALID', 'attempts_remaining', 5 - v_attempts);
  end if;

  update public.admin_email_otp_challenges
  set consumed_at = now(), updated_at = now()
  where session_id = p_session_id;

  if not exists (select 1 from public.admin_users where user_id = p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'ADMIN_REQUIRED');
  end if;

  insert into public.admin_email_mfa_sessions (session_id, user_id, verified_at, revoked_at)
  values (p_session_id, p_user_id, now(), null)
  on conflict (session_id) do update set
    user_id = excluded.user_id,
    verified_at = now(),
    revoked_at = null;

  return jsonb_build_object('ok', true, 'verified', true);
end;
$$;

revoke all on function public.create_admin_email_otp_challenge(uuid, uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.verify_admin_email_otp_challenge(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_admin_email_otp_challenge(uuid, uuid, text, timestamptz, timestamptz) to service_role;
grant execute on function public.verify_admin_email_otp_challenge(uuid, uuid, text) to service_role;

create or replace function public.is_admin_email_mfa_verified()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.role(), '') = 'service_role'
    or (
      auth.uid() is not null
      and nullif(auth.jwt() ->> 'session_id', '') is not null
      and exists (
        select 1 from public.admin_users
        where user_id = auth.uid()
      )
      and exists (
        select 1 from public.admin_email_mfa_sessions
        where user_id = auth.uid()
          and session_id::text = auth.jwt() ->> 'session_id'
          and revoked_at is null
      )
    );
$$;

revoke all on function public.is_admin_email_mfa_verified() from public;
grant execute on function public.is_admin_email_mfa_verified() to authenticated, service_role;

create or replace function public.is_snorky_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_email_mfa_verified();
$$;

revoke all on function public.is_snorky_admin() from public;
grant execute on function public.is_snorky_admin() to authenticated, service_role;

drop policy if exists "Admins insert point gear" on public.point_gear_items;
drop policy if exists "Admins update point gear" on public.point_gear_items;
drop policy if exists "Admins delete point gear" on public.point_gear_items;
drop policy if exists "Public reads active point gear" on public.point_gear_items;
create policy "Public reads active point gear" on public.point_gear_items for select
  using (is_active or public.is_snorky_admin());
create policy "Admins insert point gear" on public.point_gear_items for insert
  with check (public.is_snorky_admin());
create policy "Admins update point gear" on public.point_gear_items for update
  using (public.is_snorky_admin())
  with check (public.is_snorky_admin());
create policy "Admins delete point gear" on public.point_gear_items for delete
  using (public.is_snorky_admin());

drop policy if exists "Allow admin insert indoor centers" on public.indoor_diving_centers;
drop policy if exists "Allow admin update indoor centers" on public.indoor_diving_centers;
drop policy if exists "Allow admin delete indoor centers" on public.indoor_diving_centers;
drop policy if exists "Allow admin insert indoor center images" on public.indoor_center_images;
drop policy if exists "Allow admin update indoor center images" on public.indoor_center_images;
drop policy if exists "Allow admin delete indoor center images" on public.indoor_center_images;
create policy "Allow admin insert indoor centers" on public.indoor_diving_centers for insert
  with check (public.is_snorky_admin());
create policy "Allow admin update indoor centers" on public.indoor_diving_centers for update
  using (public.is_snorky_admin()) with check (public.is_snorky_admin());
create policy "Allow admin delete indoor centers" on public.indoor_diving_centers for delete
  using (public.is_snorky_admin());
create policy "Allow admin insert indoor center images" on public.indoor_center_images for insert
  with check (public.is_snorky_admin());
create policy "Allow admin update indoor center images" on public.indoor_center_images for update
  using (public.is_snorky_admin()) with check (public.is_snorky_admin());
create policy "Allow admin delete indoor center images" on public.indoor_center_images for delete
  using (public.is_snorky_admin());

drop policy if exists "app_settings_insert_admin" on public.app_settings;
drop policy if exists "app_settings_update_admin" on public.app_settings;
drop policy if exists "app_settings_delete_admin" on public.app_settings;
create policy "app_settings_insert_admin" on public.app_settings for insert to authenticated
  with check (public.is_snorky_admin());
create policy "app_settings_update_admin" on public.app_settings for update to authenticated
  using (public.is_snorky_admin()) with check (public.is_snorky_admin());
create policy "app_settings_delete_admin" on public.app_settings for delete to authenticated
  using (public.is_snorky_admin());

drop policy if exists "report_evidence_select_admin" on storage.objects;
create policy "report_evidence_select_admin" on storage.objects for select to authenticated
  using (bucket_id = 'report-evidence' and public.is_snorky_admin());

create or replace function public.get_admin_users(p_search text default null)
returns table (
  user_id uuid,
  email text,
  nickname text,
  status text,
  suspended_until timestamptz,
  banned boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_snorky_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return query
  select
    u.id::uuid,
    u.email::text,
    p.custom_nickname::text,
    (case
      when coalesce(p.banned, false) then 'PERMANENT_BAN'
      when p.suspended_until is not null and p.suspended_until > now() then 'SUSPENDED'
      when a.action_type = 'WARNING' then 'WARNING'
      else 'ACTIVE'
    end)::text,
    p.suspended_until::timestamptz,
    coalesce(p.banned, false)::boolean,
    u.created_at::timestamptz
  from auth.users u
  left join public.user_profiles p on p.provider_user_id = u.id::text
  left join lateral (
    select aua.action_type
    from public.admin_user_actions aua
    where aua.user_id = u.id
    order by aua.created_at desc
    limit 1
  ) a on true
  where p_search is null
     or u.id::text ilike '%' || p_search || '%'
     or coalesce(u.email, '')::text ilike '%' || p_search || '%'
     or coalesce(p.custom_nickname, '')::text ilike '%' || p_search || '%'
  order by u.created_at desc;
end;
$$;

create or replace function public.moderate_user_direct(p_user_id uuid, p_action_type text, p_action_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_until timestamptz;
begin
  if not public.is_snorky_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_action_type not in ('WARNING','SUSPEND_3_DAYS','SUSPEND_7_DAYS','SUSPEND_30_DAYS','PERMANENT_BAN','CLEAR') then
    raise exception 'INVALID_ACTION';
  end if;
  v_until := case p_action_type when 'SUSPEND_3_DAYS' then now() + interval '3 days' when 'SUSPEND_7_DAYS' then now() + interval '7 days' when 'SUSPEND_30_DAYS' then now() + interval '30 days' else null end;
  update public.user_profiles set banned = (p_action_type = 'PERMANENT_BAN'), suspended_until = v_until, updated_at = now() where provider_user_id = p_user_id::text;
  if not found then raise exception 'USER_PROFILE_NOT_FOUND'; end if;
  insert into public.admin_user_actions(user_id, action_type, action_reason, created_by) values (p_user_id, p_action_type, p_action_reason, auth.uid());
  return jsonb_build_object('user_id', p_user_id, 'action_type', p_action_type, 'reason', p_action_reason);
end;
$$;

revoke all on function public.get_admin_users(text) from public;
revoke all on function public.moderate_user_direct(uuid, text, text) from public;
grant execute on function public.get_admin_users(text) to authenticated;
grant execute on function public.moderate_user_direct(uuid, text, text) to authenticated;
