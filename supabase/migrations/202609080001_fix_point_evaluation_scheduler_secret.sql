-- Re-register point evaluation cron jobs with the existing Vault secret.
do $$
declare
  existing_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into existing_job
    from cron.job
    where jobname = 'snorky-daily-date-switch-refresh';
    if existing_job is not null then
      perform cron.unschedule(existing_job);
    end if;

    perform cron.schedule(
      'snorky-daily-date-switch-refresh',
      '3 15 * * *',
      $job$
        with point_count as (
          select count(*)::integer as total_points from public.points
        ), chunks as (
          select generate_series(0, ((total_points + 7) / 8) - 1) as batch_index
          from point_count
        )
        select net.http_post(
          url:='https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/point-evaluation-refresh',
          headers:=jsonb_build_object(
            'Content-Type','application/json',
            'x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='kma_automation_scheduler_token')
          ),
          body:=jsonb_build_object(
            'source','supabase-cron',
            'reason','daily-date-switch',
            'batch_index',batch_index,
            'batch_size',8
          ),
          timeout_milliseconds:=180000
        )
        from chunks;
      $job$
    );

    select jobid into existing_job
    from cron.job
    where jobname = 'snorky-periodic-point-evaluation-refresh';
    if existing_job is not null then
      perform cron.unschedule(existing_job);
    end if;

    perform cron.schedule(
      'snorky-periodic-point-evaluation-refresh',
      '55 0,6,12,18 * * *',
      $job$
        with point_count as (
          select count(*)::integer as total_points from public.points
        ), chunks as (
          select generate_series(0, ((total_points + 7) / 8) - 1) as batch_index
          from point_count
        )
        select net.http_post(
          url:='https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/point-evaluation-refresh',
          headers:=jsonb_build_object(
            'Content-Type','application/json',
            'x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='kma_automation_scheduler_token')
          ),
          body:=jsonb_build_object(
            'source','supabase-cron',
            'reason','periodic-after-source-refresh',
            'batch_index',batch_index,
            'batch_size',8
          ),
          timeout_milliseconds:=180000
        )
        from chunks;
      $job$
    );
  end if;
end $$;
