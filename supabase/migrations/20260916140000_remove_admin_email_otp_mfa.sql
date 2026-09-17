-- 관리자 이메일 OTP 기능 제거: 기존 admin_users 권한 구조로 복구
create or replace function public.is_snorky_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.role(), '') = 'service_role'
    or exists (
      select 1 from public.admin_users
      where user_id = auth.uid()
    );
$$;

revoke all on function public.is_snorky_admin() from public;
grant execute on function public.is_snorky_admin() to authenticated, service_role;

drop function if exists public.is_admin_email_mfa_verified();
drop function if exists public.create_admin_email_otp_challenge(uuid, uuid, text, timestamptz, timestamptz);
drop function if exists public.verify_admin_email_otp_challenge(uuid, uuid, text);

drop table if exists public.admin_email_otp_challenges;
drop table if exists public.admin_email_mfa_sessions;

drop policy if exists "Public reads active point gear" on public.point_gear_items;
create policy "Public reads active point gear" on public.point_gear_items for select
  using (is_active or exists (select 1 from public.admin_users where user_id = auth.uid()));
drop policy if exists "Admins insert point gear" on public.point_gear_items;
create policy "Admins insert point gear" on public.point_gear_items for insert
  with check (exists (select 1 from public.admin_users where user_id = auth.uid()));
drop policy if exists "Admins update point gear" on public.point_gear_items;
create policy "Admins update point gear" on public.point_gear_items for update
  using (exists (select 1 from public.admin_users where user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users where user_id = auth.uid()));
drop policy if exists "Admins delete point gear" on public.point_gear_items;
create policy "Admins delete point gear" on public.point_gear_items for delete
  using (exists (select 1 from public.admin_users where user_id = auth.uid()));

drop policy if exists "Allow admin insert indoor centers" on public.indoor_diving_centers;
create policy "Allow admin insert indoor centers" on public.indoor_diving_centers for insert
  with check (auth.uid() in (select user_id from public.admin_users));
drop policy if exists "Allow admin update indoor centers" on public.indoor_diving_centers;
create policy "Allow admin update indoor centers" on public.indoor_diving_centers for update
  using (auth.uid() in (select user_id from public.admin_users));
drop policy if exists "Allow admin delete indoor centers" on public.indoor_diving_centers;
create policy "Allow admin delete indoor centers" on public.indoor_diving_centers for delete
  using (auth.uid() in (select user_id from public.admin_users));
drop policy if exists "Allow admin insert indoor center images" on public.indoor_center_images;
create policy "Allow admin insert indoor center images" on public.indoor_center_images for insert
  with check (auth.uid() in (select user_id from public.admin_users));
drop policy if exists "Allow admin update indoor center images" on public.indoor_center_images;
create policy "Allow admin update indoor center images" on public.indoor_center_images for update
  using (auth.uid() in (select user_id from public.admin_users));
drop policy if exists "Allow admin delete indoor center images" on public.indoor_center_images;
create policy "Allow admin delete indoor center images" on public.indoor_center_images for delete
  using (auth.uid() in (select user_id from public.admin_users));

drop policy if exists "app_settings_insert_admin" on public.app_settings;
create policy "app_settings_insert_admin" on public.app_settings for insert to authenticated
  with check (exists (select 1 from public.admin_users where user_id = auth.uid()));
drop policy if exists "app_settings_update_admin" on public.app_settings;
create policy "app_settings_update_admin" on public.app_settings for update to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users where user_id = auth.uid()));
drop policy if exists "app_settings_delete_admin" on public.app_settings;
create policy "app_settings_delete_admin" on public.app_settings for delete to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid()));

drop policy if exists "report_evidence_select_admin" on storage.objects;
create policy "report_evidence_select_admin" on storage.objects for select to authenticated
  using (
    bucket_id = 'report-evidence'
    and exists (select 1 from public.admin_users where user_id = auth.uid())
  );

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
  if not exists (select 1 from public.admin_users where admin_users.user_id = auth.uid()) then
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
  if not exists (select 1 from public.admin_users where admin_users.user_id = auth.uid()) then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_action_type not in ('WARNING','SUSPEND_3_DAYS','SUSPEND_7_DAYS','SUSPEND_30_DAYS','PERMANENT_BAN','CLEAR') then
    raise exception 'INVALID_ACTION';
  end if;
  v_until := case p_action_type
    when 'SUSPEND_3_DAYS' then now() + interval '3 days'
    when 'SUSPEND_7_DAYS' then now() + interval '7 days'
    when 'SUSPEND_30_DAYS' then now() + interval '30 days'
    else null
  end;
  update public.user_profiles
  set banned = (p_action_type = 'PERMANENT_BAN'), suspended_until = v_until, updated_at = now()
  where provider_user_id = p_user_id::text;
  if not found then raise exception 'USER_PROFILE_NOT_FOUND'; end if;
  insert into public.admin_user_actions(user_id, action_type, action_reason, created_by)
  values (p_user_id, p_action_type, p_action_reason, auth.uid());
  return jsonb_build_object('user_id', p_user_id, 'action_type', p_action_type, 'reason', p_action_reason);
end;
$$;

revoke all on function public.get_admin_users(text) from public;
revoke all on function public.moderate_user_direct(uuid, text, text) from public;
grant execute on function public.get_admin_users(text) to authenticated;
grant execute on function public.moderate_user_direct(uuid, text, text) to authenticated;
