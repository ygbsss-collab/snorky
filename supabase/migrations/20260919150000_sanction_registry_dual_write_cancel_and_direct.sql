-- Cancel and direct moderation sanction registry dual write

create or replace function public.cancel_user_report_sanction(p_report_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.user_reports%rowtype;
  v_action public.user_moderation_actions%rowtype;
  v_direct public.admin_user_actions%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_direct_until timestamptz;
  v_report_until timestamptz;
  v_suspended_until timestamptz;
  v_banned boolean := false;
begin
  if not public.is_snorky_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select * into v_report
  from public.user_reports
  where id = p_report_id
  for update;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;

  select * into v_action
  from public.user_moderation_actions
  where report_id = p_report_id
    and action_type in ('SUSPEND_3_DAYS', 'SUSPEND_7_DAYS', 'SUSPEND_30_DAYS', 'PERMANENT_BAN')
  order by created_at desc
  limit 1;
  if not found then raise exception 'REPORT_SANCTION_NOT_FOUND'; end if;

  perform 1
  from public.user_profiles
  where provider_user_id = v_action.user_id
  for update;
  if not found then raise exception 'MODERATION_PROFILE_NOT_FOUND'; end if;

  if exists (
    select 1
    from public.user_moderation_actions c
    where c.report_id = p_report_id
      and c.action_type = 'CLEAR'
      and c.created_at > v_action.created_at
  ) then
    raise exception 'REPORT_SANCTION_ALREADY_CLEARED';
  end if;

  insert into public.user_moderation_actions (
    user_id, report_id, action_type, reason, suspended_until, created_by
  ) values (
    v_action.user_id, p_report_id, 'CLEAR', '신고 건별 제재 취소', null, auth.uid()
  );

  select * into v_direct
  from public.admin_user_actions
  where user_id::text = v_action.user_id
  order by created_at desc
  limit 1;

  v_banned := coalesce(v_direct.action_type = 'PERMANENT_BAN', false)
    or exists (
      select 1
      from public.user_moderation_actions a
      where a.user_id = v_action.user_id
        and a.action_type = 'PERMANENT_BAN'
        and a.created_at > coalesce(v_direct.created_at, '-infinity'::timestamptz)
        and not exists (
          select 1 from public.user_moderation_actions c
          where c.report_id = a.report_id and c.action_type = 'CLEAR' and c.created_at > a.created_at
        )
    );

  v_direct_until := case v_direct.action_type
    when 'SUSPEND_3_DAYS' then v_direct.created_at + interval '3 days'
    when 'SUSPEND_7_DAYS' then v_direct.created_at + interval '7 days'
    when 'SUSPEND_30_DAYS' then v_direct.created_at + interval '30 days'
    else null
  end;
  if v_direct_until <= v_now then v_direct_until := null; end if;

  select max(a.suspended_until) into v_report_until
  from public.user_moderation_actions a
  where a.user_id = v_action.user_id
    and a.action_type in ('SUSPEND_3_DAYS', 'SUSPEND_7_DAYS', 'SUSPEND_30_DAYS')
    and a.created_at > coalesce(v_direct.created_at, '-infinity'::timestamptz)
    and a.suspended_until > v_now
    and not exists (
      select 1 from public.user_moderation_actions c
      where c.report_id = a.report_id and c.action_type = 'CLEAR' and c.created_at > a.created_at
    );

  v_suspended_until := case
    when v_direct_until is null then v_report_until
    when v_report_until is null then v_direct_until
    else greatest(v_direct_until, v_report_until)
  end;

  update public.user_profiles
  set banned = v_banned,
      suspended_until = v_suspended_until,
      updated_at = v_now
  where provider_user_id = v_action.user_id;
  if not found then raise exception 'MODERATION_PROFILE_NOT_FOUND'; end if;

  insert into public.user_sanction_registry (provider, provider_user_id, banned, suspended_until, updated_at)
  values ('kakao', v_action.user_id, v_banned, v_suspended_until, v_now)
  on conflict (provider, provider_user_id) do update
  set banned = v_banned, suspended_until = v_suspended_until, updated_at = v_now;

  insert into public.user_notifications (user_id, type, title, content, link_url)
  values (
    v_action.user_id,
    'moderation_cleared',
    '이용 제재 해제 안내',
    '적용되었던 이용 제재가 해제되었습니다.',
    './mypage.html'
  );

  return jsonb_build_object(
    'report_id', p_report_id,
    'action_type', v_action.action_type,
    'banned', v_banned,
    'suspended_until', v_suspended_until,
    'cleared_at', v_now
  );
end;
$$;

revoke all on function public.cancel_user_report_sanction(bigint) from public;
grant execute on function public.cancel_user_report_sanction(bigint) to authenticated, service_role;

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
  insert into public.user_sanction_registry (provider, provider_user_id, banned, suspended_until, updated_at)
  values ('kakao', p_user_id::text, p_action_type = 'PERMANENT_BAN', v_until, now())
  on conflict (provider, provider_user_id) do update
  set banned = (p_action_type = 'PERMANENT_BAN'), suspended_until = v_until, updated_at = now();
  insert into public.admin_user_actions(user_id, action_type, action_reason, created_by)
  values (p_user_id, p_action_type, p_action_reason, auth.uid());
  return jsonb_build_object('user_id', p_user_id, 'action_type', p_action_type, 'reason', p_action_reason);
end;
$$;

revoke all on function public.moderate_user_direct(uuid, text, text) from public;
grant execute on function public.moderate_user_direct(uuid, text, text) to authenticated;
