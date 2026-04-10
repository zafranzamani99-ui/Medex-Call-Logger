-- 047: Drop issue_type CHECK constraints to allow custom issue types
-- WHY: Users need to type and save custom issue types (e.g. new categories
-- that aren't in the predefined list). The CHECK constraint from migration 035
-- blocks any value not in the hardcoded list.
-- The IssueTypeSelect component already supports typing custom types —
-- the DB just needs to allow them.
-- Run this in Supabase SQL Editor

-- Drop CHECK constraints on both tables
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS chk_issue_type;
ALTER TABLE knowledge_base DROP CONSTRAINT IF EXISTS chk_kb_issue_type;
