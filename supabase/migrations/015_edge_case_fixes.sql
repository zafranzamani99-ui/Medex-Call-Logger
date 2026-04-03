-- Migration 015: Edge case fixes
-- WHY: Audit found several data integrity issues.

-- 1. Fix knowledge_base.source_ticket_id FK — allow ticket deletion even if KB draft exists
-- Without this, deleting a ticket with an unreviewed KB draft silently fails.
ALTER TABLE knowledge_base DROP CONSTRAINT IF EXISTS knowledge_base_source_ticket_id_fkey;
ALTER TABLE knowledge_base
  ADD CONSTRAINT knowledge_base_source_ticket_id_fkey
  FOREIGN KEY (source_ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;
