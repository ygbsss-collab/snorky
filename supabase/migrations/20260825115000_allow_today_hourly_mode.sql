-- Add TODAY_HOURLY to mode check constraint
ALTER TABLE public.point_evaluation_results
  DROP CONSTRAINT IF EXISTS point_evaluation_results_mode_check;

ALTER TABLE public.point_evaluation_results
  ADD CONSTRAINT point_evaluation_results_mode_check
  CHECK (mode IN ('TODAY', 'TODAY_HOURLY', 'SHORT', 'MID_MARINE_ONLY'));
