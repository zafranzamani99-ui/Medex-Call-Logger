-- Migration 057: Add reply/status columns to inbox_messages
-- Patch for 056 — adds admin reply + done/open status tracking

-- 1. Add new columns
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS admin_reply TEXT;
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS replied_by UUID REFERENCES profiles(id);
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS replied_by_name TEXT;
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;

-- 2. Add CHECK constraint on status
ALTER TABLE inbox_messages DROP CONSTRAINT IF EXISTS inbox_messages_status_check;
ALTER TABLE inbox_messages ADD CONSTRAINT inbox_messages_status_check CHECK (status IN ('open', 'done'));

-- 3. Add UPDATE policy (anyone can reply/mark done)
DROP POLICY IF EXISTS "inbox_messages_update" ON inbox_messages;
CREATE POLICY "inbox_messages_update" ON inbox_messages
  FOR UPDATE TO authenticated USING (true);
