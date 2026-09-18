create extension if not exists pgcrypto;
create extension if not exists pg_net with schema extensions;

create table if not exists public.user_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_user_push_subscriptions_user_id
  on public.user_push_subscriptions (user_id);

alter table public.user_push_subscriptions enable row level security;

revoke all on public.user_push_subscriptions from anon, authenticated;
grant all on public.user_push_subscriptions to service_role;

drop policy if exists "Users manage own push subscriptions" on public.user_push_subscriptions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'snorky_push_internal_token') then
    raise exception 'Vault secret snorky_push_internal_token is required';
  end if;
end $$;

create or replace function public.enqueue_user_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
begin
  perform net.http_post(
    url := 'https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-internal-token', (select decrypted_secret from vault.decrypted_secrets where name = 'snorky_push_internal_token')
    ),
    body := jsonb_build_object('notification_id', new.id, 'user_id', new.user_id),
    timeout_milliseconds := 30000
  );
  return new;
end;
$$;

drop trigger if exists user_notifications_after_insert_push on public.user_notifications;
create trigger user_notifications_after_insert_push
after insert on public.user_notifications
for each row execute function public.enqueue_user_notification_push();
