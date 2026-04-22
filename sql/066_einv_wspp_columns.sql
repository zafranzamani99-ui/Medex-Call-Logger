-- 066: Add E-Invoice / WhatsApp / SST fields imported from "EINV & WSPP (SST)" xlsx sheet
-- WHY: The xlsx has a second sheet with E-Invoice V1/V2 signup flags, WhatsApp setup flag,
-- fee/payment status, portal credentials, installation details, and SST registration/period
-- that until now have never been imported — the CRM upload only read the "CRM" sheet.
-- See planning context in conversation 2026-04-22.
-- Run this in Supabase SQL Editor.
--
-- All columns are NULLABLE with no defaults. Reason: NULL = "unknown, not in EINV sheet",
-- which is semantically different from FALSE ("signed up = no"). Of 3,921 clinics, only 858
-- appear in the EINV sheet — the remaining 3,063 should show blank (NULL), not a misleading "No".

-- E-Invoice signup flags (two versions: V1 = RM699 one-time setup, V2 = RM500 yearly hosting)
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS einv_v1_signed boolean;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS einv_v2_signed boolean;

-- E-Invoice fee status (free-text: "setup" / "to act" / "hosting" — matches xlsx conventions)
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS einv_setup_fee_status text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS einv_hosting_fee_status text;

-- E-Invoice payment + installation dates
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS einv_payment_date date;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS einv_install_date date;

-- E-Invoice portal credentials (admin-visible only in UI)
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS einv_portal_credentials text;

-- E-Invoice installation status (sparse free-text — ~3% filled in xlsx)
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS einv_install_status text;

-- SST next tax period ("1mnth" / "2mnth") — complements existing sst_frequency (current period)
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS sst_period_next text;
