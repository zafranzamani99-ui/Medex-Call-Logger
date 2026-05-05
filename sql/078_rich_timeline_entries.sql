-- 078: Rich timeline entries — capture every field the Add Update form collects
-- WHY: Today the Add Update form scatters data into ~6 destinations (timeline_entries
-- gets only notes + channel; everything else lands on tickets scalars). When the
-- agent later opens a saved entry, only notes are visible/editable. These columns
-- pull all the per-follow-up context onto the entry itself, so the entry card can
-- show sub-blocks ("Added to response: ...", "Status: A -> B", etc.) and the edit
-- modal can let the agent change them.
--
-- The corresponding scalar columns on `tickets` stay populated (denormalised) so
-- existing readers (KB generation, WA draft modal, my-log card) keep working.
--
-- Run this in Supabase SQL Editor.

ALTER TABLE timeline_entries
  ADD COLUMN IF NOT EXISTS response_added            TEXT,
  ADD COLUMN IF NOT EXISTS customer_timeline_update  TEXT,
  ADD COLUMN IF NOT EXISTS internal_timeline_update  TEXT,
  ADD COLUMN IF NOT EXISTS status_from               TEXT,
  ADD COLUMN IF NOT EXISTS status_to                 TEXT,
  ADD COLUMN IF NOT EXISTS jira_link                 TEXT;
