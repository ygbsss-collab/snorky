create or replace function public.is_snorky_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function public.is_snorky_admin() from public;
grant execute on function public.is_snorky_admin() to authenticated, service_role;

create or replace function public.get_user_reports_admin()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_snorky_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'target_user_id', r.target_user_id,
        'target_nickname', r.target_nickname,
        'reporter_user_id', r.reporter_user_id,
        'reporter_nickname', r.reporter_nickname,
        'reason', r.reason,
        'details', r.details,
        'buddy_post_id', r.buddy_post_id,
        'status', r.status,
        'action_type', r.action_type,
        'action_reason', r.action_reason,
        'reported_at', r.reported_at,
        'reviewed_at', r.reviewed_at,
        'reviewed_by', r.reviewed_by
      ) order by r.reported_at desc
    ), '[]'::jsonb)
    from public.user_reports r
  );
end;
$$;

revoke all on function public.get_user_reports_admin() from public;
grant execute on function public.get_user_reports_admin() to authenticated, service_role;

-- user_reports RLS 및 grant 확인
alter table public.user_reports enable row level security;
grant select, update on public.user_reports to authenticated;
grant all on public.user_reports to service_role;
