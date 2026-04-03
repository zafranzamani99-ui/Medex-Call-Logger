-- Migration 004: ticket_ref auto-generation function
-- WHY: Generates TKT-YYYYMMDD-NNNN format (spec Section 4.3, BR-09).
--
-- CRITICAL FIX: Uses pg_advisory_xact_lock to prevent race conditions.
-- Without this lock, two agents saving tickets at the same millisecond on the
-- same day could get the same sequential number (e.g. both get TKT-20260331-0003).
-- The advisory lock serializes the counter increment per day.
--
-- Uses Malaysia timezone (Asia/Kuala_Lumpur) for the date portion.
-- WHY timezone matters: "today" must be Malaysian today, not UTC today.
-- An agent logging at 11pm MY time (3pm UTC) would get tomorrow's date without this.

CREATE OR REPLACE FUNCTION generate_ticket_ref()
RETURNS TRIGGER AS $$
DECLARE
  _today text;
  _count integer;
  _ref text;
BEGIN
  -- Get today's date in Malaysia timezone
  _today := to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYYMMDD');

  -- Advisory lock: hash of the date string ensures one lock per day
  -- This prevents race conditions when two agents save simultaneously
  PERFORM pg_advisory_xact_lock(hashtext('ticket_ref_' || _today));

  -- Count existing tickets for today
  SELECT COUNT(*) INTO _count
  FROM tickets
  WHERE ticket_ref LIKE 'TKT-' || _today || '-%';

  -- Build ref: TKT-YYYYMMDD-NNNN (1-indexed, zero-padded to 4 digits)
  _ref := 'TKT-' || _today || '-' || lpad((_count + 1)::text, 4, '0');

  NEW.ticket_ref := _ref;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ticket_ref_trigger
  BEFORE INSERT ON tickets
  FOR EACH ROW
  WHEN (NEW.ticket_ref IS NULL)
  EXECUTE FUNCTION generate_ticket_ref();
