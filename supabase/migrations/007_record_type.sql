-- Migration 007: Split Call Logs from Tickets
-- WHY: The app treats every call as a "ticket", but the real workflow is:
--   - Call Log (80%): Agent answers phone, helps clinic, logs it. Usually resolved immediately.
--   - Ticket (20%): Unusual issue needing engineer investigation/escalation.
-- This migration adds a record_type discriminator to distinguish them.

-- 1. Add record_type column (default 'call' — most records are call logs)
ALTER TABLE tickets
  ADD COLUMN record_type text NOT NULL DEFAULT 'call';

ALTER TABLE tickets
  ADD CONSTRAINT chk_record_type CHECK (record_type IN ('call', 'ticket'));

-- 2. Index for filtering by record type
CREATE INDEX idx_tickets_record_type ON tickets(record_type);

-- WHY: Dashboard "open tickets" query filters by record_type='ticket' + status != 'Resolved'
CREATE INDEX idx_tickets_open_type ON tickets(record_type, status, last_activity_at)
  WHERE status != 'Resolved' AND record_type = 'ticket';

-- 3. Update generate_ticket_ref() to use CLG- or TKT- prefix based on record_type
CREATE OR REPLACE FUNCTION generate_ticket_ref()
RETURNS TRIGGER AS $$
DECLARE
  _today text;
  _prefix text;
  _count integer;
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

  -- Count existing records with this prefix for today
  SELECT COUNT(*) INTO _count
  FROM tickets
  WHERE ticket_ref LIKE _prefix || '-' || _today || '-%';

  _ref := _prefix || '-' || _today || '-' || lpad((_count + 1)::text, 4, '0');
  NEW.ticket_ref := _ref;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create promote_to_ticket() RPC function
-- WHY: When an agent realizes a call log needs engineering attention, they "escalate" it.
-- This atomically changes record_type + regenerates the ref from CLG→TKT.
-- Uses advisory lock to prevent race conditions with concurrent ticket creation.
CREATE OR REPLACE FUNCTION promote_to_ticket(p_ticket_id uuid)
RETURNS text AS $$
DECLARE
  _today text;
  _count integer;
  _new_ref text;
  _current_type text;
BEGIN
  -- Check current type
  SELECT record_type INTO _current_type FROM tickets WHERE id = p_ticket_id;
  IF _current_type IS NULL THEN
    RAISE EXCEPTION 'Record not found';
  END IF;
  IF _current_type = 'ticket' THEN
    RAISE EXCEPTION 'Already a ticket';
  END IF;

  _today := to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYYMMDD');
  PERFORM pg_advisory_xact_lock(hashtext('TKT_ref_' || _today));

  SELECT COUNT(*) INTO _count
  FROM tickets
  WHERE ticket_ref LIKE 'TKT-' || _today || '-%';

  _new_ref := 'TKT-' || _today || '-' || lpad((_count + 1)::text, 4, '0');

  UPDATE tickets
  SET record_type = 'ticket',
      ticket_ref = _new_ref
  WHERE id = p_ticket_id;

  RETURN _new_ref;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
