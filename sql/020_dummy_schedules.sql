-- 020: Dummy schedule data for testing calendar overflow
-- Run this in Supabase SQL Editor AFTER 018_schedules.sql
-- Replace YOUR_USER_ID below with your actual profile id from the profiles table.
-- To find it: SELECT id, display_name FROM profiles;

-- HOW TO USE:
-- 1. Run: SELECT id, display_name FROM profiles;
-- 2. Copy your user ID
-- 3. Find-replace 'REPLACE_WITH_YOUR_ID' below with that ID
-- 4. Run this script

DO $$
DECLARE
  _uid UUID;
  _name TEXT;
BEGIN
  -- Get the first user (or change this to a specific user)
  SELECT id, display_name INTO _uid, _name FROM profiles LIMIT 1;

  -- April 2, 2026 — 10 schedules on one day (stress test)
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, duration_estimate, agent_name, agent_id, notes, status) VALUES
  ('K001', 'KLINIK FADZLIYANA', 'Dr. Fadzliyana', '2026-04-02', '8:00AM', 'MTN', '~1 hour', _name, _uid, 'Monthly maintenance', 'scheduled'),
  ('K002', 'KLINIK SANDHU', 'Dr. Sandhu', '2026-04-02', '9:30AM', 'Server Migration', '~1.5 to 2 hours', _name, _uid, 'Migrate to new server', 'scheduled'),
  ('K003', 'KLINIK MEDIVIRON SETIA ALAM', 'Nurse Aini', '2026-04-02', '10:00AM', 'E-INV + SST', '~1 hour', _name, _uid, 'E-Invoice setup', 'scheduled'),
  ('K004', 'KLINIK ALAM MEDIC', 'Dr. Alam', '2026-04-02', '11:00AM', 'WhatsApp', '~30 minutes', _name, _uid, 'WhatsApp integration', 'scheduled'),
  ('K005', 'KLINIK CAHAYA', 'Pn. Siti', '2026-04-02', '11:30AM', 'Training', 'Varies', _name, _uid, 'Staff training on new module', 'scheduled'),
  ('K006', 'KLINIK PRIMA', 'Dr. Rahman', '2026-04-02', '1:00PM', 'MTN', '~1 hour', _name, _uid, NULL, 'scheduled'),
  ('K007', 'KLINIK BESTARI', 'Nurse Lim', '2026-04-02', '2:00PM', 'Server Migration', '~1.5 to 2 hours', _name, _uid, 'Server upgrade v2', 'scheduled'),
  ('K008', 'KLINIK HARMONI', 'Dr. Tan', '2026-04-02', '3:00PM', 'E-INV + SST', '~1 hour', _name, _uid, 'SST config', 'completed'),
  ('K009', 'KLINIK IDAMAN', 'Pn. Ros', '2026-04-02', '4:00PM', 'WhatsApp', '~30 minutes', _name, _uid, NULL, 'scheduled'),
  ('K010', 'KLINIK JAYA', 'Dr. Kumar', '2026-04-02', '5:00PM', 'Training', 'Varies', _name, _uid, 'End of day training', 'cancelled');

  -- Spread some across the month for a realistic look
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, duration_estimate, agent_name, agent_id, notes, status) VALUES
  ('K011', 'KLINIK SERI KEMBANGAN', 'Dr. Lee', '2026-04-03', '9:00AM', 'MTN', '~1 hour', _name, _uid, NULL, 'scheduled'),
  ('K012', 'KLINIK SUBANG', 'Dr. Ravi', '2026-04-03', '2:00PM', 'E-INV + SST', '~1 hour', _name, _uid, NULL, 'scheduled'),
  ('K013', 'KLINIK TROPICANA', 'Nurse Amy', '2026-04-07', '10:00AM', 'Server Migration', '~1.5 to 2 hours', _name, _uid, 'Full migration', 'scheduled'),
  ('K014', 'KLINIK WANGSA MAJU', 'Dr. Farid', '2026-04-07', '3:00PM', 'WhatsApp', '~30 minutes', _name, _uid, NULL, 'scheduled'),
  ('K015', 'KLINIK AMPANG', 'Dr. Nadia', '2026-04-10', '9:00AM', 'Training', 'Varies', _name, _uid, 'New staff onboarding', 'scheduled'),
  ('K016', 'KLINIK BANGSAR', 'Pn. Zara', '2026-04-14', '10:00AM', 'MTN', '~1 hour', _name, _uid, NULL, 'scheduled'),
  ('K017', 'KLINIK DAMANSARA', 'Dr. Hafiz', '2026-04-14', '2:00PM', 'E-INV + SST', '~1 hour', _name, _uid, NULL, 'scheduled'),
  ('K018', 'KLINIK PUCHONG', 'Nurse Mei', '2026-04-18', '11:00AM', 'Server Migration', '~1.5 to 2 hours', _name, _uid, NULL, 'scheduled'),
  ('K019', 'KLINIK SHAH ALAM', 'Dr. Aziz', '2026-04-22', '9:00AM', 'MTN', '~1 hour', _name, _uid, NULL, 'scheduled'),
  ('K020', 'KLINIK PETALING JAYA', 'Dr. Wong', '2026-04-25', '10:00AM', 'WhatsApp', '~30 minutes', _name, _uid, NULL, 'scheduled'),
  ('K021', 'KLINIK KLANG', 'Pn. Ani', '2026-04-28', '2:00PM', 'Training', 'Varies', _name, _uid, 'Module 5 training', 'scheduled');

  RAISE NOTICE 'Inserted 21 dummy schedules for user % (%)', _name, _uid;
END $$;
