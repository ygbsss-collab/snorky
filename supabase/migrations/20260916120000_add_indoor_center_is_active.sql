alter table public.indoor_diving_centers
  add column if not exists is_active boolean not null default false;
