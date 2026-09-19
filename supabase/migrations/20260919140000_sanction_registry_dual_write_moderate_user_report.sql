-- Report moderation sanction registry dual write

create or replace function public.moderate_user_report(
  p_report_id bigint,
  p_status text,
  p_action_type text default null,
  p_action_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.user_reports%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_suspended_until timestamptz;
  v_action_content text;
  v_profile_found boolean;
begin
  if not public.is_snorky_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_status not in ('PENDING', 'REVIEWED', 'ACTIONED', 'DISMISSED') then raise exception 'INVALID_REPORT_STATUS'; end if;
  if p_action_type is not null and p_action_type not in ('WARNING', 'SUSPEND_3_DAYS', 'SUSPEND_7_DAYS', 'SUSPEND_30_DAYS', 'PERMANENT_BAN') then
    raise exception 'INVALID_ACTION_TYPE';
  end if;

  select * into v_report from public.user_reports where id = p_report_id for update;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;

  if p_action_type is not null then
    p_status := 'ACTIONED';
    v_suspended_until := case p_action_type
      when 'SUSPEND_3_DAYS' then v_now + interval '3 days'
      when 'SUSPEND_7_DAYS' then v_now + interval '7 days'
      when 'SUSPEND_30_DAYS' then v_now + interval '30 days'
      else null
    end;

    if p_action_type = 'PERMANENT_BAN' then
      update public.user_profiles
      set banned = true, suspended_until = null, updated_at = v_now
      where provider_user_id = v_report.target_user_id;
      v_profile_found := found;
      insert into public.user_sanction_registry (provider, provider_user_id, banned, suspended_until, updated_at)
      values ('kakao', v_report.target_user_id, true, null, v_now)
      on conflict (provider, provider_user_id) do update
      set banned = true, suspended_until = null, updated_at = v_now;
    elsif v_suspended_until is not null then
      update public.user_profiles
      set suspended_until = greatest(coalesce(suspended_until, v_suspended_until), v_suspended_until), updated_at = v_now
      where provider_user_id = v_report.target_user_id;
      v_profile_found := found;
      insert into public.user_sanction_registry (provider, provider_user_id, banned, suspended_until, updated_at)
      values ('kakao', v_report.target_user_id, false, v_suspended_until, v_now)
      on conflict (provider, provider_user_id) do update
      set suspended_until = greatest(coalesce(public.user_sanction_registry.suspended_until, excluded.suspended_until), excluded.suspended_until),
          updated_at = v_now;
    end if;

    insert into public.user_moderation_actions (
      user_id, report_id, action_type, reason, suspended_until, created_by
    ) values (
      v_report.target_user_id, p_report_id, p_action_type,
      nullif(btrim(p_action_reason), ''), v_suspended_until, auth.uid()
    );

    v_action_content := case p_action_type
      when 'WARNING' then '운영정책 위반으로 경고 조치되었습니다.'
      when 'SUSPEND_3_DAYS' then '운영정책 위반으로 3일 이용 정지 조치되었습니다.'
      when 'SUSPEND_7_DAYS' then '운영정책 위반으로 7일 이용 정지 조치되었습니다.'
      when 'SUSPEND_30_DAYS' then '운영정책 위반으로 30일 이용 정지 조치되었습니다.'
      when 'PERMANENT_BAN' then '운영정책 위반으로 영구 이용 정지 조치되었습니다.'
    end;

    insert into public.user_notifications (user_id, type, title, content, link_url)
    values (v_report.target_user_id, 'moderation_action', '이용 제재 안내', v_action_content, './mypage.html');
  end if;

  update public.user_reports
  set status = p_status,
      action_type = coalesce(p_action_type, action_type),
      action_reason = case when p_action_type is not null then nullif(btrim(p_action_reason), '') else action_reason end,
      reviewed_at = v_now,
      reviewed_by = auth.uid()
  where id = p_report_id;

  if v_report.reporter_user_id is not null then
    if p_status = 'DISMISSED' and v_report.status <> 'DISMISSED' then
      insert into public.user_notifications (user_id, type, title, content, link_url)
      values (
        v_report.reporter_user_id,
        'report_dismissed',
        '신고 처리 안내',
        '신고하신 내용을 검토했으나 운영정책 위반으로 확인되지 않아 종결되었습니다.',
        './mypage.html'
      );
    elsif p_status in ('REVIEWED', 'ACTIONED') and v_report.status not in ('REVIEWED', 'ACTIONED') then
      insert into public.user_notifications (user_id, type, title, content, link_url)
      values (
        v_report.reporter_user_id,
        'report_completed',
        '신고 처리 안내',
        '신고하신 내용의 검토 및 처리가 완료되었습니다.',
        './mypage.html'
      );
    end if;
  end if;

  return jsonb_build_object(
    'id', p_report_id, 'status', p_status, 'action_type', p_action_type,
    'suspended_until', v_suspended_until, 'profile_found', v_profile_found, 'reviewed_at', v_now, 'reviewed_by', auth.uid()
  );
end;
$$;

revoke all on function public.moderate_user_report(bigint, text, text, text) from public;
grant execute on function public.moderate_user_report(bigint, text, text, text) to authenticated, service_role;
