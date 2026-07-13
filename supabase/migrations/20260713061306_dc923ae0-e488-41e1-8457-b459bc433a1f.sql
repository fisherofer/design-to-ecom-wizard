
DROP POLICY IF EXISTS "anon rw code_findings" ON public.code_findings;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.code_findings FROM anon;

-- Only server code (service_role) can touch rows. RLS remains enabled so any
-- accidental direct client access is denied. No permissive USING(true) policy.
