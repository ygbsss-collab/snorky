do $$
declare rate jsonb;
begin
  rate:=public.kma_rate_limit_snapshot('manual_first_fill',32);
  if coalesce((rate->>'safe')::boolean,false) is not true then
    raise exception 'KMA manual first-fill blocked by usage guard: %',rate;
  end if;
  perform net.http_post(
    url:='https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-weather-refresh',
    headers:=jsonb_build_object('Content-Type','application/json','x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='kma_automation_scheduler_token')),
    body:='{"source":"manual-first-fill","once":true}'::jsonb,
    timeout_milliseconds:=120000
  );
  perform net.http_post(
    url:='https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-warnings',
    headers:=jsonb_build_object('Content-Type','application/json','x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='kma_automation_scheduler_token')),
    body:='{"source":"manual-first-fill","once":true}'::jsonb,
    timeout_milliseconds:=30000
  );
end $$;
