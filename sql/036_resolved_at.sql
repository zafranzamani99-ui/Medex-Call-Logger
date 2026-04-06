-- 036: Add resolved_at timestamp + trigger
-- WHY: QA audit identified missing metric — no way to calculate resolution time.
-- This column auto-sets when status changes to "Resolved", clears when re-opened.
-- Run this in Supabase SQL Editor

-- Step 1: Add the column
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Step 2: Backfill for already-resolved tickets (use updated_at as best guess)
UPDATE tickets SET resolved_at = updated_at WHERE status = 'Resolved' AND resolved_at IS NULL;

-- Step 3: Trigger to auto-set/clear resolved_at on status change
CREATE OR REPLACE FUNCTION fn_set_resolved_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Resolved' AND (OLD.status IS DISTINCT FROM 'Resolved') THEN
    NEW.resolved_at := NOW();
  ELSIF NEW.status != 'Resolved' AND OLD.status = 'Resolved' THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_resolved_at ON tickets;
CREATE TRIGGER trg_set_resolved_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fn_set_resolved_at();

-- Step 4: Index for resolution time queries
CREATE INDEX IF NOT EXISTS idx_tickets_resolved_at ON tickets (resolved_at) WHERE resolved_at IS NOT NULL;
