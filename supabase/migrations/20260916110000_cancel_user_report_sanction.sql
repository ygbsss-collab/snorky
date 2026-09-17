-- 신고 건별 제재 취소 및 현재 제재 상태 재계산

alter table public.user_moderation_actions
  drop constraint if exists user_moderation_actions_action_type_check;

alter table public.user_moderation_actions
  add constraint user_moderation_actions_action_type_check
  check (action_type in ('WARNING', 'SUSPEND_3_DAYS', 'SUSPEND_7_DAYS', 'SUSPEND_30_DAYS', 'PERMANENT_BAN', 'CLEAR'));

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

create or replace function public.get_current_user_moderation_action(p_user_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with profile_state as (
    select coalesce(p.banned, false) as banned, p.suspended_until
    from public.user_profiles p
    where p.provider_user_id = p_user_id
    limit 1
  ),
  clear_cutoff as (
    select max(a.created_at) as cleared_at
    from public.admin_user_actions a
    where a.user_id::text = p_user_id
      and a.action_type = 'CLEAR'
  ),
  active_actions as (
    select a.action_type, a.created_at
    from public.admin_user_actions a
    cross join profile_state p
    cross join clear_cutoff c
    where a.user_id::text = p_user_id
      and a.created_at > coalesce(c.cleared_at, '-infinity'::timestamptz)
      and (
        (p.banned and a.action_type = 'PERMANENT_BAN')
        or (
          not p.banned
          and p.suspended_until > now()
          and a.action_type in ('SUSPEND_3_DAYS', 'SUSPEND_7_DAYS', 'SUSPEND_30_DAYS')
          and a.created_at + case a.action_type
            when 'SUSPEND_3_DAYS' then interval '3 days'
            when 'SUSPEND_7_DAYS' then interval '7 days'
            when 'SUSPEND_30_DAYS' then interval '30 days'
          end > now()
        )
      )

    union all

    select a.action_type, a.created_at
    from public.user_moderation_actions a
    cross join profile_state p
    cross join clear_cutoff c
    where a.user_id = p_user_id
      and a.created_at > coalesce(c.cleared_at, '-infinity'::timestamptz)
      and not exists (
        select 1 from public.user_moderation_actions cancelled
        where cancelled.report_id = a.report_id
          and cancelled.action_type = 'CLEAR'
          and cancelled.created_at > a.created_at
      )
      and (
        (p.banned and a.action_type = 'PERMANENT_BAN')
        or (
          not p.banned
          and p.suspended_until > now()
          and a.action_type in ('SUSPEND_3_DAYS', 'SUSPEND_7_DAYS', 'SUSPEND_30_DAYS')
          and a.suspended_until > now()
        )
      )
  )
  select a.action_type
  from active_actions a
  order by a.created_at desc
  limit 1;
$$;

revoke all on function public.get_current_user_moderation_action(text) from public;
grant execute on function public.get_current_user_moderation_action(text) to anon, authenticated, service_role;
