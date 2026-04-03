-- 026: Fix ticket_ref generation — restore CLG-/TKT- prefix branching with MAX fix
-- WHY: Migration 019 fixed a COUNT→MAX bug (deletions caused duplicate refs) but
-- accidentally lost the CLG-/TKT- prefix branching from migration 007.
-- Result: all records get TKT- prefix, even call logs.
-- FIX: Merge MAX-based sequence from 019 with prefix branching from 007.
-- Also fix promote_to_ticket() and demote_to_call() to use MAX instead of COUNT.
-- Run this in Supabase SQL Editor

-- 1. Fix generate_ticket_ref() — MAX + prefix branching
CREATE OR REPLACE FUNCTION generate_ticket_ref()
RETURNS TRIGGER AS $$
DECLARE
  _today text;
  _prefix text;
  _max_seq integer;
  _ref text;
BEGIN
  _today := to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYYMMDD');

  -- Choose prefix based on record_type
  IF NEW.record_type = 'ticket' THEN
    _prefix := 'TKT';
  ELSE
    _prefix := 'CLG';
  END IF;

  -- Lock per prefix+day to prevent race conditions
  PERFORM pg_advisory_xact_lock(hashtext(_prefix || '_ref_' || _today));

  -- Get highest sequence number (MAX, not COUNT — survives deletions)
  SELECT COALESCE(MAX(
    CAST(substring(ticket_ref FROM _prefix || '-' || _today || '-(\d+)') AS integer)
  ), 0) INTO _max_seq
  FROM tickets
  WHERE ticket_ref LIKE _prefix || '-' || _today || '-%';

  _ref := _prefix || '-' || _today || '-' || lpad((_max_seq + 1)::text, 4, '0');
  NEW.ticket_ref := _ref;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Fix promote_to_ticket() — use MAX instead of COUNT
CREATE OR REPLACE FUNCTION promote_to_ticket(p_ticket_id uuid)
RETURNS text AS $$
DECLARE
  _today text;
  _max_seq integer;
  _new_ref text;
  _current_type text;
BEGIN
  SELECT record_type INTO _current_type FROM tickets WHERE id = p_ticket_id;
  IF _current_type IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF _current_type = 'ticket' THEN RAISE EXCEPTION 'Already a ticket'; END IF;

  _today := to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYYMMDD');
  PERFORM pg_advisory_xact_lock(hashtext('TKT_ref_' || _today));

  SELECT COALESCE(MAX(
    CAST(substring(ticket_ref FROM 'TKT-' || _today || '-(\d+)') AS integer)
  ), 0) INTO _max_seq
  FROM tickets
  WHERE ticket_ref LIKE 'TKT-' || _today || '-%';

  _new_ref := 'TKT-' || _today || '-' || lpad((_max_seq + 1)::text, 4, '0');

  UPDATE tickets SET record_type = 'ticket', ticket_ref = _new_ref WHERE id = p_ticket_id;
  RETURN _new_ref;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Fix demote_to_call() — use MAX instead of COUNT
CREATE OR REPLACE FUNCTION demote_to_call(p_ticket_id uuid)
RETURNS text AS $$
DECLARE
  _today text;
  _max_seq integer;
  _new_ref text;
  _current_type text;
BEGIN
  SELECT record_type INTO _current_type FROM tickets WHERE id = p_ticket_id;
  IF _current_type IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF _current_type = 'call' THEN RAISE EXCEPTION 'Already a call log'; END IF;

  _today := to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYYMMDD');
  PERFORM pg_advisory_xact_lock(hashtext('CLG_ref_' || _today));

  SELECT COALESCE(MAX(
    CAST(substring(ticket_ref FROM 'CLG-' || _today || '-(\d+)') AS integer)
  ), 0) INTO _max_seq
  FROM tickets
  WHERE ticket_ref LIKE 'CLG-' || _today || '-%';

  _new_ref := 'CLG-' || _today || '-' || lpad((_max_seq + 1)::text, 4, '0');

  UPDATE tickets SET record_type = 'call', ticket_ref = _new_ref WHERE id = p_ticket_id;
  RETURN _new_ref;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Optional: Fix existing call logs that wrongly have TKT- prefix
-- Uncomment and run ONCE if you want to correct historical data.
-- WARNING: This changes ticket_ref values — bookmarks/links to old refs will break.
--
-- UPDATE tickets
-- SET ticket_ref = 'CLG' || substring(ticket_ref FROM 4)
-- WHERE record_type = 'call' AND ticket_ref LIKE 'TKT-%';
