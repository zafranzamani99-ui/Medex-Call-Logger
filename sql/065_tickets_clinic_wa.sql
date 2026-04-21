-- Migration 065: Capture clinic WhatsApp number on tickets
-- WHY: The call-log form already collects "Clinic WhatsApp" and forwards
-- it to any generated schedule row. But the ticket itself never stored
-- the number, so ticket detail had no way to display or re-dial it.
-- Storing on the ticket matches the denormalization pattern used for
-- clinic_phone, mtn_expiry, etc. — preserves snapshot even if the
-- clinic record later changes.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS clinic_wa TEXT;
