DROP POLICY IF EXISTS "push_subscriptions_select" ON public.push_subscriptions;
REVOKE SELECT ON public.push_subscriptions FROM anon, authenticated;