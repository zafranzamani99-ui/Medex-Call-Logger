-- 050: Add SQL Scripts resource category + content column
-- WHY: Agents need to save SQL migration scripts in Resources — paste code + title, no link needed.
-- Adds a `content` text column for code/text resources and makes `url` nullable.
-- Run this in Supabase SQL Editor

-- 1. Add content column (for SQL code, text resources)
ALTER TABLE resources ADD COLUMN IF NOT EXISTS content text;

-- 2. Make url nullable (SQL resources don't have URLs)
ALTER TABLE resources ALTER COLUMN url DROP NOT NULL;

-- 3. Add 'SQL Scripts' to category CHECK constraint
ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_category_check;
ALTER TABLE resources ADD CONSTRAINT resources_category_check CHECK (category IN (
  'System Versions',
  'Database Files',
  'Templates',
  'SOPs & Guides',
  'Training',
  'Tools & Utilities',
  'SQL Scripts'
));
