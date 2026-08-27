-- ==============================================================================
-- Migration: Add Point Evaluation Results & Profile Change Trigger
-- Date: 2026-08-25
-- ==============================================================================

create table if not exists public.point_evaluation_results (
  id bigint generated always as identity primary key,
  point_id integer not null references public.points(id) on delete cascade,
  target_date date not null,
  mode varchar(20) not null check (mode in ('TODAY', 'SHORT', 'MID_MARINE_ONLY')),
  slot_index smallint,
  period_start timestamptz not null,
  period_end timestamptz not null,
  algorithm_version varchar(10) not null default 'V1.5',
  quality_status varchar(20) not null check (quality_status in ('READY', 'PARTIAL', 'UNKNOWN')),
  safety_status varchar(20) not null check (safety_status in ('PASS', 'BLOCK', 'UNKNOWN')),
  safety_reasons text[] not null default '{}',
  condition_score smallint,
  condition_status varchar(20) not null,
  visibility_score smallint,
  visibility_grade varchar(20) not null,
  visibility_explanation text not null default '',
  recommendation varchar(20) not null,
  point_updated_at timestamptz,
  forecast_time timestamptz,
  source_issue_time jsonb,
  evaluated_at timestamptz not null default timezone('utc'::text, now()),
  metrics jsonb not null default '{}'::jsonb,
  min_max_metrics jsonb,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint uq_point_evaluation_results unique (point_id, target_date, mode, period_start, period_end)
);

create index if not exists idx_point_evaluation_results_lookup
  on public.point_evaluation_results (point_id, mode, target_date, period_start);

create index if not exists idx_point_evaluation_results_quality
  on public.point_evaluation_results (quality_status, safety_status);

alter table public.point_evaluation_results enable row level security;

create policy "Allow service role full access on point_evaluation_results"
  on public.point_evaluation_results for all
  to service_role
  using (true)
  with check (true);

create policy "Allow public read access on point_evaluation_results"
  on public.point_evaluation_results for select
  to public, anon, authenticated
  using (true);

-- Trigger function for Point Profile updated_at change
create or replace function public.handle_point_profile_updated()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_points_profile_updated on public.points;
create trigger trg_points_profile_updated
  before update on public.points
  for each row
  execute function public.handle_point_profile_updated();

notify pgrst, 'reload schema';
