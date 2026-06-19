-- Add 'reply' to notification type constraint so ticket creators get notified on replies
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('assignment', 'mention', 'priority', 'reply', 'ot_claim'));
