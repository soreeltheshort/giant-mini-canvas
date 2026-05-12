
-- Add opt_in to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'opt_in';

-- Email suppression list (works with or without an account)
CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  reason text NOT NULL DEFAULT 'unsubscribe',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read suppressions"
  ON public.email_suppressions FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete suppressions"
  ON public.email_suppressions FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Blog post mailing tracking
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS mailed_at timestamptz,
  ADD COLUMN IF NOT EXISTS mailed_count integer NOT NULL DEFAULT 0;
