-- 021: Add mode column to schedules (Remote / Onsite)
-- Run this in Supabase SQL Editor

ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'Remote'
  CHECK (mode IN ('Remote', 'Onsite'));
