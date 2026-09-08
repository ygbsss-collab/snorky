create table if not exists public.app_settings (key text primary key,value jsonb not null,updated_at timestamptz not null default now(),updated_by uuid references auth.users(id));
alter table public.app_settings enable row level security;
grant select on public.app_settings to anon, authenticated;
grant insert, update, delete on public.app_settings to authenticated;
create policy "app_settings_select_public" on public.app_settings for select to anon, authenticated using (true);
create policy "app_settings_insert_admin" on public.app_settings for insert to authenticated with check (exists (select 1 from public.admin_users where user_id=auth.uid()));
create policy "app_settings_update_admin" on public.app_settings for update to authenticated using (exists (select 1 from public.admin_users where user_id=auth.uid())) with check (exists (select 1 from public.admin_users where user_id=auth.uid()));
create policy "app_settings_delete_admin" on public.app_settings for delete to authenticated using (exists (select 1 from public.admin_users where user_id=auth.uid()));
insert into public.app_settings(key,value) values ('community_config','{"enabled":false,"open_chat_url":"","banner_text":"함께 다이빙하고 함께 이야기해요"}'::jsonb) on conflict(key) do nothing;
