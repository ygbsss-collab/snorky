-- report-evidence 정리용 전용 scheduler token 기반 일일 Cron 등록
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job bigint;
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'purge_report_evidence_scheduler_token'
  ) then
    raise exception 'Vault secret purge_report_evidence_scheduler_token is required';
  end if;

  select jobid
    into existing_job
  from cron.job
  where jobname = 'snorky-purge-report-evidence-daily';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'snorky-purge-report-evidence-daily',
    '0 18 * * *',
    $job$
      select net.http_post(
        url := 'https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/purge-report-evidence',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-scheduler-token', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'purge_report_evidence_scheduler_token'
          )
        ),
        body := '{"source":"supabase-cron"}'::jsonb,
        timeout_milliseconds := 120000
      );
    $job$
  );
end $$;
