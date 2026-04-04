-- 031: Add time tracking columns to schedules
-- WHY: Track actual work duration — started_at when agent clicks "Start Work",
-- completed_at when they finish, actual_duration_minutes calculated from the difference.
-- Enables live timer in Work Panel and estimated vs actual comparison.
-- Run this in Supabase SQL Editor

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS actual_duration_minutes INTEGER;
