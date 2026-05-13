CREATE TABLE public.studio_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('forum','beta','message')),
  email text NOT NULL,
  name text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_studio_signups_kind ON public.studio_signups(kind);
CREATE INDEX idx_studio_signups_email_lower ON public.studio_signups(lower(email));

ALTER TABLE public.studio_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a signup"
  ON public.studio_signups
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can read signups"
  ON public.studio_signups
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update signups"
  ON public.studio_signups
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete signups"
  ON public.studio_signups
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));