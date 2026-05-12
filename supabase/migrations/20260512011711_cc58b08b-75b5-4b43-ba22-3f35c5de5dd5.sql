-- Cutscenes feature
CREATE TABLE public.cutscenes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.cutscene_slides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cutscene_id UUID NOT NULL REFERENCES public.cutscenes(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  text TEXT NOT NULL DEFAULT '',
  fade_in_ms INTEGER NOT NULL DEFAULT 800,
  hold_ms INTEGER NOT NULL DEFAULT 4000,
  fade_out_ms INTEGER NOT NULL DEFAULT 800,
  word_speed_ms INTEGER NOT NULL DEFAULT 120,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cutscene_slides_cutscene ON public.cutscene_slides(cutscene_id, order_index);

ALTER TABLE public.cutscenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cutscene_slides ENABLE ROW LEVEL SECURITY;

-- Cutscenes: admins manage; everyone authenticated can read
CREATE POLICY "Authenticated can read cutscenes" ON public.cutscenes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert cutscenes" ON public.cutscenes
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update cutscenes" ON public.cutscenes
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete cutscenes" ON public.cutscenes
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Slides
CREATE POLICY "Authenticated can read cutscene slides" ON public.cutscene_slides
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert cutscene slides" ON public.cutscene_slides
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update cutscene slides" ON public.cutscene_slides
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete cutscene slides" ON public.cutscene_slides
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_cutscenes_updated_at BEFORE UPDATE ON public.cutscenes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_cutscene_slides_updated_at BEFORE UPDATE ON public.cutscene_slides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public storage bucket for cutscene images
INSERT INTO storage.buckets (id, name, public) VALUES ('cutscene-images', 'cutscene-images', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Cutscene images publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'cutscene-images');
CREATE POLICY "Admins can upload cutscene images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'cutscene-images' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update cutscene images" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'cutscene-images' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete cutscene images" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'cutscene-images' AND has_role(auth.uid(), 'admin'::app_role));