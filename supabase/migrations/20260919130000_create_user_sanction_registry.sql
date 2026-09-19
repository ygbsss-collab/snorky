create table public.user_sanction_registry (
  provider text not null default 'kakao',
  provider_user_id text not null,
  banned boolean not null default false,
  suspended_until timestamptz,
  withdrawn_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (provider, provider_user_id),
  check (purge_after is null or withdrawn_at is not null)
);

create index idx_user_sanction_registry_purge_after
  on public.user_sanction_registry (purge_after)
  where purge_after is not null;

alter table public.user_sanction_registry enable row level security;
revoke all on public.user_sanction_registry from anon, authenticated;
grant all on public.user_sanction_registry to service_role;

insert into public.user_sanction_registry (
  provider, provider_user_id, banned, suspended_until
)
select provider, provider_user_id, banned, suspended_until
from public.user_profiles
where banned = true or suspended_until is not null
on conflict (provider, provider_user_id) do nothing;

do $$
declare
  v_source_count bigint;
  v_registry_count bigint;
begin
  select count(*) into v_source_count
  from public.user_profiles
  where banned = true or suspended_until is not null;

  select count(*) into v_registry_count
  from public.user_sanction_registry;

  if v_registry_count <> v_source_count then
    raise exception 'USER_SANCTION_REGISTRY_BACKFILL_COUNT_MISMATCH';
  end if;

  if has_table_privilege('anon', 'public.user_sanction_registry', 'select')
     or has_table_privilege('authenticated', 'public.user_sanction_registry', 'select') then
    raise exception 'USER_SANCTION_REGISTRY_PUBLIC_PRIVILEGE_PRESENT';
  end if;
end;
$$;
