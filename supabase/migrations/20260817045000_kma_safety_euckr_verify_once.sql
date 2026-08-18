do $$ declare rate jsonb;begin
rate:=public.kma_rate_limit_snapshot('warnings',1);
if coalesce((rate->>'safe')::boolean,false) is not true then raise exception 'KMA Safety EUC-KR verification blocked by usage guard';end if;
perform net.http_post(url:='https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-warnings',headers:=jsonb_build_object('Content-Type','application/json','x-scheduler-token',(select decrypted_secret from vault.decrypted_secrets where name='kma_automation_scheduler_token')),body:='{"source":"euc-kr-final-verify","once":true}'::jsonb,timeout_milliseconds:=30000);
end $$;
