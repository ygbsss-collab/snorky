-- 사용자 프로필 테이블 및 아바타 스토리지 버킷 설정
create table if not exists public.user_profiles (
  id bigint generated always as identity primary key,
  provider text not null default 'kakao',
  provider_user_id text not null,
  custom_nickname text,
  custom_avatar_url text,
  avatar_type text not null default 'default' check (avatar_type in ('default', 'custom', 'none')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint uq_user_profiles_provider_user unique (provider, provider_user_id)
);

create index if not exists idx_user_profiles_lookup
  on public.user_profiles (provider, provider_user_id);

alter table public.user_profiles enable row level security;

grant select, insert, update on public.user_profiles to anon, authenticated, service_role;
grant usage, select on sequence public.user_profiles_id_seq to anon, authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'Allow public read user_profiles'
  ) then
    create policy "Allow public read user_profiles" on public.user_profiles for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'Allow public insert user_profiles'
  ) then
    create policy "Allow public insert user_profiles" on public.user_profiles for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'Allow public update user_profiles'
  ) then
    create policy "Allow public update user_profiles" on public.user_profiles for update using (true) with check (true);
  end if;
end $$;

-- 아바타 스토리지 버킷 생성
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Allow public read avatars'
  ) then
    create policy "Allow public read avatars" on storage.objects for select using (bucket_id = 'avatars');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Allow public upload avatars'
  ) then
    create policy "Allow public upload avatars" on storage.objects for insert with check (bucket_id = 'avatars');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Allow public update avatars'
  ) then
    create policy "Allow public update avatars" on storage.objects for update using (bucket_id = 'avatars');
  end if;
end $$;

notify pgrst, 'reload schema';
