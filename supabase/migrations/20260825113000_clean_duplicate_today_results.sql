-- Clean obsolete hourly TODAY rows keeping only the latest representative daily row per point
DELETE FROM public.point_evaluation_results a
USING public.point_evaluation_results b
WHERE a.mode = 'TODAY'
  AND b.mode = 'TODAY'
  AND a.point_id = b.point_id
  AND a.target_date = b.target_date
  AND a.evaluated_at < b.evaluated_at;
