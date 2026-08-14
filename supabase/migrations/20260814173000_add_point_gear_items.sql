create table if not exists public.point_gear_items (
  id uuid primary key default gen_random_uuid(),
  point_id bigint not null references public.points(id) on delete cascade,
  item_name text not null check (char_length(trim(item_name)) between 1 and 100),
  icon text not null default '🎒' check (char_length(icon) <= 20),
  description text not null default '' check (char_length(description) <= 500),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  product_name text,
  product_image_url text,
  affiliate_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists point_gear_items_point_order_idx
  on public.point_gear_items (point_id, sort_order, created_at);

alter table public.point_gear_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='point_gear_items' and policyname='Public reads active point gear') then
    create policy "Public reads active point gear" on public.point_gear_items for select
      using (is_active or exists (select 1 from public.admin_users where user_id=auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='point_gear_items' and policyname='Admins insert point gear') then
    create policy "Admins insert point gear" on public.point_gear_items for insert
      with check (exists (select 1 from public.admin_users where user_id=auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='point_gear_items' and policyname='Admins update point gear') then
    create policy "Admins update point gear" on public.point_gear_items for update
      using (exists (select 1 from public.admin_users where user_id=auth.uid()))
      with check (exists (select 1 from public.admin_users where user_id=auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='point_gear_items' and policyname='Admins delete point gear') then
    create policy "Admins delete point gear" on public.point_gear_items for delete
      using (exists (select 1 from public.admin_users where user_id=auth.uid()));
  end if;
end $$;

create or replace function public.set_point_gear_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname='set_point_gear_items_updated_at' and tgrelid='public.point_gear_items'::regclass) then
    create trigger set_point_gear_items_updated_at before update on public.point_gear_items
      for each row execute function public.set_point_gear_updated_at();
  end if;
end $$;

grant select on public.point_gear_items to anon, authenticated;
grant insert, update, delete on public.point_gear_items to authenticated;

notify pgrst, 'reload schema';
