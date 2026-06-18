-- 094: OT Claims for overtime tracking and form generation
-- Each claim covers one calendar month per staff member

CREATE TABLE ot_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  designation TEXT NOT NULL DEFAULT 'PROFESSIONAL SERVICE CONSULTANT',
  department TEXT NOT NULL DEFAULT 'SUPPORT',
  claim_month DATE NOT NULL, -- first of month, e.g. '2026-04-01'
  reporting_manager TEXT NOT NULL DEFAULT 'HAZLEEN BT MOHD HADZIR',
  entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_hours NUMERIC(5,1) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved')),
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, claim_month)
);

ALTER TABLE ot_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own OT claims"
  ON ot_claims FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all OT claims"
  ON ot_claims FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'administrator'))
  );

CREATE POLICY "Users can insert own OT claims"
  ON ot_claims FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own OT claims"
  ON ot_claims FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can update any OT claim"
  ON ot_claims FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'administrator'))
  );

CREATE POLICY "Users can delete own draft OT claims"
  ON ot_claims FOR DELETE USING (auth.uid() = user_id AND status = 'draft');

CREATE INDEX idx_ot_claims_user ON ot_claims(user_id);
CREATE INDEX idx_ot_claims_month ON ot_claims(claim_month);
CREATE INDEX idx_ot_claims_status ON ot_claims(status);
