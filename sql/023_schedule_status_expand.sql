-- 023: Add 'rescheduled' and 'no_answer' to schedule status
-- Run this in Supabase SQL Editor

-- Drop old CHECK and add expanded one
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_status_check;
ALTER TABLE schedules ADD CONSTRAINT schedules_status_check
  CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled', 'no_answer'));
