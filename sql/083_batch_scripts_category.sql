-- 083: Add 'Batch Scripts' resource category
-- Run in Supabase SQL Editor

ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_category_check;
ALTER TABLE resources ADD CONSTRAINT resources_category_check CHECK (category IN (
  'System Versions',
  'Database Files',
  'Templates',
  'SOPs & Guides',
  'Training',
  'Tools & Utilities',
  'SQL Scripts',
  'Support Scripts',
  'Batch Scripts'
));
