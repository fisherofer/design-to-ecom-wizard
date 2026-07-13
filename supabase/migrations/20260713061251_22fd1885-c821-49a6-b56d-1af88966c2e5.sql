
CREATE TABLE public.code_findings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_session TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'github',
  file_path TEXT NOT NULL,
  language TEXT,
  verdict TEXT NOT NULL DEFAULT 'review', -- keep | reuse | skip | review
  score INTEGER NOT NULL DEFAULT 0,       -- 0..100 relevance
  summary TEXT,
  recommendation TEXT,
  snippet TEXT,
  tags TEXT[] DEFAULT '{}',
  model TEXT,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX code_findings_owner_idx ON public.code_findings(owner_session, created_at DESC);
CREATE INDEX code_findings_repo_idx  ON public.code_findings(repo_url);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.code_findings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.code_findings TO authenticated;
GRANT ALL ON public.code_findings TO service_role;

ALTER TABLE public.code_findings ENABLE ROW LEVEL SECURITY;

-- Personal-tool policy: any client that knows/owns the session string can CRUD.
CREATE POLICY "anon rw code_findings" ON public.code_findings
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER code_findings_touch BEFORE UPDATE ON public.code_findings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
