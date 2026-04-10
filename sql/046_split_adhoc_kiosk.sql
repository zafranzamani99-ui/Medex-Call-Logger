-- 046: Split 'AD-HOC/KIOSK' into separate 'AD-HOC' and 'KIOSK' service types
-- WHY: AD-HOC and KIOSK are distinct service types that should be tracked separately
-- Run this in Supabase SQL Editor

-- For existing job sheets that have 'AD-HOC/KIOSK', replace with both 'AD-HOC' and 'KIOSK'
UPDATE job_sheets
SET service_types = array_remove(service_types, 'AD-HOC/KIOSK') || ARRAY['AD-HOC', 'KIOSK']
WHERE 'AD-HOC/KIOSK' = ANY(service_types);
