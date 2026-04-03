-- Migration 014: demote_to_call RPC
-- WHY: Reverse of promote_to_ticket(). When a TKT should actually be a call log,
-- this atomically changes record_type + regenerates the ref from TKT→CLG.

CREATE OR REPLACE FUNCTION demote_to_call(p_ticket_id uuid)
RETURNS text AS $$
DECLARE
  _today text;
  _count integer;
  _new_ref text;
  _current_type text;
BEGIN
  SELECT record_type INTO _current_type FROM tickets WHERE id = p_ticket_id;
  IF _current_type IS NULL THEN
    RAISE EXCEPTION 'Record not found';
  END IF;
  IF _current_type = 'call' THEN
    RAISE EXCEPTION 'Already a call log';
  END IF;

  _today := to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYYMMDD');
  PERFORM pg_advisory_xact_lock(hashtext('CLG_ref_' || _today));

  SELECT COUNT(*) INTO _count
  FROM tickets
  WHERE ticket_ref LIKE 'CLG-' || _today || '-%';

  _new_ref := 'CLG-' || _today || '-' || lpad((_count + 1)::text, 4, '0');

  UPDATE tickets
  SET record_type = 'call',
      ticket_ref = _new_ref
  WHERE id = p_ticket_id;

  RETURN _new_ref;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
