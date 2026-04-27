-- 073: Track who marked an inbox message as done
-- WHY: Currently `status = 'done'` flips to true but no record of who closed
-- it or when. Adds attribution columns. Mirrors the replied_by* / replied_at
-- pattern already on this table.

ALTER TABLE inbox_messages
  ADD COLUMN IF NOT EXISTS done_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS done_by_name TEXT,
  ADD COLUMN IF NOT EXISTS done_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_inbox_messages_done_at ON inbox_messages(done_at);
