
-- Allow admins and testers to update any fleet
CREATE POLICY "Admins and testers can update all fleets"
ON public.fleets FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'tester'));

-- Allow admins and testers to delete any fleet
CREATE POLICY "Admins and testers can delete all fleets"
ON public.fleets FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'tester'));

-- Allow admins and testers to update any fleet ships
CREATE POLICY "Admins and testers can update all fleet ships"
ON public.fleet_ships FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'tester'));

-- Allow admins and testers to delete any fleet ships
CREATE POLICY "Admins and testers can delete all fleet ships"
ON public.fleet_ships FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'tester'));

-- Allow admins and testers to insert fleet ships for any fleet
CREATE POLICY "Admins and testers can insert all fleet ships"
ON public.fleet_ships FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'tester'));
