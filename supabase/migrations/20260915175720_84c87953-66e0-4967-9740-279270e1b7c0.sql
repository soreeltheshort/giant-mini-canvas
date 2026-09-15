UPDATE public.senate_blocs
SET affinities = array_remove(array_remove(array_remove(affinities, 'piety'), 'commerce'), 'science')
WHERE affinities && ARRAY['piety','commerce','science']::text[];