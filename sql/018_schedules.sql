-- 018: Schedules table — weekly appointment management
-- Run this in Supabase SQL Editor

CREATE TABLE schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_code TEXT NOT NULL,
  clinic_name TEXT NOT NULL,
  pic TEXT,
  schedule_date DATE NOT NULL,
  schedule_time TEXT NOT NULL,
  schedule_type TEXT NOT NULL,
  custom_type TEXT,
  duration_estimate TEXT,
  agent_name TEXT NOT NULL,
  agent_id UUID REFERENCES profiles(id),
  notes TEXT,
  source_ticket_id UUID REFERENCES tickets(id),
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage schedules"
  ON schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_schedules_date ON schedules(schedule_date);
CREATE INDEX idx_schedules_agent ON schedules(agent_id);
