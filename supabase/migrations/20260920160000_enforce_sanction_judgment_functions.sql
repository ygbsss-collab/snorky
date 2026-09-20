create or replace function public.enforce_user_posting_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_banned boolean;
  v_suspended_until timestamptz;
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_snorky_admin() then return new; end if;
  v_user_id := case tg_table_name
    when 'buddy_posts' then to_jsonb(new) ->> 'user_id'
    when 'buddy_applications' then to_jsonb(new) ->> 'applicant_user_id'
    when 'snorky_friends' then to_jsonb(new) ->> 'user_id'
    else null
  end;

  select banned, suspended_until into v_banned, v_suspended_until
  from public.user_sanction_registry
  where provider = 'kakao'
    and provider_user_id = v_user_id;

  if coalesce(v_banned, false) then raise exception 'ACCOUNT_BANNED'; end if;
  if v_suspended_until is not null and v_suspended_until > timezone('utc'::text, now()) then
    raise exception 'ACCOUNT_SUSPENDED_UNTIL:%', v_suspended_until;
  end if;
  return new;
end;
$$;

create or replace function public.get_current_user_moderation_action(p_user_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when r.banned then 'PERMANENT_BAN'
    when r.suspended_until > now() then
      greatest(1, ceil(extract(epoch from (r.suspended_until - now())) / 86400)::integer)::text
      || '일 정지 (' || to_char(r.suspended_until at time zone 'Asia/Seoul', 'YYYY-MM-DD') || '까지)'
    else null
  end
  from public.user_sanction_registry r
  where r.provider = 'kakao'
    and r.provider_user_id = p_user_id;
$$;

revoke all on function public.get_current_user_moderation_action(text) from public;
grant execute on function public.get_current_user_moderation_action(text) to anon, authenticated, service_role;
