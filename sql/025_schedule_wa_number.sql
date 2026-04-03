-- 025: Add clinic WhatsApp number field to schedules
-- Run this in Supabase SQL Editor

ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS clinic_wa TEXT;
