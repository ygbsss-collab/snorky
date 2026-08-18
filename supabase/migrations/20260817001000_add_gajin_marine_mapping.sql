do $$
declare
  matched_count integer;
begin
  select count(*) into matched_count
    from public.points
   where id = 14
     and name = '가진해변'
     and abs(lat - 38.373191067146) < 0.000000001
     and abs(lng - 128.509633744093) < 0.000000001
     and warning_area_code = 'S1151100';

  if matched_count <> 1 then
    raise exception 'Gajin point identity or existing warning area does not match';
  end if;

  if exists (select 1 from public.point_marine_source_mapping where point_id = 14) then
    raise exception 'Gajin marine mapping already exists; refusing to overwrite';
  end if;

  insert into public.point_marine_source_mapping (
    point_id,
    kma_grid,
    khoa_wave_grid,
    khoa_current_station,
    khoa_tide_station,
    warning_area_code,
    mapping_source,
    mapping_notes
  ) values (
    14,
    '86:145',
    'GR3_G1E41_K',
    null,
    null,
    'S1151100',
    'partial',
    'KMA grid calculated with the official DFS conversion; KHOA wave grid verified from the official level-3 grid workbook. Current and tide stations remain unmapped.'
  );
end $$;
