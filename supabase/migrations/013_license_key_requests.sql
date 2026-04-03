-- WHY: Track license key requests created by agents.
-- Stores clinic reference, agent who created it, and timestamp.
CREATE TABLE IF NOT EXISTS license_key_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_code TEXT NOT NULL,
  clinic_name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for listing by date
CREATE INDEX IF NOT EXISTS idx_lkr_created_at ON license_key_requests (created_at DESC);
