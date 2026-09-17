-- 현재 활성 제재의 실제 action_type 조회

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
