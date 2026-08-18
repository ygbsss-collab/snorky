do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='snorky-open-meteo-marine-refresh';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'snorky-open-meteo-marine-refresh',
    '30 0,6,12,18 * * *',
    $job$
      select net.http_post(
        url:='https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/open-meteo-marine-refresh',
        headers:=jsonb_build_object(
          'Content-Type','application/json',
          'x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='open_meteo_marine_scheduler_token')
        ),
        body:='{"source":"supabase-cron"}'::jsonb,
        timeout_milliseconds:=120000
      );
    $job$
  );
end $$;
