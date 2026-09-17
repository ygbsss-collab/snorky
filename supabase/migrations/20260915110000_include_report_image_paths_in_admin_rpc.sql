create or replace function public.get_user_reports_admin()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_snorky_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'target_user_id', r.target_user_id, 'target_nickname', r.target_nickname,
    'reporter_user_id', r.reporter_user_id, 'reporter_nickname', r.reporter_nickname,
    'reason', r.reason, 'details', r.details, 'buddy_post_id', r.buddy_post_id,
    'status', r.status, 'action_type', r.action_type, 'action_reason', r.action_reason,
    'reported_at', r.reported_at, 'reviewed_at', r.reviewed_at, 'reviewed_by', r.reviewed_by,
    'image_paths', r.image_paths
  ) order by r.reported_at desc), '[]'::jsonb) from public.user_reports r);
end;
$$;
