-- 024: Add audit trigger on schedules table
-- Run this in Supabase SQL Editor
-- Requires: audit_trigger_func() from migration 003/016

CREATE TRIGGER schedules_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON schedules
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
