-- Add city column to clinics table (mapped from CRM "Address2" column)
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS city TEXT;

-- Also add city to tickets for denormalized snapshot
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS city TEXT;
