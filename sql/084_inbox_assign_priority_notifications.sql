-- 084: Inbox assign-to-staff, priority, and notifications system
-- Adds assignment + priority columns to inbox_messages
-- Creates notifications table for assignments, @mentions, priority alerts

-- ── inbox_messages: new columns ─────────────────────────────────────────────

ALTER TABLE inbox_messages
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS assigned_to_name text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'high'));

CREATE INDEX IF NOT EXISTS idx_inbox_messages_assigned_to
  ON inbox_messages(assigned_to) WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_messages_priority
  ON inbox_messages(priority) WHERE priority = 'high';

-- ── notifications table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('assignment', 'mention', 'priority')),
  title text NOT NULL,
  body text,
  link text,
  inbox_message_id uuid REFERENCES inbox_messages(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read) WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users see own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Any authenticated user can insert (system creates on behalf of actions)
CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can update (mark read) their own notifications
CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- ── RPC: get unread notification count ──────────────────────────────────────

CREATE OR REPLACE FUNCTION get_notification_unread_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::integer
  FROM notifications
  WHERE user_id = auth.uid()
    AND is_read = false;
$$;

-- ── Realtime ────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
