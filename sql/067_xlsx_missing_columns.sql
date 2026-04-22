-- 067: Add remaining xlsx CRM-sheet columns that weren't previously imported
-- WHY: user wants 1:1 parity between the xlsx and the website. The CRM sheet has
-- 52 columns; the upload route only mapped 43. This adds the remaining 8 that
-- have meaningful data (columns with 0% fill like "WSPP LIVE DATE" are skipped).
-- Run this in Supabase SQL Editor.

-- Dates (all sparse but user-facing)
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS einv_po_rcvd_date date;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS einv_live_date date;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS hyb_live_date date;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS kiosk_po_date date;

-- Flags / version / count
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS kiosk_survey_form boolean;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS pc_total text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS db_version text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS product_version text;
