-- Migrate stored affinity ids to the renamed pair (expansion/improvement replaces tradition/reform)
UPDATE public.senate_blocs SET affinities = array_replace(affinities, 'reform', 'improvement');
UPDATE public.senate_blocs SET affinities = array_remove(affinities, 'tradition');