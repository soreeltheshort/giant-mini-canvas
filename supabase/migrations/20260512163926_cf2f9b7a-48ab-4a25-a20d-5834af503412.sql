
-- Sounds bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('sounds', 'sounds', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Sounds publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'sounds');

CREATE POLICY "Admins can upload sounds"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'sounds' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update sounds"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'sounds' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete sounds"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'sounds' AND has_role(auth.uid(), 'admin'::app_role));

-- Loop sound on cutscenes
ALTER TABLE public.cutscenes ADD COLUMN IF NOT EXISTS audio_url text;
ALTER TABLE public.cutscenes ADD COLUMN IF NOT EXISTS audio_volume numeric NOT NULL DEFAULT 0.5;
