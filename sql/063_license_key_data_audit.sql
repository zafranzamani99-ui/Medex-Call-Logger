-- Migration 063: Audit trigger on license_key_data
-- WHY: License keys carry install passwords, API keys, and SaaS credentials.
-- Any change to these is compliance-relevant — track who changed what, when.
-- Reuses audit_trigger_func() from migration 003. Fires on INSERT/UPDATE/DELETE
-- since LK edits are always human-triggered (no bulk upload path).

CREATE TRIGGER license_key_data_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON license_key_data
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
