begin;

-- Official source:
-- Korea Meteorological Administration Weather Nuri warning-area GeoJSON
-- https://www.weather.go.kr/wgis-nuri/js/info/wrnArea.geojson
-- Dataset name verified at authoring time: 260601_wrnArea
do $$
declare
  mapping record;
  current_code text;
begin
  for mapping in
    select *
      from (values
        (1,  '강릉',   'L1022500'),
        (2,  '고성',   'L1022200'),
        (3,  '삼척',   'L1022000'),
        (4,  '영덕',   'L1072200'),
        (5,  '울진',   'L1073000'),
        (10, '포항',   'L1072400'),
        (11, '제주',   'L1090000'),
        (12, '동해',   'L1021900'),
        (13, '울산',   'L1160000'),
        (14, '서산',   'L1031300'),
        (15, '태안',   'L1031100'),
        (16, '울릉도', 'L1072100')
      ) as official(region_id, region_name, area_code)
  loop
    select land_warning_area_code
      into current_code
      from public.regions
     where id = mapping.region_id
       and name = mapping.region_name;

    if not found then
      raise exception 'Region identity mismatch for id %, expected name %',
        mapping.region_id, mapping.region_name;
    end if;

    if current_code is not null and current_code <> mapping.area_code then
      raise exception 'Existing land warning code mismatch for region %: %',
        mapping.region_name, current_code;
    end if;

    update public.regions
       set land_warning_area_code = mapping.area_code
     where id = mapping.region_id
       and name = mapping.region_name
       and land_warning_area_code is distinct from mapping.area_code;
  end loop;

  if exists (
    select 1
      from public.points p
      join public.regions r on r.id = p.region_id
     where r.land_warning_area_code is not null
       and p.land_warning_area_code is distinct from r.land_warning_area_code
  ) then
    raise exception 'Point land warning code inheritance verification failed';
  end if;
end;
$$;

commit;
