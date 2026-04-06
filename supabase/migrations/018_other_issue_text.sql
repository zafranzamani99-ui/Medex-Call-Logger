-- Add other text columns to job_sheets for custom "Other" descriptions
ALTER TABLE job_sheets ADD COLUMN IF NOT EXISTS other_issue_text text;
ALTER TABLE job_sheets ADD COLUMN IF NOT EXISTS other_service_text text;
