-- Ended buddy history is retained for seven full days after event_date.
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.cleanup_expired_buddy_history()
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  -- Remove terminal application history independently while its post exists.
  delete from public.buddy_applications as application
  using public.buddy_posts as post
  where application.buddy_post_id = post.id
    and application.status in ('CANCELED', 'REJECTED')
    and post.event_date < current_date - 7;

  -- Applications still attached to these posts are removed by ON DELETE CASCADE.
  delete from public.buddy_posts
  where event_date < current_date - 7;
end;
$function$;

revoke all on function public.cleanup_expired_buddy_history() from public, anon, authenticated;
grant execute on function public.cleanup_expired_buddy_history() to service_role;

do $schedule$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'cleanup-expired-buddy-history-daily'
  ) then
    perform cron.schedule(
      'cleanup-expired-buddy-history-daily',
      '23 18 * * *',
      'select public.cleanup_expired_buddy_history();'
    );
  end if;
end
$schedule$;
