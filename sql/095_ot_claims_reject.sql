-- Add reject columns to ot_claims
ALTER TABLE ot_claims
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS rejected_by_name text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS reject_reason text;

-- Allow 'rejected' status
ALTER TABLE ot_claims DROP CONSTRAINT IF EXISTS ot_claims_status_check;
ALTER TABLE ot_claims ADD CONSTRAINT ot_claims_status_check
  CHECK (status IN ('draft', 'submitted', 'approved', 'rejected'));
