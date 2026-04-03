-- Migration 016: Expand audit triggers to capture INSERT events
-- WHY: The original triggers only tracked UPDATE and DELETE.
-- New call logs, timeline entries, KB articles, and LK requests were invisible.

-- 1. Update the existing trigger on tickets to also fire on INSERT
DROP TRIGGER IF EXISTS tickets_audit_trigger ON tickets;
CREATE TRIGGER tickets_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON tickets
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- 2. Update timeline_entries trigger to also fire on INSERT
DROP TRIGGER IF EXISTS timeline_entries_audit_trigger ON timeline_entries;
CREATE TRIGGER timeline_entries_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON timeline_entries
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- 3. Add audit trigger on knowledge_base (INSERT, UPDATE, DELETE)
DROP TRIGGER IF EXISTS knowledge_base_audit_trigger ON knowledge_base;
CREATE TRIGGER knowledge_base_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON knowledge_base
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- 4. Add audit trigger on license_key_requests (INSERT, DELETE)
DROP TRIGGER IF EXISTS license_key_requests_audit_trigger ON license_key_requests;
CREATE TRIGGER license_key_requests_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON license_key_requests
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- 5. Update the audit function to handle INSERT
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  _changed_by text;
BEGIN
  SELECT display_name INTO _changed_by
  FROM profiles
  WHERE id = auth.uid();

  IF _changed_by IS NULL THEN
    _changed_by := COALESCE(current_setting('app.current_user_name', true), 'system');
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, action, changed_by, old_data, new_data)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', _changed_by, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, record_id, action, changed_by, old_data, new_data)
    VALUES (TG_TABLE_NAME, OLD.id, 'UPDATE', _changed_by, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, action, changed_by, old_data, new_data)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', _changed_by, to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
