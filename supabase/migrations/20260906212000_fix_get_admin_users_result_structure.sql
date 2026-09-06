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

revoke all on function public.get_admin_users(text) from public;
grant execute on function public.get_admin_users(text) to authenticated;
