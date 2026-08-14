begin;

alter table public.regions add column if not exists warning_area_code text;
alter table public.points add column if not exists warning_area_code text;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='regions_warning_area_code_format' and conrelid='public.regions'::regclass) then
    alter table public.regions add constraint regions_warning_area_code_format check (warning_area_code is null or warning_area_code ~ '^S[0-9]{7}$');
  end if;
  if not exists(select 1 from pg_constraint where conname='points_warning_area_code_format' and conrelid='public.points'::regclass) then
    alter table public.points add constraint points_warning_area_code_format check (warning_area_code is null or warning_area_code ~ '^S[0-9]{7}$');
  end if;
end $$;

-- One-time legacy backfill only. Runtime Safety never matches by region name.
update public.regions set warning_area_code=case name
  when '고성' then 'S1151100'
  when '강릉' then 'S1151200'
  when '삼척' then 'S1151300'
  when '울진' then 'S1131300'
  when '영덕' then 'S1131300'
  else warning_area_code end
where warning_area_code is null;

update public.points p set warning_area_code=r.warning_area_code
from public.regions r
where p.region_id=r.id and p.warning_area_code is null and r.warning_area_code is not null;

create or replace function public.inherit_point_warning_area_code()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.warning_area_code is null then
    select warning_area_code into new.warning_area_code from public.regions where id=new.region_id;
  end if;
  return new;
end;
$$;

do $$ begin
  if not exists(select 1 from pg_trigger where tgname='points_inherit_warning_area_code' and tgrelid='public.points'::regclass and not tgisinternal) then
    create trigger points_inherit_warning_area_code before insert or update of region_id,warning_area_code on public.points for each row execute function public.inherit_point_warning_area_code();
  end if;
end $$;

create index if not exists points_warning_area_code_idx on public.points(warning_area_code);
create index if not exists regions_warning_area_code_idx on public.regions(warning_area_code);

comment on column public.regions.warning_area_code is 'Default official KMA marine warning REG_ID for new points in this region';
comment on column public.points.warning_area_code is 'Official KMA marine warning REG_ID; authoritative Safety matching key';

commit;
