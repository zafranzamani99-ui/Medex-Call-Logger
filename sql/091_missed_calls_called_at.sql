-- 091: Add called_at to missed_calls — stores the actual call time
-- from Voice Go, separate from created_at (when it was imported).

ALTER TABLE missed_calls ADD COLUMN IF NOT EXISTS called_at TIMESTAMPTZ;
