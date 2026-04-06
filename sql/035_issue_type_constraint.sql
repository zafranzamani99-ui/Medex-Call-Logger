-- 035: Clean up rogue issue_type values + add CHECK constraint
-- WHY: QA audit found "MedexQueue" (5 tickets) and "Template" (1 ticket)
-- not in predefined list. Remap them to "Others" then add constraint.
-- Run this in Supabase SQL Editor

-- Step 1: Remap rogue values to "Others"
UPDATE tickets SET issue_type = 'Others' WHERE issue_type = 'MedexQueue';
UPDATE tickets SET issue_type = 'Others' WHERE issue_type = 'Template';

-- Step 2: Also clean knowledge_base if any rogue values
UPDATE knowledge_base SET issue_type = 'Others' WHERE issue_type NOT IN (
  'Enquiry', 'Login Issue', 'Printing', 'Schedule', 'MTN / Sys Update',
  'Inventory', 'Others', 'Dispensary', 'Report', 'SST', 'E-INV',
  'WhatsApp', 'Billing', 'Consultation', 'Registration', 'Corp Invoice',
  'Training', 'Bug'
);

-- Step 3: Add CHECK constraint on tickets
ALTER TABLE tickets ADD CONSTRAINT chk_issue_type CHECK (
  issue_type IN (
    'Enquiry', 'Login Issue', 'Printing', 'Schedule', 'MTN / Sys Update',
    'Inventory', 'Others', 'Dispensary', 'Report', 'SST', 'E-INV',
    'WhatsApp', 'Billing', 'Consultation', 'Registration', 'Corp Invoice',
    'Training', 'Bug'
  )
);

-- Step 4: Add CHECK constraint on knowledge_base
ALTER TABLE knowledge_base ADD CONSTRAINT chk_kb_issue_type CHECK (
  issue_type IN (
    'Enquiry', 'Login Issue', 'Printing', 'Schedule', 'MTN / Sys Update',
    'Inventory', 'Others', 'Dispensary', 'Report', 'SST', 'E-INV',
    'WhatsApp', 'Billing', 'Consultation', 'Registration', 'Corp Invoice',
    'Training', 'Bug'
  )
);
