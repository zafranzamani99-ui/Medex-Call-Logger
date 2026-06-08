-- 088: Shift change log — tracks who added/edited/deleted shift entries

CREATE TABLE IF NOT EXISTS shift_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT NOT NULL CHECK (action IN ('add', 'edit', 'delete')),
  tab         TEXT NOT NULL CHECK (tab IN ('saturday', 'standby', 'leave')),
  summary     TEXT NOT NULL,
  done_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  done_by_name TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_logs_created ON shift_logs(created_at DESC);

ALTER TABLE shift_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage shift_logs"
  ON shift_logs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
