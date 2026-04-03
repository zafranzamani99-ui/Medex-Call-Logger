-- Migration 003: Audit triggers on tickets and timeline_entries
-- WHY: Every edit/delete is silently recorded in audit_log (spec Section 4.6).
-- Uses database triggers so audit logging happens automatically — no app code needed.
-- This means even if someone edits via Supabase dashboard, it's still audited.

-- Generic audit function — reusable for any table
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  _changed_by text;
BEGIN
  -- Try to get the display_name of the current user
  -- Falls back to 'system' if no profile found (e.g. service role operations)
  SELECT display_name INTO _changed_by
  FROM profiles
  WHERE id = auth.uid();

  IF _changed_by IS NULL THEN
    _changed_by := COALESCE(current_setting('app.current_user_name', true), 'system');
  END IF;

  IF TG_OP = 'UPDATE' THEN
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

-- Trigger on tickets table
-- WHY: Every ticket edit or deletion must be recorded
CREATE TRIGGER tickets_audit_trigger
  AFTER UPDATE OR DELETE ON tickets
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Trigger on timeline_entries table
-- WHY: Track if someone deletes timeline entries (via parent ticket deletion cascade)
CREATE TRIGGER timeline_entries_audit_trigger
  AFTER UPDATE OR DELETE ON timeline_entries
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Auto-update updated_at on tickets when modified
-- WHY: Keeps the updated_at timestamp accurate without app code
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
