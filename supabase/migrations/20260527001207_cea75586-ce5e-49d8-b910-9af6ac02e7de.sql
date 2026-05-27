
-- Add default factions config to app_settings
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS default_factions_config_id uuid;

-- Saved factions configs catalog
CREATE TABLE IF NOT EXISTS public.saved_factions_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  file_path text NOT NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_factions_configs TO authenticated;
GRANT ALL ON public.saved_factions_configs TO service_role;

ALTER TABLE public.saved_factions_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read factions configs"
  ON public.saved_factions_configs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and testers manage factions configs"
  ON public.saved_factions_configs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role));

-- Private bucket for config files
INSERT INTO storage.buckets (id, name, public)
VALUES ('config-files', 'config-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can read config files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'config-files');

CREATE POLICY "Admins and testers can upload config files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'config-files' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role)));

CREATE POLICY "Admins and testers can update config files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'config-files' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role)));

CREATE POLICY "Admins and testers can delete config files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'config-files' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role)));
