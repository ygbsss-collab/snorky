-- Update MID_MARINE_ONLY to MID in point_evaluation_results mode
ALTER TABLE public.point_evaluation_results
  DROP CONSTRAINT IF EXISTS point_evaluation_results_mode_check;

UPDATE public.point_evaluation_results
  SET mode = 'MID'
  WHERE mode = 'MID_MARINE_ONLY';

ALTER TABLE public.point_evaluation_results
  ADD CONSTRAINT point_evaluation_results_mode_check
  CHECK (mode IN ('TODAY', 'TODAY_HOURLY', 'SHORT', 'MID'));
