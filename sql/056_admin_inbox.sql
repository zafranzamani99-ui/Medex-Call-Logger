-- Migration 056: "Escalated to Admin" status support + Inbox messaging
-- Adds admin_message column to tickets, creates inbox_messages + inbox_read_status tables

-- 1. Add admin_message column to tickets (mirrors jira_link pattern)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS admin_message TEXT;

-- 2. Inbox messages table (denormalized for fast listing without joins)
CREATE TABLE IF NOT EXISTS inbox_messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     UUID        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  ticket_ref    TEXT        NOT NULL,
  clinic_name   TEXT        NOT NULL,
  message       TEXT        NOT NULL,
  sent_by       UUID        NOT NULL REFERENCES profiles(id),
  sent_by_name  TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  admin_reply   TEXT,
  replied_by    UUID        REFERENCES profiles(id),
  replied_by_name TEXT,
  replied_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_created_at ON inbox_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_ticket_id ON inbox_messages (ticket_id);

-- 3. Per-user read tracking (timestamp-based: 1 row per user)
CREATE TABLE IF NOT EXISTS inbox_read_status (
  user_id      UUID        PRIMARY KEY REFERENCES profiles(id),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z'
);

-- 4. RLS policies
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inbox_messages_select" ON inbox_messages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "inbox_messages_insert" ON inbox_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = sent_by);

CREATE POLICY "inbox_messages_update" ON inbox_messages
  FOR UPDATE TO authenticated USING (true);

ALTER TABLE inbox_read_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inbox_read_status_select" ON inbox_read_status
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "inbox_read_status_insert" ON inbox_read_status
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "inbox_read_status_update" ON inbox_read_status
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- 5. RPC function for unread count (used by layout.tsx)
CREATE OR REPLACE FUNCTION get_inbox_unread_count()
RETURNS INTEGER AS $$
DECLARE
  user_last_read TIMESTAMPTZ;
  cnt INTEGER;
BEGIN
  SELECT last_read_at INTO user_last_read
    FROM inbox_read_status
    WHERE user_id = auth.uid();

  IF user_last_read IS NULL THEN
    user_last_read := '1970-01-01T00:00:00Z';
  END IF;

  SELECT count(*)::integer INTO cnt
    FROM inbox_messages
    WHERE created_at > user_last_read;

  RETURN cnt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Enable realtime on inbox_messages
ALTER PUBLICATION supabase_realtime ADD TABLE inbox_messages;
