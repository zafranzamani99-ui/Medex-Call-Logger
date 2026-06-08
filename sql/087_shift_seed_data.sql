-- 087: Seed shift data from existing Excel spreadsheets
-- Saturday roster (Jan–May 2026), Standby schedule (Feb–Jun 2026), Replacement leave

DO $$
DECLARE
  _ainin_id uuid; _ainin text;
  _amali_id uuid; _amali text;
  _amirul_id uuid; _amirul text;
  _hareez_id uuid; _hareez text;
  _zafran_id uuid; _zafran text;
BEGIN
  SELECT id, display_name INTO _ainin_id, _ainin FROM profiles WHERE lower(display_name) LIKE '%ainin%' LIMIT 1;
  SELECT id, display_name INTO _amali_id, _amali FROM profiles WHERE lower(display_name) LIKE '%amali%' LIMIT 1;
  SELECT id, display_name INTO _amirul_id, _amirul FROM profiles WHERE lower(display_name) LIKE '%amirul%' LIMIT 1;
  SELECT id, display_name INTO _hareez_id, _hareez FROM profiles WHERE lower(display_name) LIKE '%hareez%' LIMIT 1;
  SELECT id, display_name INTO _zafran_id, _zafran FROM profiles WHERE lower(display_name) LIKE '%zafran%' LIMIT 1;

  -- ── SATURDAY SHIFTS ──────────────────────────────────────────────────

  -- Jan 2026
  INSERT INTO saturday_shifts (shift_date, staff) VALUES
    ('2026-01-03', jsonb_build_array(jsonb_build_object('id', _ainin_id, 'name', _ainin))),
    ('2026-01-10', jsonb_build_array(jsonb_build_object('id', _amirul_id, 'name', _amirul), jsonb_build_object('id', _zafran_id, 'name', _zafran))),
    ('2026-01-17', jsonb_build_array(jsonb_build_object('id', _hareez_id, 'name', _hareez))),
    ('2026-01-24', jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali))),
    ('2026-01-31', jsonb_build_array(jsonb_build_object('id', _ainin_id, 'name', _ainin)))
  ON CONFLICT (shift_date) DO NOTHING;

  -- Feb 2026
  INSERT INTO saturday_shifts (shift_date, staff) VALUES
    ('2026-02-07', jsonb_build_array(jsonb_build_object('id', _amirul_id, 'name', _amirul), jsonb_build_object('id', _zafran_id, 'name', _zafran))),
    ('2026-02-14', jsonb_build_array(jsonb_build_object('id', _hareez_id, 'name', _hareez))),
    ('2026-02-21', jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali), jsonb_build_object('id', _amirul_id, 'name', _amirul))),
    ('2026-02-28', jsonb_build_array(jsonb_build_object('id', _ainin_id, 'name', _ainin), jsonb_build_object('id', _amirul_id, 'name', _amirul)))
  ON CONFLICT (shift_date) DO NOTHING;

  -- Mar 2026 (skip Mar 7 Nuzul Quran, Mar 21 Raya Aidilfitri)
  INSERT INTO saturday_shifts (shift_date, staff) VALUES
    ('2026-03-14', jsonb_build_array(jsonb_build_object('id', _amirul_id, 'name', _amirul), jsonb_build_object('id', _amali_id, 'name', _amali), jsonb_build_object('id', _zafran_id, 'name', _zafran))),
    ('2026-03-28', jsonb_build_array(jsonb_build_object('id', _hareez_id, 'name', _hareez)))
  ON CONFLICT (shift_date) DO NOTHING;

  -- Apr 2026
  INSERT INTO saturday_shifts (shift_date, staff) VALUES
    ('2026-04-04', jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali))),
    ('2026-04-11', jsonb_build_array(jsonb_build_object('id', _ainin_id, 'name', _ainin), jsonb_build_object('id', _amirul_id, 'name', _amirul))),
    ('2026-04-18', jsonb_build_array(jsonb_build_object('id', _amirul_id, 'name', _amirul), jsonb_build_object('id', _hareez_id, 'name', _hareez), jsonb_build_object('id', _zafran_id, 'name', _zafran))),
    ('2026-04-25', jsonb_build_array(jsonb_build_object('id', _hareez_id, 'name', _hareez), jsonb_build_object('id', _amirul_id, 'name', _amirul)))
  ON CONFLICT (shift_date) DO NOTHING;

  -- May 2026
  INSERT INTO saturday_shifts (shift_date, staff) VALUES
    ('2026-05-02', jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali))),
    ('2026-05-09', jsonb_build_array(jsonb_build_object('id', _ainin_id, 'name', _ainin), jsonb_build_object('id', _amirul_id, 'name', _amirul))),
    ('2026-05-16', jsonb_build_array(jsonb_build_object('id', _amirul_id, 'name', _amirul)))
  ON CONFLICT (shift_date) DO NOTHING;

  -- ── STANDBY SHIFTS (Mon–Sun weeks) ───────────────────────────────────

  -- Feb 2026
  INSERT INTO standby_shifts (week_start, week_end, weekday_staff, weekend_staff) VALUES
    ('2026-02-02', '2026-02-08',
      jsonb_build_array(jsonb_build_object('id', _ainin_id, 'name', _ainin)),
      jsonb_build_array(jsonb_build_object('id', _amirul_id, 'name', _amirul))),
    ('2026-02-09', '2026-02-15',
      jsonb_build_array(jsonb_build_object('id', _amirul_id, 'name', _amirul)),
      jsonb_build_array(jsonb_build_object('id', _ainin_id, 'name', _ainin))),
    ('2026-02-16', '2026-02-22',
      jsonb_build_array(jsonb_build_object('id', _ainin_id, 'name', _ainin)),
      jsonb_build_array(jsonb_build_object('id', _amirul_id, 'name', _amirul), jsonb_build_object('id', _ainin_id, 'name', _ainin))),
    ('2026-02-23', '2026-03-01',
      jsonb_build_array(jsonb_build_object('id', _amirul_id, 'name', _amirul)),
      jsonb_build_array(jsonb_build_object('id', _amirul_id, 'name', _amirul)))
  ON CONFLICT (week_start) DO NOTHING;

  -- Mar 2026
  INSERT INTO standby_shifts (week_start, week_end, weekday_staff, weekend_staff) VALUES
    ('2026-03-02', '2026-03-08',
      jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali)),
      jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali))),
    ('2026-03-09', '2026-03-15',
      jsonb_build_array(jsonb_build_object('id', _hareez_id, 'name', _hareez)),
      jsonb_build_array(jsonb_build_object('id', _hareez_id, 'name', _hareez))),
    ('2026-03-16', '2026-03-22',
      jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali)),
      jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali))),
    ('2026-03-23', '2026-03-29',
      jsonb_build_array(jsonb_build_object('id', _hareez_id, 'name', _hareez)),
      jsonb_build_array(jsonb_build_object('id', _hareez_id, 'name', _hareez)))
  ON CONFLICT (week_start) DO NOTHING;

  -- Apr 2026
  INSERT INTO standby_shifts (week_start, week_end, weekday_staff, weekend_staff) VALUES
    ('2026-03-30', '2026-04-05',
      jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali)),
      jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali))),
    ('2026-04-06', '2026-04-12',
      jsonb_build_array(jsonb_build_object('id', _ainin_id, 'name', _ainin)),
      jsonb_build_array(jsonb_build_object('id', _amirul_id, 'name', _amirul))),
    ('2026-04-13', '2026-04-19',
      jsonb_build_array(jsonb_build_object('id', _amirul_id, 'name', _amirul)),
      jsonb_build_array(jsonb_build_object('id', _amirul_id, 'name', _amirul))),
    ('2026-04-20', '2026-04-26',
      jsonb_build_array(jsonb_build_object('id', _ainin_id, 'name', _ainin)),
      jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali))),
    ('2026-04-27', '2026-05-03',
      jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali)),
      jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali)))
  ON CONFLICT (week_start) DO NOTHING;

  -- May 2026
  INSERT INTO standby_shifts (week_start, week_end, weekday_staff, weekend_staff) VALUES
    ('2026-05-04', '2026-05-10',
      jsonb_build_array(jsonb_build_object('id', _amirul_id, 'name', _amirul)),
      jsonb_build_array(jsonb_build_object('id', _ainin_id, 'name', _ainin))),
    ('2026-05-11', '2026-05-17',
      jsonb_build_array(jsonb_build_object('id', _ainin_id, 'name', _ainin)),
      jsonb_build_array(jsonb_build_object('id', _amirul_id, 'name', _amirul))),
    ('2026-05-18', '2026-05-24',
      jsonb_build_array(jsonb_build_object('id', _amirul_id, 'name', _amirul)),
      jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali))),
    ('2026-05-25', '2026-05-31',
      jsonb_build_array(jsonb_build_object('id', _ainin_id, 'name', _ainin)),
      jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali)))
  ON CONFLICT (week_start) DO NOTHING;

  -- Jun 2026
  INSERT INTO standby_shifts (week_start, week_end, weekday_staff, weekend_staff) VALUES
    ('2026-06-01', '2026-06-07',
      jsonb_build_array(jsonb_build_object('id', _hareez_id, 'name', _hareez)),
      jsonb_build_array(jsonb_build_object('id', _hareez_id, 'name', _hareez))),
    ('2026-06-08', '2026-06-14',
      jsonb_build_array(jsonb_build_object('id', _hareez_id, 'name', _hareez)),
      jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali))),
    ('2026-06-15', '2026-06-21',
      jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali)),
      jsonb_build_array(jsonb_build_object('id', _hareez_id, 'name', _hareez))),
    ('2026-06-22', '2026-06-28',
      jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali)),
      jsonb_build_array(jsonb_build_object('id', _amali_id, 'name', _amali))),
    ('2026-06-29', '2026-07-05',
      jsonb_build_array(jsonb_build_object('id', _hareez_id, 'name', _hareez)),
      jsonb_build_array(jsonb_build_object('id', _hareez_id, 'name', _hareez)))
  ON CONFLICT (week_start) DO NOTHING;

  -- ── REPLACEMENT LEAVES ───────────────────────────────────────────────

  INSERT INTO replacement_leaves (staff_id, staff_name, leave_date, duration) VALUES
    -- Feb standby RL
    (_ainin_id,  _ainin,  '2026-02-20', 1),
    (_amirul_id, _amirul, '2026-02-23', 1),
    (_ainin_id,  _ainin,  '2026-02-27', 1),
    (_ainin_id,  _ainin,  '2026-03-02', 1),
    (_amirul_id, _amirul, '2026-03-09', 1),
    -- Mar standby RL
    (_amali_id,  _amali,  '2026-03-18', 1),
    (_amali_id,  _amali,  '2026-03-27', 1),
    (_hareez_id, _hareez, '2026-04-07', 1),
    (_hareez_id, _hareez, '2026-04-14', 1),
    (_amali_id,  _amali,  '2026-04-02', 1),
    (_amali_id,  _amali,  '2026-04-22', 1),
    (_amali_id,  _amali,  '2026-04-24', 1),
    -- Apr standby RL
    (_ainin_id,  _ainin,  '2026-04-16', 0.5),
    (_amirul_id, _amirul, '2026-04-17', 1),
    (_ainin_id,  _ainin,  '2026-05-22', 1),
    (_amirul_id, _amirul, '2026-05-28', 1),
    (_amirul_id, _amirul, '2026-05-29', 1),
    (_ainin_id,  _ainin,  '2026-06-15', 1),
    (_ainin_id,  _ainin,  '2026-06-23', 1),
    -- Jun standby RL
    (_hareez_id, _hareez, '2026-06-11', 1),
    (_hareez_id, _hareez, '2026-06-18', 0.5),
    (_hareez_id, _hareez, '2026-06-19', 1)
  ON CONFLICT (staff_id, leave_date) DO NOTHING;

END $$;
