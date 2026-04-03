-- Migration 008: Add clinic extra fields + custom issue types table

-- 1. Add MTN start date and email columns to clinics
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS mtn_start DATE;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS email_main TEXT;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS email_secondary TEXT;

-- 2. Custom issue types table — stores user-added types beyond defaults
CREATE TABLE IF NOT EXISTS custom_issue_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: any authenticated user can read/insert custom issue types
ALTER TABLE custom_issue_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read custom issue types"
  ON custom_issue_types FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert custom issue types"
  ON custom_issue_types FOR INSERT
  TO authenticated
  WITH CHECK (true);
