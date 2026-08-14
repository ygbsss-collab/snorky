-- Run manually in the Supabase SQL Editor. This does not alter existing tables or policies.
create table if not exists public.point_ratings (
  id uuid primary key default gen_random_uuid(),
  point_id text not null,
  client_id text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint point_ratings_point_client_unique unique (point_id, client_id)
);

create index if not exists point_ratings_point_id_idx
  on public.point_ratings (point_id);

alter table public.point_ratings enable row level security;

drop policy if exists "point ratings are publicly readable" on public.point_ratings;
create policy "point ratings are publicly readable"
  on public.point_ratings for select
  to anon, authenticated
  using (true);

drop policy if exists "point ratings can be inserted" on public.point_ratings;
create policy "point ratings can be inserted"
  on public.point_ratings for insert
  to anon, authenticated
  with check (
    char_length(client_id) between 16 and 128
    and char_length(point_id) between 1 and 200
    and rating between 1 and 5
  );

drop policy if exists "point ratings can be updated" on public.point_ratings;
create policy "point ratings can be updated"
  on public.point_ratings for update
  to anon, authenticated
  using (true)
  with check (
    char_length(client_id) between 16 and 128
    and char_length(point_id) between 1 and 200
    and rating between 1 and 5
  );

grant select, insert, update on public.point_ratings to anon, authenticated;

comment on table public.point_ratings is
  'Anonymous browser-scoped point ratings. client_id is not an authentication credential.';
