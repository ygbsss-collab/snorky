do $$ declare j bigint; begin
select jobid into j from cron.job where jobname='snorky-kma-weather-refresh';if j is not null then perform cron.unschedule(j);end if;
perform cron.schedule('snorky-kma-weather-refresh','15 2,5,8,11,14,17,20,23 * * *',$q$select net.http_post(url:='https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-weather-refresh',headers:=jsonb_build_object('Content-Type','application/json','x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='kma_automation_scheduler_token')),body:='{"source":"supabase-cron"}'::jsonb,timeout_milliseconds:=120000);$q$);
select jobid into j from cron.job where jobname='snorky-kma-safety-refresh';if j is not null then perform cron.unschedule(j);end if;
perform cron.schedule('snorky-kma-safety-refresh','*/5 * * * *',$q$select net.http_post(url:='https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-warnings',headers:=jsonb_build_object('Content-Type','application/json','x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='kma_automation_scheduler_token')),body:='{"source":"supabase-cron"}'::jsonb,timeout_milliseconds:=30000);$q$);
end $$;
