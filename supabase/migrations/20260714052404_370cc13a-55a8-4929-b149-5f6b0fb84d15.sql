
DROP POLICY IF EXISTS "public insert ai recs" ON public.ai_recommendation_log;
CREATE POLICY "insert ai recs with picks"
  ON public.ai_recommendation_log
  FOR INSERT
  WITH CHECK (jsonb_typeof(picks) = 'array' AND jsonb_array_length(picks) > 0);
