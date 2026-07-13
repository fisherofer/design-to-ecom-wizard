CREATE TABLE public.drive_backup_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_session TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  token TEXT,
  root_folder TEXT NOT NULL DEFAULT 'AI/LOVEABLE',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  last_uploaded INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_session, repo_url)
);

CREATE INDEX drive_backup_targets_owner_idx ON public.drive_backup_targets(owner_session);
CREATE INDEX drive_backup_targets_enabled_idx ON public.drive_backup_targets(enabled) WHERE enabled = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drive_backup_targets TO authenticated;
GRANT ALL ON public.drive_backup_targets TO service_role;

ALTER TABLE public.drive_backup_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny direct client access to drive_backup_targets"
  ON public.drive_backup_targets FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE TRIGGER drive_backup_targets_touch BEFORE UPDATE ON public.drive_backup_targets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();