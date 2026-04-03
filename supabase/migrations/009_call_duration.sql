-- Add call duration column to tickets (stores minutes)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS call_duration INTEGER;

-- Optional: add a check constraint for valid values
ALTER TABLE tickets ADD CONSTRAINT chk_call_duration
  CHECK (call_duration IS NULL OR call_duration IN (15, 30, 60, 90, 120));
