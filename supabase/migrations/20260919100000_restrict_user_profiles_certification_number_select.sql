-- New user_profiles columns require an explicit SELECT grant for anon and authenticated.
do $$
declare
  v_select_columns text;
  v_role text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into v_select_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'user_profiles'
    and column_name <> 'certification_number';

  if v_select_columns is null then
    raise exception 'No selectable columns found for public.user_profiles';
  end if;

  revoke select on public.user_profiles from anon, authenticated;
  execute format(
    'grant select (%s) on public.user_profiles to anon, authenticated',
    v_select_columns
  );

  foreach v_role in array array['anon', 'authenticated'] loop
    if has_column_privilege(
      v_role,
      'public.user_profiles',
      'certification_number',
      'select'
    ) then
      raise exception 'Role % retains SELECT on public.user_profiles.certification_number', v_role;
    end if;

    if not has_column_privilege(
      v_role,
      'public.user_profiles',
      'provider_user_id',
      'select'
    ) then
      raise exception 'Role % lacks SELECT on public.user_profiles.provider_user_id', v_role;
    end if;
  end loop;
end $$;
