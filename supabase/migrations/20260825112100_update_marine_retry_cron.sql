-- ==============================================================================
-- Migration: Update Marine Retry-45 Cron Schedule
-- Date: 2026-08-25
-- ==============================================================================

do $$
declare
  existing_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into existing_job from cron.job where jobname = 'snorky-open-meteo-marine-retry-45';
    if existing_job is not null then
      perform cron.unschedule(existing_job);
    end if;

    perform cron.schedule(
      'snorky-open-meteo-marine-retry-45',
      '45 0,6,12,18 * * *',
      $job$
        select net.http_post(
          url:='https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/open-meteo-marine-refresh',
          headers:=jsonb_build_object(
            'Content-Type','application/json',
            'x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='open_meteo_marine_scheduler_token')
          ),
          body:='{"source":"supabase-cron","retry":"+45"}'::jsonb,
          timeout_milliseconds:=120000
        );
      $job$
    );
  end if;
end $$;
