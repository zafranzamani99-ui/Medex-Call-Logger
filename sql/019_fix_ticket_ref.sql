-- 019: Fix ticket_ref generation — use MAX instead of COUNT
-- WHY: COUNT breaks when tickets are deleted mid-day.
-- Example: 3 tickets (001, 002, 003), delete 003, next insert gets COUNT=2 → 003 again → duplicate!
-- FIX: Extract the max sequence number instead, so deletions don't cause collisions.
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION generate_ticket_ref()
RETURNS TRIGGER AS $$
DECLARE
  _today text;
  _max_seq integer;
  _ref text;
BEGIN
  -- Get today's date in Malaysia timezone
  _today := to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYYMMDD');

  -- Advisory lock: hash of the date string ensures one lock per day
  PERFORM pg_advisory_xact_lock(hashtext('ticket_ref_' || _today));

  -- Get the highest sequence number used today (not COUNT — survives deletions)
  SELECT COALESCE(MAX(
    CAST(substring(ticket_ref FROM 'TKT-' || _today || '-(\d+)') AS integer)
  ), 0) INTO _max_seq
  FROM tickets
  WHERE ticket_ref LIKE 'TKT-' || _today || '-%';

  -- Build ref: TKT-YYYYMMDD-NNNN
  _ref := 'TKT-' || _today || '-' || lpad((_max_seq + 1)::text, 4, '0');

  NEW.ticket_ref := _ref;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
