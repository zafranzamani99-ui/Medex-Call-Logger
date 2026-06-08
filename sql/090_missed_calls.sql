-- 090: Missed calls table — manually logged phone numbers
-- that were seen on the phone but not logged as tickets/drafts.

CREATE TABLE IF NOT EXISTS missed_calls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL,
  clinic_name TEXT,
  notes       TEXT,
  logged_by   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  logged_by_name TEXT NOT NULL,
  call_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_missed_calls_date ON missed_calls(call_date DESC);

ALTER TABLE missed_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage missed_calls"
  ON missed_calls FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
