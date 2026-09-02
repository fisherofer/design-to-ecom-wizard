CREATE TABLE public.portable_profile_sync (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_session text NOT NULL,
  key text NOT NULL,
  value jsonb,
  device_id text,
  deleted boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (owner_session, key)
);

GRANT SELECT, INSERT, UPDATE ON public.portable_profile_sync TO anon;
GRANT SELECT, INSERT, UPDATE ON public.portable_profile_sync TO authenticated;
GRANT ALL ON public.portable_profile_sync TO service_role;

ALTER TABLE public.portable_profile_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own portable profile rows"
  ON public.portable_profile_sync FOR SELECT
  USING (owner_session IS NOT NULL AND length(owner_session) >= 8);

CREATE POLICY "insert own portable profile rows"
  ON public.portable_profile_sync FOR INSERT
  WITH CHECK (owner_session IS NOT NULL AND length(owner_session) >= 8 AND length(key) > 0);

CREATE POLICY "update own portable profile rows"
  ON public.portable_profile_sync FOR UPDATE
  USING (owner_session IS NOT NULL AND length(owner_session) >= 8)
  WITH CHECK (owner_session IS NOT NULL AND length(owner_session) >= 8);

CREATE TRIGGER portable_profile_sync_touch
  BEFORE UPDATE ON public.portable_profile_sync
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX portable_profile_sync_session_idx
  ON public.portable_profile_sync (owner_session, updated_at DESC);