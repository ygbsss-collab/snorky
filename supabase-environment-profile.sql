-- SNORKY Environment Profile stage 1
-- Existing rows remain unchanged; NULL is normalized to neutral defaults in JavaScript.
alter table public.points
  add column if not exists environment jsonb;

comment on column public.points.environment is
  'Per-point environment profile. Nullable; SNORKY applies neutral defaults when NULL or invalid.';
