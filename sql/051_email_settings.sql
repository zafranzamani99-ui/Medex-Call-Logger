-- 051: Add email_settings JSONB to profiles
-- WHY: LK and Job Sheet email headers/footers were in localStorage — lost on browser change.
-- Now persisted per-user in Supabase. Shape:
-- { lk_header, lk_footer, js_header, js_footer }

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_settings jsonb DEFAULT '{}'::jsonb;
