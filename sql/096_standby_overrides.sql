-- Standby swap/override: when someone covers another person's standby day
CREATE TABLE IF NOT EXISTS standby_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  override_date date NOT NULL,
  original_staff_id uuid NOT NULL REFERENCES profiles(id),
  original_staff_name text NOT NULL,
  replacement_staff_id uuid NOT NULL REFERENCES profiles(id),
  replacement_staff_name text NOT NULL,
  hours numeric(3,1) NOT NULL DEFAULT 2,
  reason text NOT NULL,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_standby_overrides_date ON standby_overrides(override_date);
CREATE INDEX idx_standby_overrides_original ON standby_overrides(original_staff_id);
CREATE INDEX idx_standby_overrides_replacement ON standby_overrides(replacement_staff_id);

ALTER TABLE standby_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view overrides"
  ON standby_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert overrides"
  ON standby_overrides FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update overrides"
  ON standby_overrides FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete overrides"
  ON standby_overrides FOR DELETE TO authenticated USING (true);
