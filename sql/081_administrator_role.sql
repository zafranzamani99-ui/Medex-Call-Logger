-- 081: Administrator role — three-tier visibility
-- WHY: CEO wants administrators (Zafran, Hazleen, Ching) to see ALL staff's
-- logs on My Log, while admin/support only see their own.
--
-- Run this in Supabase SQL Editor (after migration 080).

-- Drop the existing CHECK constraint that only allows 'admin'/'support'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Re-create with 'administrator' added
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('administrator', 'admin', 'support'));

UPDATE profiles SET role = 'administrator'
WHERE LOWER(email) IN (
  'zafranzamani12@gmail.com',
  'hazleen@medexoneglobal.com',
  'ching@medexoneglobal.com'
);
