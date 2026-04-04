-- 030: Add in_progress status to schedules for active work tracking
-- WHY: Agents need a "working on it now" state between scheduled and completed.
-- This enables the Work Panel UI that shows full clinic details + quick actions.
-- Run this in Supabase SQL Editor

-- Drop BOTH possible constraint names (auto-generated + manual)
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_status_check;
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS chk_schedule_status;
ALTER TABLE schedules ADD CONSTRAINT chk_schedule_status
  CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled', 'no_answer'));
