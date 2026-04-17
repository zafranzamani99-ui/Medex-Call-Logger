-- Migration 058: Inbox chat thread — multi-reply support
-- Converts single admin_reply overwrite to append-only conversation model

-- 1. New table for individual replies per inbox message
CREATE TABLE IF NOT EXISTS inbox_replies (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_message_id  UUID        NOT NULL REFERENCES inbox_messages(id) ON DELETE CASCADE,
  message           TEXT        NOT NULL,
  sent_by           UUID        NOT NULL REFERENCES profiles(id),
  sent_by_name      TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbox_replies_message_id
  ON inbox_replies (inbox_message_id, created_at ASC);

-- 2. Denormalized reply count on inbox_messages for fast list rendering
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS reply_count INTEGER NOT NULL DEFAULT 0;

-- 3. Trigger to auto-maintain reply_count
CREATE OR REPLACE FUNCTION update_inbox_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE inbox_messages SET reply_count = reply_count + 1
    WHERE id = NEW.inbox_message_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE inbox_messages SET reply_count = reply_count - 1
    WHERE id = OLD.inbox_message_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inbox_reply_count ON inbox_replies;
CREATE TRIGGER trg_inbox_reply_count
AFTER INSERT OR DELETE ON inbox_replies
FOR EACH ROW EXECUTE FUNCTION update_inbox_reply_count();

-- 4. Backfill: migrate existing admin_reply data into inbox_replies
INSERT INTO inbox_replies (inbox_message_id, message, sent_by, sent_by_name, created_at)
SELECT id, admin_reply, replied_by, replied_by_name, replied_at
FROM inbox_messages
WHERE admin_reply IS NOT NULL AND replied_by IS NOT NULL;

-- 5. Fix reply_count for backfilled rows
UPDATE inbox_messages SET reply_count = (
  SELECT count(*) FROM inbox_replies WHERE inbox_replies.inbox_message_id = inbox_messages.id
);

-- 6. RLS policies for inbox_replies
ALTER TABLE inbox_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inbox_replies_select" ON inbox_replies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "inbox_replies_insert" ON inbox_replies
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = sent_by);

-- 7. Enable realtime on inbox_replies
ALTER PUBLICATION supabase_realtime ADD TABLE inbox_replies;
