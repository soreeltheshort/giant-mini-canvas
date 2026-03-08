
-- Add email column to profiles
ALTER TABLE public.profiles ADD COLUMN email text;

-- Backfill from auth.users
UPDATE public.profiles p SET email = u.email FROM auth.users u WHERE u.id = p.user_id;

-- Update the trigger function to also store email
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email) VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name', NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$function$;
