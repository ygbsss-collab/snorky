select net.http_post(
  url:='https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-warnings',
  headers:=jsonb_build_object(
    'Content-Type','application/json',
    'x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='kma_automation_scheduler_token')
  ),
  body:='{"source":"manual-verify-deploy"}'::jsonb,
  timeout_milliseconds:=30000
);
