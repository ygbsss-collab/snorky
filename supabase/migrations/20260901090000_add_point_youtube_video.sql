alter table public.points
  add column if not exists youtube_url text,
  add column if not exists youtube_title text;

comment on column public.points.youtube_url is
  'Administrator-provided YouTube video URL. The client only embeds validated YouTube video IDs.';

comment on column public.points.youtube_title is
  'Optional administrator-provided title displayed on the point video screen.';

notify pgrst, 'reload schema';
