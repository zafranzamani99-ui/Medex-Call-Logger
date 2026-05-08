-- 080: Amount Hutang — outstanding payment tracking per ticket
-- WHY: Admins chase outstanding payments from clinics. Today the amount lives
-- in free-text notes and is invisible to reporting. This adds a structured
-- currency field on tickets (current balance) and a per-follow-up collection
-- amount on timeline_entries so the balance auto-decreases as payments come in.
--
-- Run this in Supabase SQL Editor (after migration 079).

-- Outstanding balance on tickets (current amount owed)
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS amount_hutang NUMERIC(10,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tickets_amount_hutang
  ON tickets(amount_hutang) WHERE amount_hutang > 0;

-- Amount collected per follow-up (partial payment recorded with each timeline entry)
ALTER TABLE timeline_entries
  ADD COLUMN IF NOT EXISTS amount_collected NUMERIC(10,2);
