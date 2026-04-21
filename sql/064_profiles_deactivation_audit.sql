-- Migration 064: Track when/who deactivated a user account
-- WHY: Compliance — when someone asks "when did X lose access?", we can answer.
-- Nullable fields: populated only when is_active flips false → true.
-- Cleared when an admin reactivates the account.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS deactivated_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_by   UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS deactivated_by_name TEXT;
