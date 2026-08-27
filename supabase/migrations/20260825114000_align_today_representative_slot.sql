-- Align TODAY mode rows to deterministic 12:00 representative slot interval
DELETE FROM public.point_evaluation_results
WHERE mode = 'TODAY'
  AND period_start != (target_date || ' 03:00:00+00')::timestamptz;
