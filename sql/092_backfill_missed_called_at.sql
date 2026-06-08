-- 092: Backfill called_at from notes for existing Voice Go imports
-- Notes like "Imported from Voice Go (6/8/2026 11:33:15 AM)" → parse the timestamp.
-- Also clean up notes to just "Imported from Voice Go".

UPDATE missed_calls
SET called_at = (
  regexp_replace(
    notes,
    '^Imported from Voice Go \((.+)\)$',
    '\1'
  )
)::timestamptz,
    notes = 'Imported from Voice Go'
WHERE notes LIKE 'Imported from Voice Go (%)'
  AND called_at IS NULL;
