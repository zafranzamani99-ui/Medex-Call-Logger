-- 086: Shift management tables — Saturday duty, standby rotation, replacement leave

-- 1. saturday_shifts — one row per Saturday date
-- staff stored as JSONB array: [{id: "uuid", name: "string"}, ...]
CREATE TABLE IF NOT EXISTS saturday_shifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_date  DATE NOT NULL UNIQUE,
  staff       JSONB NOT NULL DEFAULT '[]',
  notes       TEXT,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saturday_shifts_date ON saturday_shifts(shift_date);

ALTER TABLE saturday_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage saturday_shifts"
  ON saturday_shifts FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 2. standby_shifts — one row per week (Monday to Sunday)
CREATE TABLE IF NOT EXISTS standby_shifts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start     DATE NOT NULL UNIQUE,
  week_end       DATE NOT NULL,
  weekday_staff  JSONB NOT NULL DEFAULT '[]',
  weekend_staff  JSONB NOT NULL DEFAULT '[]',
  notes          TEXT,
  created_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_standby_shifts_week ON standby_shifts(week_start);

ALTER TABLE standby_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage standby_shifts"
  ON standby_shifts FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 3. replacement_leaves — one row per staff per date
CREATE TABLE IF NOT EXISTS replacement_leaves (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  staff_name  TEXT NOT NULL,
  leave_date  DATE NOT NULL,
  duration    NUMERIC(2,1) NOT NULL DEFAULT 1 CHECK (duration IN (0.5, 1)),
  notes       TEXT,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, leave_date)
);

CREATE INDEX IF NOT EXISTS idx_replacement_leaves_date ON replacement_leaves(leave_date);
CREATE INDEX IF NOT EXISTS idx_replacement_leaves_staff ON replacement_leaves(staff_id);

ALTER TABLE replacement_leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage replacement_leaves"
  ON replacement_leaves FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
