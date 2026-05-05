-- 077: timeline_entries.entry_type — distinguish real follow-ups from system events
-- WHY: Status changes via the header dropdown create no visible chronology row
-- today (only audit_log catches them, and that's collapsed/summary-only). Adding
-- an entry_type column lets the timeline render include lightweight system rows
-- like "Status: In Progress -> Resolved" without diluting real follow-up entries.
--
-- 'note'          — real follow-up entry (default; current behaviour)
-- 'status_change' — system-emitted on status change outside the Add Update form
--
-- No CHECK constraint — keep it permissive for future types.
--
-- Run this in Supabase SQL Editor.

ALTER TABLE timeline_entries
  ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'note';

CREATE INDEX IF NOT EXISTS idx_timeline_entries_type
  ON timeline_entries(ticket_id, entry_type);
