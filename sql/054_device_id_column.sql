-- 054: Add device_id, WhatsApp details, and SST details to clinics table
-- WHY: LK form saves these back to CRM on copy — agents need device ID for license keys,
-- WhatsApp account/API key for WS activation, SST registration details for SST module.
-- These are agent-managed operational fields, NOT overwritten by CRM Excel upload.
-- Run this in Supabase SQL Editor

-- Device ID
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS device_id text;

-- WhatsApp details
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS wa_account_no text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS wa_api_key text;

-- SST details
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS sst_registration_no text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS sst_start_date text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS sst_submission text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS sst_frequency text;
