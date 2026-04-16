-- 055: Add PIC + Contact fields for Next Step
-- WHY: Agents need to know WHO to follow up with and HOW to contact them.
-- The existing next_step is plain text — these sub-fields capture the person and contact.
-- Run this in Supabase SQL Editor

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS next_step_pic TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS next_step_contact TEXT;
