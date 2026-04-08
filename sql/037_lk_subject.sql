-- 037: Add subject column to license_key_requests
-- WHY: Agents need auto-generated email subjects saved for audit trail.
-- Pattern: [ACTION] : License Key for [CLINIC] ([CODE]) by [AGENT] on [DATE]
-- Run this in Supabase SQL Editor

ALTER TABLE license_key_requests ADD COLUMN IF NOT EXISTS subject TEXT;
