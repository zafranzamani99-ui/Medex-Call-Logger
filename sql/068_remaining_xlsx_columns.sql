-- 068: Final columns for 1:1 xlsx parity
-- WHY: User wants every xlsx column in the DB. This adds the last 4 columns we
-- haven't mapped yet. email_secondary is already a DB column but was never
-- actually populated due to a header-name mismatch (map used "EMAIL ID2" but
-- xlsx has "EMAIL ID 2" with a space) — the route fix is separate.
-- Run this in Supabase SQL Editor.

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS wspp_live_date date;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS mtn_important_note text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS mtn_important_note_2 text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS mn_cld_einv_renewal_rate text;
