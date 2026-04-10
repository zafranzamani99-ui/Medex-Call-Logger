-- Migration 041: Add operational fields to clinics table
-- These are agent-managed fields, NEVER overwritten by CRM Excel upload.
-- CRM upload only upserts CRM-imported columns (clinic_code, clinic_name, etc.).
-- Supabase upsert only touches specified columns, so these are safe.

-- System/infrastructure info
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS workstation_count text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS main_pc_name text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS current_program_version text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS current_db_version text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS db_size text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS ram text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS processor text;

-- Remote access credentials
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS ultraviewer_id text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS ultraviewer_pw text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS anydesk_id text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS anydesk_pw text;

-- Feature flags
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS has_e_invoice boolean NOT NULL DEFAULT false;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS has_sst boolean NOT NULL DEFAULT false;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS has_whatsapp boolean NOT NULL DEFAULT false;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS has_backup boolean NOT NULL DEFAULT false;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS has_ext_hdd boolean NOT NULL DEFAULT false;

-- Free-text notes
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS clinic_notes text;

-- Audit: who last edited this clinic's operational data
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS last_updated_by uuid REFERENCES profiles(id);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS last_updated_by_name text;
