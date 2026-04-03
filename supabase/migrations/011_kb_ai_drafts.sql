-- Add status (draft/published) and source ticket reference to knowledge_base
-- WHY: AI auto-generates KB drafts from resolved tickets. Agents review before publishing.
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
  CHECK (status IN ('draft', 'published'));

ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS source_ticket_id UUID REFERENCES tickets(id);
