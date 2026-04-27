-- 070: Public holidays calendar
-- WHY: Surface Malaysian public holidays + state holidays on the schedule calendar
-- so users don't accidentally schedule clinic visits on Hari Raya or Merdeka Day.
-- The create form warns inline (warn-but-allow); admin can edit via settings.
--
-- Scope codes:
--   'federal' = applies nationwide
--   Malaysian state codes: SEL, KUL, PNG, JHR, KDH, KTN, MLK, NSN, PHG, PRK,
--                          PLS, SBH, SWK, TRG, LBN, PJY
--
-- IMPORTANT: 2026 lunar/Islamic dates below are calendar estimates. Admin should
-- verify against the official Malaysia gazette and edit via Settings → Public
-- Holidays before relying on them for compliance-grade scheduling.

CREATE TABLE IF NOT EXISTS public_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'federal',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE(holiday_date, scope, name)
);

CREATE INDEX IF NOT EXISTS idx_public_holidays_date ON public_holidays(holiday_date);
CREATE INDEX IF NOT EXISTS idx_public_holidays_scope ON public_holidays(scope);

-- RLS — same pattern as schedules (sql/018)
ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage public holidays" ON public_holidays;
CREATE POLICY "Authenticated users can manage public holidays"
  ON public_holidays FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2026 Federal holidays (Malaysia)
INSERT INTO public_holidays (holiday_date, name, scope) VALUES
  ('2026-01-01', 'New Year''s Day', 'federal'),
  ('2026-02-17', 'Chinese New Year', 'federal'),
  ('2026-02-18', 'Chinese New Year (Day 2)', 'federal'),
  ('2026-03-21', 'Hari Raya Aidilfitri', 'federal'),
  ('2026-03-22', 'Hari Raya Aidilfitri (Day 2)', 'federal'),
  ('2026-05-01', 'Labour Day', 'federal'),
  ('2026-05-27', 'Hari Raya Haji', 'federal'),
  ('2026-05-31', 'Wesak Day', 'federal'),
  ('2026-06-01', 'Agong''s Birthday', 'federal'),
  ('2026-06-16', 'Awal Muharram', 'federal'),
  ('2026-08-25', 'Maulidur Rasul', 'federal'),
  ('2026-08-31', 'Merdeka Day', 'federal'),
  ('2026-09-16', 'Malaysia Day', 'federal'),
  ('2026-11-08', 'Deepavali', 'federal'),
  ('2026-12-25', 'Christmas Day', 'federal')
ON CONFLICT (holiday_date, scope, name) DO NOTHING;

-- 2026 State holidays — Federal Territories
INSERT INTO public_holidays (holiday_date, name, scope) VALUES
  ('2026-02-01', 'Federal Territory Day', 'KUL'),
  ('2026-02-01', 'Federal Territory Day', 'LBN'),
  ('2026-02-01', 'Federal Territory Day', 'PJY')
ON CONFLICT (holiday_date, scope, name) DO NOTHING;

-- 2026 State holidays — Sultan / Yang di-Pertuan Besar birthdays + state-specific.
-- These are the major recurring ones; admin can add more via settings.
INSERT INTO public_holidays (holiday_date, name, scope) VALUES
  ('2026-03-04', 'Installation of Sultan of Terengganu', 'TRG'),
  ('2026-04-15', 'Sultan of Johor''s Birthday', 'JHR'),
  ('2026-04-26', 'Sultan of Terengganu''s Birthday', 'TRG'),
  ('2026-05-07', 'Hari Hol Pahang', 'PHG'),
  ('2026-05-17', 'Raja Perlis''s Birthday', 'PLS'),
  ('2026-07-07', 'Penang Governor''s Birthday', 'PNG'),
  ('2026-07-22', 'Sarawak Day', 'SWK'),
  ('2026-07-30', 'Sultan of Pahang''s Birthday', 'PHG'),
  ('2026-08-24', 'Hari Hol Almarhum Sultan Iskandar', 'JHR'),
  ('2026-09-29', 'Yang di-Pertuan Besar Negeri Sembilan''s Birthday', 'NSN'),
  ('2026-10-10', 'Sarawak Governor''s Birthday', 'SWK'),
  ('2026-10-10', 'Sabah Governor''s Birthday', 'SBH'),
  ('2026-11-05', 'Sultan of Perak''s Birthday', 'PRK'),
  ('2026-12-11', 'Sultan of Selangor''s Birthday', 'SEL'),
  ('2026-12-24', 'Christmas Eve', 'KDH')
ON CONFLICT (holiday_date, scope, name) DO NOTHING;
