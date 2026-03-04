
-- Drop restrictive hull_class check constraint and replace with expanded one
ALTER TABLE public.ship_types DROP CONSTRAINT ship_types_hull_class_check;
ALTER TABLE public.ship_types ADD CONSTRAINT ship_types_hull_class_check CHECK (hull_class IN ('BB','CH','CL','CM','DD','FH','FL','GS','T','Light','Medium','Heavy','Capital'));
