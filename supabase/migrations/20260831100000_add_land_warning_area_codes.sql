begin;

alter table public.regions add column if not exists land_warning_area_code text;
alter table public.points add column if not exists land_warning_area_code text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'regions_land_warning_area_code_format'
      and conrelid = 'public.regions'::regclass
  ) then
    alter table public.regions
      add constraint regions_land_warning_area_code_format
      check (land_warning_area_code is null or land_warning_area_code ~ '^L[0-9]{7}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'points_land_warning_area_code_format'
      and conrelid = 'public.points'::regclass
  ) then
    alter table public.points
      add constraint points_land_warning_area_code_format
      check (land_warning_area_code is null or land_warning_area_code ~ '^L[0-9]{7}$');
  end if;
end $$;

create or replace function public.inherit_point_land_warning_area_code()
returns trigger language plpgsql set search_path = public as $$
begin
  select land_warning_area_code
    into new.land_warning_area_code
    from public.regions
   where id = new.region_id;
  return new;
end;
$$;

drop trigger if exists points_inherit_land_warning_area_code on public.points;
create trigger points_inherit_land_warning_area_code
before insert or update of region_id, land_warning_area_code on public.points
for each row execute function public.inherit_point_land_warning_area_code();

create or replace function public.propagate_region_land_warning_area_code()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.points
     set land_warning_area_code = new.land_warning_area_code
   where region_id = new.id
     and land_warning_area_code is distinct from new.land_warning_area_code;
  return new;
end;
$$;

drop trigger if exists regions_propagate_land_warning_area_code on public.regions;
create trigger regions_propagate_land_warning_area_code
after update of land_warning_area_code on public.regions
for each row execute function public.propagate_region_land_warning_area_code();

update public.points p
   set land_warning_area_code = r.land_warning_area_code
  from public.regions r
 where p.region_id = r.id
   and p.land_warning_area_code is null
   and r.land_warning_area_code is not null;

create index if not exists points_land_warning_area_code_idx
  on public.points(land_warning_area_code);
create index if not exists regions_land_warning_area_code_idx
  on public.regions(land_warning_area_code);

comment on column public.regions.land_warning_area_code is
  'Official KMA land warning REG_ID inherited automatically by points in this region';
comment on column public.points.land_warning_area_code is
  'Official KMA land warning REG_ID; populated automatically from the owning region';

commit;
