-- 038: Add reschedule_reason column to schedules
-- WHY: Agents must provide a reason when rescheduling (No Answer, Clinic Busy, etc.)
-- Stored on the schedule record for audit trail + shown on calendar UI.
-- Run this in Supabase SQL Editor

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS reschedule_reason TEXT;
