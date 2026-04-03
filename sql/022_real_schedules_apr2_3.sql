-- 022: Real schedule data — April 2 & 3, 2026
-- Run this in Supabase SQL Editor
-- WARNING: This DELETES all existing schedules first!

DO $$
DECLARE
  _zafran_id UUID;
  _hareez_id UUID;
  _amirul_id UUID;
  _ainin_id UUID;
  _amali_id UUID;
BEGIN
  -- Look up agent IDs by display name
  SELECT id INTO _zafran_id FROM profiles WHERE LOWER(display_name) LIKE '%zafran%' LIMIT 1;
  SELECT id INTO _hareez_id FROM profiles WHERE LOWER(display_name) LIKE '%hareez%' LIMIT 1;
  SELECT id INTO _amirul_id FROM profiles WHERE LOWER(display_name) LIKE '%amirul%' LIMIT 1;
  SELECT id INTO _ainin_id FROM profiles WHERE LOWER(display_name) LIKE '%ainin%' LIMIT 1;
  SELECT id INTO _amali_id FROM profiles WHERE LOWER(display_name) LIKE '%amali%' LIMIT 1;

  -- Clear ALL existing schedules
  DELETE FROM schedules;
  RAISE NOTICE 'Cleared existing schedules';

  -- ============================================
  -- TODAY: April 2, 2026
  -- ============================================

  -- 1. REM MN: KLINIK RAKYAT KU NAN (PUTRAJAYA) (2:30PM) — ZAFRAN
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('MANUAL', 'KLINIK RAKYAT KU NAN (PUTRAJAYA)', 'Ms. Mass', '2026-04-02', '2:30PM', 'MTN', '~1 hour', 'Zafran', _zafran_id, '014-6621601 clinic WhatsApp', 'Onsite', 'scheduled');

  -- 2. REM EINV SETUP&TRAINING: M1156 KLINIK PANTAI (2PM) — HAREEZ
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('M1156', 'KLINIK PANTAI', 'Kak Anita', '2026-04-02', '2:00PM', 'E-INV + SST', '~1 hour', 'Hareez', _hareez_id, '+60 18-770 9130 / EINV Tin no: C 60394608090', 'Onsite', 'scheduled');

  -- 3. REM MN: KLINIK MEDIPULSE CHERAS (10AM) — HAREEZ
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('MANUAL', 'KLINIK MEDIPULSE CHERAS', NULL, '2026-04-02', '10:00AM', 'MTN', '~1 hour', 'Hareez', _hareez_id, NULL, 'Onsite', 'scheduled');

  -- 4. TRAINING E-INV ONLY / REM MTN E-INV + SST: KLINIK SEGARA (SOLARIS DUTAMAS) (1PM) — AMIRUL
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('MANUAL', 'KLINIK SEGARA (SOLARIS DUTAMAS)', NULL, '2026-04-02', '1:00PM', 'E-INV + SST', '~1 hour', 'Amirul', _amirul_id, 'Training E-INV only', 'Onsite', 'scheduled');

  -- 5. REM MTN: CHAKRA EMAS MEDICAL SDN. BHD (4PM) — ZAFRAN
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('MANUAL', 'CHAKRA EMAS MEDICAL SDN. BHD', NULL, '2026-04-02', '4:00PM', 'MTN', '~1 hour', 'Zafran', _zafran_id, NULL, 'Onsite', 'scheduled');

  -- 6. REM UPDATE: TOP VISION SA (3:30PM) — AININ
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, custom_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('MANUAL', 'TOP VISION SA', NULL, '2026-04-02', '3:30PM', 'Others', 'Update', NULL, 'Ainin', _ainin_id, NULL, 'Remote', 'scheduled');

  -- 7. REM UPDATE: KLINIK UNION MEDIC (MOUNT AUSTIN) (2PM) — AMIRUL
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, custom_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('MANUAL', 'KLINIK UNION MEDIC (MOUNT AUSTIN)', NULL, '2026-04-02', '2:00PM', 'Others', 'Update', NULL, 'Amirul', _amirul_id, NULL, 'Remote', 'scheduled');

  -- 8. AMALI — Replacement Leave (full day)
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, custom_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('MANUAL', 'REPLACEMENT LEAVE', NULL, '2026-04-02', '9:00AM', 'Others', 'Leave', 'Full day', 'Amali', _amali_id, 'Replacement leave', 'Onsite', 'scheduled');

  -- ============================================
  -- TOMORROW: April 3, 2026
  -- ============================================

  -- 1. REM MN: I CARE FAMILY CLINIC (2:30PM) — ZAFRAN
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('MANUAL', 'I CARE FAMILY CLINIC', 'Dr Chew', '2026-04-03', '2:30PM', 'MTN', '~1 hour', 'Zafran', _zafran_id, '017-8710145 clinic WhatsApp', 'Onsite', 'scheduled');

  -- 2. REM ISP1 + E-INV + WHATSAPP + CLOUD BACKUP: KLINIK PUVVAN (SETIA INDAH) (2:30PM) — AMALI
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, custom_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('MANUAL', 'KLINIK PUVVAN (SETIA INDAH)', NULL, '2026-04-03', '2:30PM', 'Others', 'ISP1 + E-INV + WhatsApp + Cloud Backup', NULL, 'Amali', _amali_id, '012-7570314', 'Onsite', 'scheduled');

  -- 3. CONSOLIDATED EINVOICE: KLINIK S.SOCKALINGAM (12:30PM) — AMIRUL
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('MANUAL', 'KLINIK S.SOCKALINGAM', NULL, '2026-04-03', '12:30PM', 'E-INV + SST', '~1 hour', 'Amirul', _amirul_id, '019-2157172 / Consolidated E-Invoice', 'Remote', 'scheduled');

  -- 4. REM MN: KLINIK DR SURAYA (10AM) — AMALI
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('MANUAL', 'KLINIK DR SURAYA', 'Ms Farhana', '2026-04-03', '10:00AM', 'MTN', '~1 hour', 'Amali', _amali_id, '016-6464739 / 03-89203141 (landline) clinic WhatsApp', 'Onsite', 'scheduled');

  -- 5. REM MN: KLINIK SAUJANA SDN BHD (4PM) — AMALI
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('MANUAL', 'KLINIK SAUJANA SDN BHD', NULL, '2026-04-03', '4:00PM', 'MTN', '~1 hour', 'Amali', _amali_id, NULL, 'Onsite', 'scheduled');

  -- 6. CLAIMEX UAT TRAINING: UNISEM (PROVIDER) (3PM) — AININ
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('MANUAL', 'UNISEM (PROVIDER)', NULL, '2026-04-03', '3:00PM', 'Training', 'Varies', 'Ainin', _ainin_id, 'Claimex UAT Training', 'Remote', 'scheduled');

  -- 7. REM UPDATE: TOP VISION KULAI (AM) — AININ
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, custom_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('MANUAL', 'TOP VISION KULAI', NULL, '2026-04-03', '9:00AM', 'Others', 'Update', NULL, 'Ainin', _ainin_id, NULL, 'Remote', 'scheduled');

  -- 8. REM UPDATE: TOP VISION BATU PAHAT (AM) — AININ
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, custom_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('MANUAL', 'TOP VISION BATU PAHAT', NULL, '2026-04-03', '9:30AM', 'Others', 'Update', NULL, 'Ainin', _ainin_id, NULL, 'Remote', 'scheduled');

  -- 9. REM UPDATE: KLINIK DHARAN (11AM) — ZAFRAN
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, custom_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('MANUAL', 'KLINIK DHARAN', NULL, '2026-04-03', '11:00AM', 'Others', 'Update', NULL, 'Zafran', _zafran_id, NULL, 'Remote', 'scheduled');

  -- 10. REM EINV SETUP&TRAINING: M1156 KLINIK PANTAI (2:30PM) — HAREEZ
  INSERT INTO schedules (clinic_code, clinic_name, pic, schedule_date, schedule_time, schedule_type, duration_estimate, agent_name, agent_id, notes, mode, status)
  VALUES ('M1156', 'KLINIK PANTAI', 'Kak Anita', '2026-04-03', '2:30PM', 'E-INV + SST', '~1 hour', 'Hareez', _hareez_id, '+60 18-770 9130 / EINV Tin no: C 60394608090', 'Onsite', 'scheduled');

  RAISE NOTICE 'Inserted 8 schedules for Apr 2 + 10 schedules for Apr 3 = 18 total';
END $$;
