ALTER TABLE public.cutscene_slides
  ADD COLUMN IF NOT EXISTS text_2 text NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS text_3 text NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS slug_delay_ms integer NOT NULL DEFAULT 600;