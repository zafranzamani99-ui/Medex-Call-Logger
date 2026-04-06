-- 034: Job Sheets — digital SERVICE JOB SHEET form
-- WHY: Replaces paper forms for onsite/remote service visits.
-- JS number format: JS-YYYYMMDD-NNN (sequential per day, Malaysia TZ)
-- Run this in Supabase SQL Editor

-- 1. JS number generator (mirrors generate_ticket_ref pattern)
CREATE OR REPLACE FUNCTION generate_js_number()
RETURNS TRIGGER AS $$
DECLARE
  _today text;
  _max_seq integer;
BEGIN
  _today := to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYYMMDD');
  PERFORM pg_advisory_xact_lock(hashtext('js_number_' || _today));
  SELECT COALESCE(MAX(
    CAST(substring(js_number FROM 'JS-' || _today || '-(\d+)') AS integer)
  ), 0) INTO _max_seq
  FROM job_sheets
  WHERE js_number LIKE 'JS-' || _today || '-%';
  NEW.js_number := 'JS-' || _today || '-' || lpad((_max_seq + 1)::text, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Main table
CREATE TABLE job_sheets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  js_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),

  -- Header
  service_date DATE NOT NULL,
  time_start TEXT,
  time_end TEXT,
  service_by TEXT NOT NULL,
  service_by_id UUID REFERENCES profiles(id),

  -- Clinic info (snapshot)
  clinic_code TEXT NOT NULL,
  clinic_name TEXT NOT NULL,
  contact_person TEXT,
  contact_tel TEXT,
  doctor_name TEXT,
  doctor_phone TEXT,
  clinic_email TEXT,

  -- Program info
  program_type TEXT,
  version_before TEXT,
  db_version_before TEXT,

  -- Type of service (multi-select)
  service_types TEXT[] DEFAULT '{}',

  -- Issue
  issue_detail TEXT,
  issue_categories JSONB DEFAULT '[]',

  -- Service detail
  backup_status TEXT,
  service_done TEXT,

  -- Additional
  suggestion TEXT,
  remark TEXT,

  -- Checklist (JSONB — 15 fixed items with checked + notes)
  checklist JSONB DEFAULT '[]',

  -- Important details (JSONB — flexible key-value)
  important_details JSONB DEFAULT '{}',

  -- Charges
  charge_amount NUMERIC(10,2),
  payment_method TEXT,
  need_receipt BOOLEAN DEFAULT false,
  need_invoice BOOLEAN DEFAULT false,

  -- Sign-off
  job_outcome TEXT DEFAULT 'completed' CHECK (job_outcome IN ('completed', 'to_be_continued')),
  customer_rep_name TEXT,

  -- Schedule link (optional)
  schedule_id UUID REFERENCES schedules(id),

  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Trigger to auto-set js_number
CREATE TRIGGER set_js_number
  BEFORE INSERT ON job_sheets
  FOR EACH ROW
  WHEN (NEW.js_number IS NULL OR NEW.js_number = '')
  EXECUTE FUNCTION generate_js_number();

-- 4. RLS
ALTER TABLE job_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage job sheets"
  ON job_sheets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Indexes
CREATE INDEX idx_job_sheets_date ON job_sheets(service_date DESC);
CREATE INDEX idx_job_sheets_created_by ON job_sheets(created_by);
CREATE INDEX idx_job_sheets_schedule_id ON job_sheets(schedule_id);
CREATE INDEX idx_job_sheets_clinic_code ON job_sheets(clinic_code);
CREATE INDEX idx_job_sheets_status ON job_sheets(status);
