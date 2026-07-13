
CREATE POLICY "deny all direct client access" ON public.code_findings
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
