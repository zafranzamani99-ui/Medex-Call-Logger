-- Migration 042: Attach audit trigger to clinics table
-- Reuses the existing audit_trigger_func() from migration 003.
-- Only on UPDATE (not INSERT/DELETE) to avoid flooding audit_log
-- during CRM bulk uploads which insert/delete thousands of rows.
-- Agent edits to clinic data are always UPDATEs.

CREATE TRIGGER clinics_audit_trigger
  AFTER UPDATE ON clinics
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
