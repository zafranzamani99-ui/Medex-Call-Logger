-- 072: Enable RLS + policies for public_holidays and staff_leave
-- WHY: Migrations 070 and 071 created the tables but didn't add RLS policies.
-- Supabase rejects all client writes to RLS-enabled tables without explicit
-- policies, hence the "row violates row-level security policy" error.
-- Pattern matches sql/018_schedules.sql — single permissive policy for
-- authenticated users (matches the rest of the app's trust model).

ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage public holidays"
  ON public_holidays FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE staff_leave ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage staff leave"
  ON staff_leave FOR ALL TO authenticated USING (true) WITH CHECK (true);
