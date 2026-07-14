
CREATE TABLE public.ai_recommendation_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  universe TEXT[] NOT NULL,
  model TEXT NOT NULL,
  picks JSONB NOT NULL,
  rationale TEXT,
  horizon_days INT NOT NULL DEFAULT 10,
  owner_session TEXT
);
CREATE INDEX ai_recommendation_log_generated_at_idx ON public.ai_recommendation_log (generated_at DESC);
GRANT SELECT, INSERT ON public.ai_recommendation_log TO anon, authenticated;
GRANT ALL ON public.ai_recommendation_log TO service_role;
ALTER TABLE public.ai_recommendation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read ai recs" ON public.ai_recommendation_log FOR SELECT USING (true);
CREATE POLICY "public insert ai recs" ON public.ai_recommendation_log FOR INSERT WITH CHECK (true);
