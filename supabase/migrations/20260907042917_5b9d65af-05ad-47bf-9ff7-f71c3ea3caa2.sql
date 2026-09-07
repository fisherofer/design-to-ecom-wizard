CREATE TABLE public.trade_journal (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_session text NOT NULL,
  event_type text NOT NULL,
  symbol text,
  side text,
  qty numeric,
  price numeric,
  realized_usd numeric,
  source text NOT NULL DEFAULT 'local',
  severity text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  order_id text,
  broker_order_id text,
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.trade_journal TO anon;
GRANT SELECT, INSERT ON public.trade_journal TO authenticated;
GRANT ALL ON public.trade_journal TO service_role;

ALTER TABLE public.trade_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert own trade journal rows"
  ON public.trade_journal FOR INSERT
  WITH CHECK (owner_session IS NOT NULL AND length(owner_session) >= 8 AND length(message) > 0);

CREATE POLICY "read own trade journal rows"
  ON public.trade_journal FOR SELECT
  USING (owner_session IS NOT NULL AND length(owner_session) >= 8);

CREATE INDEX trade_journal_owner_time_idx ON public.trade_journal (owner_session, occurred_at DESC);