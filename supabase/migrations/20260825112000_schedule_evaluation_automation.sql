-- ==============================================================================
-- Migration: Schedule Evaluation Automation (pg_cron UTC schedules)
-- Date: 2026-08-25
-- Note: Existing cron jobs are completely preserved.
-- ==============================================================================

do $$
declare
  existing_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then

    -- 1. KMA RN1 Refresh (매시간 1차 +20분, 2차 +30분)
    select jobid into existing_job from cron.job where jobname = 'snorky-kma-rn1-refresh-20';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
      'snorky-kma-rn1-refresh-20',
      '20 * * * *',
      $job$
        select net.http_post(
          url:='https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-rn1-cache',
          headers:=jsonb_build_object(
            'Content-Type','application/json',
            'x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='kma_automation_scheduler_token')
          ),
          body:='{"source":"supabase-cron","slot":"20"}'::jsonb,
          timeout_milliseconds:=60000
        );
      $job$
    );

    select jobid into existing_job from cron.job where jobname = 'snorky-kma-rn1-refresh-30';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
      'snorky-kma-rn1-refresh-30',
      '30 * * * *',
      $job$
        select net.http_post(
          url:='https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-rn1-cache',
          headers:=jsonb_build_object(
            'Content-Type','application/json',
            'x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='kma_automation_scheduler_token')
          ),
          body:='{"source":"supabase-cron","slot":"30"}'::jsonb,
          timeout_milliseconds:=60000
        );
      $job$
    );

    -- 2. KMA Mid Weather Refresh (KST 06/18시 발표 후 +10/+15/+30 -> UTC 09, 21시)
    select jobid into existing_job from cron.job where jobname = 'snorky-kma-mid-refresh-10';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
      'snorky-kma-mid-refresh-10',
      '10 9,21 * * *',
      $job$
        select net.http_post(
          url:='https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-mid-weather-cache',
          headers:=jsonb_build_object(
            'Content-Type','application/json',
            'x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='kma_automation_scheduler_token')
          ),
          body:='{"source":"supabase-cron","slot":"10"}'::jsonb,
          timeout_milliseconds:=120000
        );
      $job$
    );

    select jobid into existing_job from cron.job where jobname = 'snorky-kma-mid-refresh-15';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
      'snorky-kma-mid-refresh-15',
      '15 9,21 * * *',
      $job$
        select net.http_post(
          url:='https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-mid-weather-cache',
          headers:=jsonb_build_object(
            'Content-Type','application/json',
            'x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='kma_automation_scheduler_token')
          ),
          body:='{"source":"supabase-cron","slot":"15"}'::jsonb,
          timeout_milliseconds:=120000
        );
      $job$
    );

    select jobid into existing_job from cron.job where jobname = 'snorky-kma-mid-refresh-30';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
      'snorky-kma-mid-refresh-30',
      '30 9,21 * * *',
      $job$
        select net.http_post(
          url:='https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-mid-weather-cache',
          headers:=jsonb_build_object(
            'Content-Type','application/json',
            'x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='kma_automation_scheduler_token')
          ),
          body:='{"source":"supabase-cron","slot":"30"}'::jsonb,
          timeout_milliseconds:=120000
        );
      $job$
    );

    -- 3. Open-Meteo Marine +45 재시도 cron (UTC 00:45, 06:45, 12:45, 18:45 -> 기존 30분 cron 직후 15분 뒤)
    select jobid into existing_job from cron.job where jobname = 'snorky-open-meteo-marine-retry-45';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
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

    -- 4. Open-Meteo Marine Cache Daily Cleanup (KST 04:10 -> 19:10 UTC)
    select jobid into existing_job from cron.job where jobname = 'snorky-open-meteo-marine-cleanup';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
      'snorky-open-meteo-marine-cleanup',
      '10 19 * * *',
      $job$
        delete from public.open_meteo_marine_cache
        where fetched_at < (timezone('utc'::text, now()) - interval '7 days')
          and id not in (
            select id from (
              select id, row_number() over (partition by point_id order by fetched_at desc) as rn
              from public.open_meteo_marine_cache
            ) sub where sub.rn = 1
          );
      $job$
    );

    -- 5. KST 00:00 날짜 전환 전 포인트 Result 일괄 재생성 (KST 00:01 -> 15:01 UTC)
    select jobid into existing_job from cron.job where jobname = 'snorky-daily-date-switch-refresh';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
      'snorky-daily-date-switch-refresh',
      '1 15 * * *',
      $job$
        select net.http_post(
          url:='https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/point-evaluation-refresh',
          headers:=jsonb_build_object(
            'Content-Type','application/json',
            'x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='kma_automation_scheduler_token')
          ),
          body:='{"source":"supabase-cron","reason":"daily-date-switch"}'::jsonb,
          timeout_milliseconds:=180000
        );
      $job$
    );

  end if;
end $$;
