ALTER TABLE public.senate_blocs
ADD COLUMN icon_url TEXT;

COMMENT ON COLUMN public.senate_blocs.icon_url IS 'Square emblem used for compact senate bloc displays and voting controls.';