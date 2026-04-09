-- Migration 040: Add role column to profiles for RBAC labels
-- Default 'support' so existing agents keep working. No permission differences — just a label.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'support'
  CHECK (role IN ('admin', 'support'));

-- Set the primary admin
UPDATE profiles SET role = 'admin' WHERE email = 'zafranzamani12@gmail.com';
