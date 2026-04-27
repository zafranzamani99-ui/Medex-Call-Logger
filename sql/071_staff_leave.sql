-- 071: Staff leave calendar
-- WHY: Show "Amali on leave" chips on the schedule calendar so loggers don't
-- assign clinic visits to teammates who are off. Per user direction, no
-- approval workflow — anyone with an account can mark a leave.
-- The create form warns inline if the assigned PIC has leave on that date
-- (warn-but-allow).

CREATE TABLE IF NOT EXISTS staff_leave (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  leave_date DATE NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, leave_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_leave_date ON staff_leave(leave_date);
CREATE INDEX IF NOT EXISTS idx_staff_leave_staff ON staff_leave(staff_id);

-- RLS — same pattern as schedules (sql/018)
ALTER TABLE staff_leave ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage staff leave" ON staff_leave;
CREATE POLICY "Authenticated users can manage staff leave"
  ON staff_leave FOR ALL TO authenticated USING (true) WITH CHECK (true);
