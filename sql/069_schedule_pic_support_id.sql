-- 069: Convert pic_support from free text to FK on profiles
-- WHY: Dashboard "Next Up" was filtering by agent_id (the logger), so schedules logged
-- on behalf of another staff member showed on the wrong person's dashboard.
-- This adds a real FK column. We keep the free-text pic_support for legacy display
-- and external-contractor names that don't map to a profile.
-- New writes always populate BOTH pic_support_id (UUID) and pic_support (snapshot name).

ALTER TABLE schedules
  ADD COLUMN pic_support_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schedules_pic_support_id
  ON schedules(pic_support_id);

-- Backfill: case-insensitive match free-text pic_support to profiles.display_name
UPDATE schedules s
SET pic_support_id = p.id
FROM profiles p
WHERE s.pic_support IS NOT NULL
  AND TRIM(s.pic_support) <> ''
  AND LOWER(TRIM(s.pic_support)) = LOWER(TRIM(p.display_name))
  AND s.pic_support_id IS NULL;

-- Sanity report (run separately in SQL editor to see how many didn't match):
-- SELECT pic_support, COUNT(*) FROM schedules
-- WHERE pic_support IS NOT NULL AND TRIM(pic_support) <> '' AND pic_support_id IS NULL
-- GROUP BY pic_support ORDER BY COUNT(*) DESC;
