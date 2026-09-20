create or replace function public.enforce_user_posting_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_banned boolean;
  v_suspended_until timestamptz;
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_snorky_admin() then return new; end if;
  v_user_id := case tg_table_name
    when 'buddy_posts' then to_jsonb(new) ->> 'user_id'
    when 'buddy_applications' then to_jsonb(new) ->> 'applicant_user_id'
    when 'snorky_friends' then to_jsonb(new) ->> 'user_id'
    else null
  end;

  select banned, suspended_until into v_banned, v_suspended_until
  from public.user_profiles
  where provider_user_id = v_user_id
  order by (provider = 'kakao') desc, id desc
  limit 1;

  if coalesce(v_banned, false) then raise exception 'ACCOUNT_BANNED'; end if;
  if v_suspended_until is not null and v_suspended_until > timezone('utc'::text, now()) then
    raise exception 'ACCOUNT_SUSPENDED_UNTIL:%', v_suspended_until;
  end if;
  return new;
end;
$$;

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
