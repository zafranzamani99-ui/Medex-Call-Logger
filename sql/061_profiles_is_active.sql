-- Migration 061: Active/inactive toggle for user accounts
-- WHY: When team members leave, deleting their profile would orphan
-- created_by references on ~thousands of tickets, schedules, job sheets.
-- Instead: keep the profile row intact but flip is_active=false, which
-- blocks their login without destroying any historical attribution.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Index — fast lookup for the "is this user allowed to log in" check
-- that runs on every authenticated page load in (app)/layout.tsx
CREATE INDEX IF NOT EXISTS idx_profiles_is_active
  ON profiles (is_active)
  WHERE is_active = false;
-- Partial index: we only need to find the (rare) inactive rows quickly.
-- Active users don't need an index entry since they pass the gate.
