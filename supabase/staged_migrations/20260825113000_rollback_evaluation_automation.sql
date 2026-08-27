-- ==============================================================================
-- Rollback Migration: Rollback Evaluation Automation
-- Date: 2026-08-25
-- Note: Safely unschedules ONLY newly added cron jobs. Existing jobs are preserved.
-- ==============================================================================

do $$
declare
  j bigint;
  job_names text[] := array[
    'snorky-kma-rn1-refresh-20',
    'snorky-kma-rn1-refresh-30',
    'snorky-kma-mid-refresh-10',
    'snorky-kma-mid-refresh-15',
    'snorky-kma-mid-refresh-30',
    'snorky-open-meteo-marine-retry-45',
    'snorky-open-meteo-marine-cleanup',
    'snorky-daily-date-switch-refresh'
  ];
  target_name text;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    foreach target_name in array job_names loop
      select jobid into j from cron.job where jobname = target_name;
      if j is not null then
        perform cron.unschedule(j);
      end if;
    end loop;
  end if;
end $$;

-- Drop trigger & tables
drop trigger if exists trg_points_profile_updated on public.points;
drop function if exists public.handle_point_profile_updated();

drop table if exists public.point_evaluation_results cascade;
drop table if exists public.kma_mid_weather_cache cascade;
drop table if exists public.kasi_sun_times_cache cascade;
drop table if exists public.kma_rn1_cache cascade;

notify pgrst, 'reload schema';
