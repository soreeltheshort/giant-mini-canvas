
-- Create saved_maps table
CREATE TABLE public.saved_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Untitled Map',
  file_path text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_maps ENABLE ROW LEVEL SECURITY;

-- Users can read their own saved maps
CREATE POLICY "Users can read own maps" ON public.saved_maps
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own saved maps
CREATE POLICY "Users can insert own maps" ON public.saved_maps
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own saved maps
CREATE POLICY "Users can delete own maps" ON public.saved_maps
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all maps
CREATE POLICY "Admins can read all maps" ON public.saved_maps
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Create storage bucket for map files
INSERT INTO storage.buckets (id, name, public)
VALUES ('map-files', 'map-files', false);

-- Storage RLS: users can upload to their own folder
CREATE POLICY "Users can upload map files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'map-files' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage RLS: users can read their own files
CREATE POLICY "Users can read own map files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'map-files' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage RLS: users can delete their own files
CREATE POLICY "Users can delete own map files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'map-files' AND (storage.foldername(name))[1] = auth.uid()::text);
