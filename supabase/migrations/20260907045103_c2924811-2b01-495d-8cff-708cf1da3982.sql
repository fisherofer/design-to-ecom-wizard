CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_session TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  label TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_owner_idx ON public.push_subscriptions(owner_session);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions_select" ON public.push_subscriptions
  FOR SELECT TO anon, authenticated
  USING (owner_session = current_setting('request.headers', true)::json->>'x-owner-session' OR true);

CREATE POLICY "push_subscriptions_insert" ON public.push_subscriptions
  FOR INSERT TO anon, authenticated
  WITH CHECK (length(owner_session) >= 8);

CREATE POLICY "push_subscriptions_update" ON public.push_subscriptions
  FOR UPDATE TO anon, authenticated
  USING (length(owner_session) >= 8)
  WITH CHECK (length(owner_session) >= 8);

CREATE POLICY "push_subscriptions_delete" ON public.push_subscriptions
  FOR DELETE TO anon, authenticated
  USING (length(owner_session) >= 8);

CREATE TRIGGER push_subscriptions_touch BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();