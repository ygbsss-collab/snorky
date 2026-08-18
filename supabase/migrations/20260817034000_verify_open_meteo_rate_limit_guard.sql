do $$
declare snapshot jsonb; count429 integer;
begin
  snapshot:=open_meteo_rate_limit_snapshot(0);
  select coalesce(count_429,0) into count429 from open_meteo_api_usage where provider='open_meteo_marine' and usage_date=current_date;
  if coalesce((snapshot->>'safe')::boolean,false) is not true then raise exception 'Current Open-Meteo rate status is not safe'; end if;
  raise warning 'OPEN_METEO_RATE_SNAPSHOT=% HTTP_429_COUNT=%',snapshot,coalesce(count429,0);
end $$;
