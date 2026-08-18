do $$
declare owner_a uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid();
begin
  if not exists(select 1 from cron.job where jobname='snorky-open-meteo-marine-refresh' and active and schedule='30 0,6,12,18 * * *') then
    raise exception 'Marine scheduler missing, disabled, or misconfigured';
  end if;
  if not exists(select 1 from vault.secrets where name='open_meteo_marine_scheduler_token') then
    raise exception 'Marine scheduler Vault token missing';
  end if;
  if not acquire_open_meteo_marine_lease(owner_a,600) then raise exception 'Initial lease acquisition failed'; end if;
  if acquire_open_meteo_marine_lease(owner_b,600) then raise exception 'Concurrent lease was not blocked'; end if;
  if not release_open_meteo_marine_lease(owner_a) then raise exception 'Lease release failed'; end if;
  update open_meteo_marine_refresh_lease set lease_until=now()-interval '1 second' where lock_name='marine-refresh';
  if not acquire_open_meteo_marine_lease(owner_b,600) then raise exception 'Expired lease recovery failed'; end if;
  perform release_open_meteo_marine_lease(owner_b);
end $$;
