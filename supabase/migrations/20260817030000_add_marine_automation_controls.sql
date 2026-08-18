create extension if not exists pgcrypto;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

alter table public.open_meteo_api_usage
  add column if not exists refresh_runs integer not null default 0,
  add column if not exists http_requests integer not null default 0,
  add column if not exists batch_requests integer not null default 0,
  add column if not exists success_requests integer not null default 0,
  add column if not exists count_429 integer not null default 0,
  add column if not exists count_5xx integer not null default 0,
  add column if not exists timeout_count integer not null default 0;

create table if not exists public.open_meteo_marine_refresh_lease (
  lock_name text primary key,
  owner_id uuid not null,
  lease_until timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.open_meteo_marine_refresh_lease enable row level security;
revoke all on public.open_meteo_marine_refresh_lease from public, anon, authenticated;
grant select, insert, update, delete on public.open_meteo_marine_refresh_lease to service_role;

create or replace function public.acquire_open_meteo_marine_lease(p_owner uuid, p_lease_seconds integer default 600)
returns boolean language plpgsql security definer set search_path=public as $$
declare acquired boolean;
begin
  insert into open_meteo_marine_refresh_lease(lock_name,owner_id,lease_until,updated_at)
  values('marine-refresh',p_owner,now()+make_interval(secs=>greatest(60,least(p_lease_seconds,1800))),now())
  on conflict(lock_name) do update set owner_id=excluded.owner_id,lease_until=excluded.lease_until,updated_at=now()
  where open_meteo_marine_refresh_lease.lease_until < now()
     or open_meteo_marine_refresh_lease.owner_id=p_owner
  returning true into acquired;
  return coalesce(acquired,false);
end $$;

create or replace function public.release_open_meteo_marine_lease(p_owner uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare released boolean;
begin
  delete from open_meteo_marine_refresh_lease where lock_name='marine-refresh' and owner_id=p_owner returning true into released;
  return coalesce(released,false);
end $$;

do $$
begin
  if not exists(select 1 from vault.secrets where name='open_meteo_marine_scheduler_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'open_meteo_marine_scheduler_token','SNORKY server-only Marine scheduler token');
  end if;
end $$;

create or replace function public.validate_open_meteo_marine_scheduler_token(candidate text)
returns boolean language sql stable security definer set search_path=public,vault as $$
  select coalesce(candidate<>'' and exists(
    select 1 from vault.decrypted_secrets
    where name='open_meteo_marine_scheduler_token' and decrypted_secret=candidate
  ),false)
$$;

revoke all on function public.acquire_open_meteo_marine_lease(uuid,integer) from public,anon,authenticated;
revoke all on function public.release_open_meteo_marine_lease(uuid) from public,anon,authenticated;
revoke all on function public.validate_open_meteo_marine_scheduler_token(text) from public,anon,authenticated;
grant execute on function public.acquire_open_meteo_marine_lease(uuid,integer) to service_role;
grant execute on function public.release_open_meteo_marine_lease(uuid) to service_role;
grant execute on function public.validate_open_meteo_marine_scheduler_token(text) to service_role;
notify pgrst,'reload schema';
