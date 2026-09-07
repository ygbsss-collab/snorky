alter table public.buddy_posts
  add column if not exists has_instructor boolean not null default false;
