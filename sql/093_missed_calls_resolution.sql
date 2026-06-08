-- 093: Add resolution tracking to missed_calls for audit
-- Status: null (open), 'logged' (call logged), 'no_answer' (called back, no answer), 'dismissed' (e.g. duplicate/same clinic)

ALTER TABLE missed_calls ADD COLUMN IF NOT EXISTS resolved_status TEXT;
ALTER TABLE missed_calls ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE missed_calls ADD COLUMN IF NOT EXISTS resolved_by_name TEXT;
ALTER TABLE missed_calls ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE missed_calls ADD COLUMN IF NOT EXISTS resolved_note TEXT;
