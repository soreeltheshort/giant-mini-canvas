
-- Allow admins to read all user_roles
CREATE POLICY "Admins can read all roles" ON public.user_roles
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to insert roles
CREATE POLICY "Admins can insert roles" ON public.user_roles
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete roles
CREATE POLICY "Admins can delete roles" ON public.user_roles
FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to read all profiles
CREATE POLICY "Admins can read all profiles" ON public.profiles
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
