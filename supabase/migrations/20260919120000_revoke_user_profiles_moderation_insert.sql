revoke insert on public.user_profiles from anon, authenticated;

grant insert (
  activity_depth,
  activity_region,
  age_group,
  aida_level,
  avatar_type,
  bio,
  certification_organization,
  created_at,
  custom_avatar_url,
  custom_nickname,
  gender,
  id,
  provider,
  provider_user_id,
  updated_at
) on public.user_profiles to anon, authenticated;
