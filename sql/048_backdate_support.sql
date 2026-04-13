-- 048: Backdate support — submitted_at column + ticket_ref uses created_at
-- WHY: When agents backdate a call log, created_at is set to the past date.
-- But ticket_ref was using now() — causing a mismatch (ref says April 10, ticket says March 31).
-- Also adds submitted_at column for audit trail: if created_at != submitted_at, it was backdated.
-- Run this in Supabase SQL Editor

-- 1. Add submitted_at column — always stores the real submission time
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now();

-- 2. Backfill existing tickets — set submitted_at = created_at (they weren't backdated)
UPDATE tickets SET submitted_at = created_at WHERE submitted_at IS NULL OR submitted_at = now();

-- 3. Fix generate_ticket_ref() — use NEW.created_at instead of now()
-- This makes the date in CLG-YYYYMMDD-NNNN match the actual ticket date
CREATE OR REPLACE FUNCTION generate_ticket_ref()
RETURNS TRIGGER AS $$
DECLARE
  _today text;
  _prefix text;
  _max_seq integer;
  _ref text;
BEGIN
  -- Use created_at for the date portion (supports backdating)
  -- COALESCE fallback to now() if created_at not provided
  _today := to_char(COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYYMMDD');

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
