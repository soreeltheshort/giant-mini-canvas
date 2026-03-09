ALTER TABLE facility_types
  ADD COLUMN cost integer NOT NULL DEFAULT 0,
  ADD COLUMN maintenance integer NOT NULL DEFAULT 0,
  ADD COLUMN condition_bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN tribute_flat integer NOT NULL DEFAULT 0,
  ADD COLUMN tribute_percent integer NOT NULL DEFAULT 0,
  ADD COLUMN survey_bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN ground_defense_bonus integer NOT NULL DEFAULT 0;