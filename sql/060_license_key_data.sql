-- Migration 060: License Key Data — master license database per clinic
-- WHY: MEDEXCRM parity. Stores flexible key/value pairs per clinic
-- (license type, key, expiry date, install date, notes, etc.).
-- This is separate from license_key_requests (which tracks agent-to-admin
-- requests for new keys). This table stores the actual issued licenses.

CREATE TABLE IF NOT EXISTS license_key_data (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  clinic_code   TEXT        NOT NULL,
  field_key     TEXT        NOT NULL,
  field_value   TEXT,
  display_order INTEGER     NOT NULL DEFAULT 0,
  updated_by    UUID        REFERENCES profiles(id),
  updated_by_name TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, field_key)
);

-- Indexes for hot queries
CREATE INDEX IF NOT EXISTS idx_lkd_clinic_id ON license_key_data(clinic_id);
CREATE INDEX IF NOT EXISTS idx_lkd_clinic_code ON license_key_data(clinic_code);

-- Auto-update updated_at on modify (reuses function from migration 003)
DROP TRIGGER IF EXISTS license_key_data_updated_at ON license_key_data;
CREATE TRIGGER license_key_data_updated_at
  BEFORE UPDATE ON license_key_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: authenticated users can read/write
ALTER TABLE license_key_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "license_key_data_select" ON license_key_data
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "license_key_data_insert" ON license_key_data
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "license_key_data_update" ON license_key_data
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "license_key_data_delete" ON license_key_data
  FOR DELETE TO authenticated USING (true);
