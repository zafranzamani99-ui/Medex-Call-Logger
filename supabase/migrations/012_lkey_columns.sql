-- WHY: LKEY Line 1-5 columns store license key form data from CRM.
-- These pre-fill the License Key Request Form (clinic name, address lines, tel).
-- LKEY Line 1 = Clinic Name, Line 2 = Address 1, Line 3 = Address 2, Line 4 = Address 3, Line 5 = Tel/Fax

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS lkey_line1 TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS lkey_line2 TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS lkey_line3 TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS lkey_line4 TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS lkey_line5 TEXT;
