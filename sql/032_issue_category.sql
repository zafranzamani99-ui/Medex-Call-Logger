-- 032: Add issue_category column to tickets
-- WHY: Manager requested parent categories for call logs:
-- System Implementation, User, Data Issue, System Issue, Change Request
-- These sit above the 18 issue types as higher-level classification.
-- Run this in Supabase SQL Editor

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS issue_category TEXT;
