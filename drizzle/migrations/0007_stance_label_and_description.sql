ALTER TABLE public.app_settings
  ADD COLUMN stance_label_strong_positive text NOT NULL DEFAULT 'Strongly Yea',
  ADD COLUMN stance_label_positive text NOT NULL DEFAULT 'Yea',
  ADD COLUMN stance_label_neutral text NOT NULL DEFAULT 'Neutral',
  ADD COLUMN stance_label_negative text NOT NULL DEFAULT 'Nay',
  ADD COLUMN stance_label_strong_negative text NOT NULL DEFAULT 'Strongly Nay',
  ADD COLUMN stance_desc_strong_positive text NOT NULL DEFAULT '',
  ADD COLUMN stance_desc_positive text NOT NULL DEFAULT '',
  ADD COLUMN stance_desc_neutral text NOT NULL DEFAULT '',
  ADD COLUMN stance_desc_negative text NOT NULL DEFAULT '',
  ADD COLUMN stance_desc_strong_negative text NOT NULL DEFAULT '';