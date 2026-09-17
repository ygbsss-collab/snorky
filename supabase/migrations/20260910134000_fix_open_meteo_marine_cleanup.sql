create or replace function public.cleanup_open_meteo_marine_cache()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count bigint;
begin
  -- Keep every forecast row belonging to the latest successful issue per cache key.
  with latest_issue as (
    select cache_key, max(issued_at) as issued_at
    from public.open_meteo_marine_cache
    where status = 'fresh'
    group by cache_key
  ), deleted as (
    delete from public.open_meteo_marine_cache c
    where c.fetched_at < now() - interval '3 days'
      and not exists (
        select 1
        from latest_issue l
        where l.cache_key = c.cache_key
          and l.issued_at = c.issued_at
      )
    returning 1
  )
  select count(*) into deleted_count from deleted;

  return deleted_count;
end;
$$;

do $$
declare
  existing_job bigint;
begin
  select jobid
  into existing_job
  from cron.job
  where jobname = 'snorky-open-meteo-marine-cleanup';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'snorky-open-meteo-marine-cleanup',
    '10 19 * * *',
    $job$
      select public.cleanup_open_meteo_marine_cache();
    $job$
  );
end;
$$;
