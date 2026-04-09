-- Migration 039: Add attachment_urls to timeline_entries
-- WHY: Allow agents to attach screenshots/images when adding follow-up updates on tickets.
-- Reuses the same Supabase Storage bucket (ticket-attachments) as the Log Call page.

ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS attachment_urls TEXT[] DEFAULT '{}';
