-- 079: tickets.last_timeline_* — denormalised "latest activity" for fast list rendering
-- WHY: The History page (tickets list) used to show the "Next Step" column. Plan
-- has its own home now (the PlanCard on detail page + ticket_plans history table),
-- so the list column is being repurposed to show "Latest Activity" — the most
-- recent timeline entry per ticket. Doing this with a JOIN/subquery on the list
-- query is slow at scale; cheaper to denormalise a few fields onto tickets and
-- keep them fresh via a trigger on timeline_entries.
--
-- Only entry_type = 'note' rows count as activity. status_change synthetic rows
-- do not — they're system events, not customer-facing follow-ups.
--
-- Run this in Supabase SQL Editor (after migration 078).

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS last_timeline_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_timeline_channel  TEXT,
  ADD COLUMN IF NOT EXISTS last_timeline_notes    TEXT,
  ADD COLUMN IF NOT EXISTS last_timeline_by_name  TEXT;

CREATE INDEX IF NOT EXISTS idx_tickets_last_timeline_at ON tickets(last_timeline_at DESC NULLS LAST);

-- Sync trigger: on timeline_entries INSERT/UPDATE/DELETE recompute the latest
-- 'note' entry per affected ticket and stamp those values onto tickets.
CREATE OR REPLACE FUNCTION fn_sync_last_timeline()
RETURNS TRIGGER AS $$
DECLARE
  tid UUID;
  latest RECORD;
BEGIN
  tid := COALESCE(NEW.ticket_id, OLD.ticket_id);

  SELECT created_at, channel, notes, added_by_name
  INTO latest
  FROM timeline_entries
  WHERE ticket_id = tid
    AND COALESCE(entry_type, 'note') = 'note'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE tickets
    SET last_timeline_at      = latest.created_at,
        last_timeline_channel = latest.channel,
        last_timeline_notes   = latest.notes,
        last_timeline_by_name = latest.added_by_name
    WHERE id = tid;
  ELSE
    UPDATE tickets
    SET last_timeline_at      = NULL,
        last_timeline_channel = NULL,
        last_timeline_notes   = NULL,
        last_timeline_by_name = NULL
    WHERE id = tid;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_last_timeline ON timeline_entries;
CREATE TRIGGER trg_sync_last_timeline
  AFTER INSERT OR UPDATE OR DELETE ON timeline_entries
  FOR EACH ROW EXECUTE FUNCTION fn_sync_last_timeline();

-- One-time backfill: stamp the latest 'note' entry per ticket onto tickets.
WITH latest_per_ticket AS (
  SELECT DISTINCT ON (ticket_id)
    ticket_id, created_at, channel, notes, added_by_name
  FROM timeline_entries
  WHERE COALESCE(entry_type, 'note') = 'note'
  ORDER BY ticket_id, created_at DESC
)
UPDATE tickets t
SET last_timeline_at      = l.created_at,
    last_timeline_channel = l.channel,
    last_timeline_notes   = l.notes,
    last_timeline_by_name = l.added_by_name
FROM latest_per_ticket l
WHERE t.id = l.ticket_id;
