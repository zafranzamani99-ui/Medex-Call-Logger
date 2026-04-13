-- 049: Persist call log drafts in Supabase
-- WHY: Drafts were stored in localStorage — vanished on browser data clear,
-- switching browsers, or storage eviction. Agents need drafts to survive.
-- Autosave (unsaved recovery) stays in localStorage — that's temporary by design.
-- Explicit "Save as Draft" is now permanent in Supabase until the agent deletes it.
-- Run this in Supabase SQL Editor

-- 1. Create drafts table
CREATE TABLE call_log_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Draft',
  form_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Index for fast lookup by user
CREATE INDEX idx_drafts_user ON call_log_drafts(user_id);

-- 3. RLS — each agent sees only their own drafts
ALTER TABLE call_log_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own drafts" ON call_log_drafts
  FOR ALL USING (auth.uid() = user_id);
