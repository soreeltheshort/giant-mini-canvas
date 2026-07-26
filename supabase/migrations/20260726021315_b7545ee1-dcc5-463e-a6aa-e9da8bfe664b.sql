CREATE POLICY "Admins and testers can insert all fleets"
ON public.fleets
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleets TO authenticated;
GRANT ALL ON public.fleets TO service_role;