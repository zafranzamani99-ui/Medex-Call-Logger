-- ============================================================
-- MEDEX CALL LOGGER — COMPLETE DATABASE SETUP
-- ============================================================
-- Paste this ENTIRE file into Supabase SQL Editor and click "Run".
-- It creates all tables, policies, triggers, functions, indexes,
-- seeds the knowledge base, and enables realtime.
-- ============================================================


-- ============================================================
-- PART 1: CREATE ALL TABLES
-- ============================================================

-- 1. profiles — agent display names
CREATE TABLE profiles (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text        NOT NULL,
  email         text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. clinics — CRM data (populated by CSV upload)
CREATE TABLE clinics (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_code         text        UNIQUE NOT NULL,
  clinic_name         text        NOT NULL,
  clinic_phone        text,
  mtn_expiry          date,
  renewal_status      text,
  product_type        text,
  city                text,
  state               text,
  registered_contact  text,
  support_name        text,
  customer_status     text,
  email_main          text,
  email_secondary     text,
  lkey_line1          text,
  lkey_line2          text,
  lkey_line3          text,
  lkey_line4          text,
  lkey_line5          text,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 3. tickets — one row per call log or ticket
CREATE TABLE tickets (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_ref              text        UNIQUE,
  record_type             text        NOT NULL DEFAULT 'call' CHECK (record_type IN ('call', 'ticket')),
  clinic_code             text        NOT NULL,
  clinic_name             text        NOT NULL,
  clinic_phone            text,
  mtn_expiry              date,
  renewal_status          text,
  product_type            text,
  city                    text,
  state                   text,
  registered_contact      text,
  caller_tel              text,
  pic                     text,
  issue_type              text        NOT NULL,
  issue                   text        NOT NULL,
  my_response             text,
  next_step               text,
  timeline_from_customer  text,
  internal_timeline       text,
  status                  text        NOT NULL DEFAULT 'In Progress',
  need_team_check         boolean     NOT NULL DEFAULT false,
  jira_link               text,
  assigned_to             uuid        REFERENCES profiles(id),
  assigned_to_name        text,
  created_by              uuid        NOT NULL REFERENCES profiles(id),
  created_by_name         text        NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  last_updated_by         uuid        REFERENCES profiles(id),
  last_updated_by_name    text,
  last_activity_at        timestamptz NOT NULL DEFAULT now()
);

-- 4. timeline_entries — call/WA/email updates per ticket
CREATE TABLE timeline_entries (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       uuid        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  entry_date      date        NOT NULL,
  channel         text        NOT NULL,
  notes           text        NOT NULL,
  added_by        uuid        REFERENCES profiles(id),
  added_by_name   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 5. knowledge_base — shared fixes
CREATE TABLE knowledge_base (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_type  text        NOT NULL,
  issue       text        NOT NULL,
  fix         text        NOT NULL,
  added_by    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 6. audit_log — tamper-proof trail
CREATE TABLE audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  text        NOT NULL,
  record_id   uuid        NOT NULL,
  action      text        NOT NULL,
  changed_by  text        NOT NULL,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- PART 2: ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- clinics
CREATE POLICY "clinics_select" ON clinics FOR SELECT TO authenticated USING (true);
CREATE POLICY "clinics_insert" ON clinics FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clinics_update" ON clinics FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "clinics_delete" ON clinics FOR DELETE TO authenticated USING (true);

-- tickets
CREATE POLICY "tickets_select" ON tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "tickets_insert" ON tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tickets_update" ON tickets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tickets_delete" ON tickets FOR DELETE TO authenticated USING (true);

-- timeline_entries
CREATE POLICY "timeline_select" ON timeline_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "timeline_insert" ON timeline_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "timeline_update" ON timeline_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "timeline_delete" ON timeline_entries FOR DELETE TO authenticated USING (true);

-- knowledge_base
CREATE POLICY "kb_select" ON knowledge_base FOR SELECT TO authenticated USING (true);
CREATE POLICY "kb_insert" ON knowledge_base FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "kb_delete" ON knowledge_base FOR DELETE TO authenticated USING (true);

-- audit_log — INSERT only, no update/delete (tamper-proof)
CREATE POLICY "audit_select" ON audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_insert" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);


-- ============================================================
-- PART 3: AUDIT TRIGGERS
-- ============================================================

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

CREATE TRIGGER tickets_audit_trigger
  AFTER UPDATE OR DELETE ON tickets
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER timeline_entries_audit_trigger
  AFTER UPDATE OR DELETE ON timeline_entries
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- Auto-update updated_at timestamp
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


-- ============================================================
-- PART 4: TICKET REF AUTO-GENERATION (TKT-YYYYMMDD-NNNN)
-- ============================================================

-- WHY: CLG- prefix for call logs, TKT- for tickets
CREATE OR REPLACE FUNCTION generate_ticket_ref()
RETURNS TRIGGER AS $$
DECLARE
  _today text;
  _prefix text;
  _count integer;
  _ref text;
BEGIN
  _today := to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYYMMDD');
  IF NEW.record_type = 'ticket' THEN
    _prefix := 'TKT';
  ELSE
    _prefix := 'CLG';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(_prefix || '_ref_' || _today));
  SELECT COUNT(*) INTO _count
  FROM tickets
  WHERE ticket_ref LIKE _prefix || '-' || _today || '-%';
  _ref := _prefix || '-' || _today || '-' || lpad((_count + 1)::text, 4, '0');
  NEW.ticket_ref := _ref;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ticket_ref_trigger
  BEFORE INSERT ON tickets
  FOR EACH ROW
  WHEN (NEW.ticket_ref IS NULL)
  EXECUTE FUNCTION generate_ticket_ref();

-- WHY: Promote call log to ticket (atomic ref change + advisory lock)
CREATE OR REPLACE FUNCTION promote_to_ticket(p_ticket_id uuid)
RETURNS text AS $$
DECLARE
  _today text;
  _count integer;
  _new_ref text;
  _current_type text;
BEGIN
  SELECT record_type INTO _current_type FROM tickets WHERE id = p_ticket_id;
  IF _current_type IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF _current_type = 'ticket' THEN RAISE EXCEPTION 'Already a ticket'; END IF;
  _today := to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYYMMDD');
  PERFORM pg_advisory_xact_lock(hashtext('TKT_ref_' || _today));
  SELECT COUNT(*) INTO _count FROM tickets WHERE ticket_ref LIKE 'TKT-' || _today || '-%';
  _new_ref := 'TKT-' || _today || '-' || lpad((_count + 1)::text, 4, '0');
  UPDATE tickets SET record_type = 'ticket', ticket_ref = _new_ref WHERE id = p_ticket_id;
  RETURN _new_ref;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- PART 5: SEED KNOWLEDGE BASE (12 entries)
-- ============================================================

INSERT INTO knowledge_base (issue_type, issue, fix, added_by) VALUES
  ('Login Issue', 'Cannot open PC / login stuck', 'Ask clinic to restart PC. If still cannot, remote in via UltraViewer.', 'System'),
  ('Login Issue', 'MDOCMS.exe missing', 'Remote in, check C:\Medex folder. Re-copy MDOCMS.exe. Relaunch.', 'System'),
  ('Login Issue', 'Cannot open dispensary PC', 'Check dispensary user account. Restart machine. Check network.', 'System'),
  ('Printing', 'Template not printing / wrong template', 'Settings > Print Template. Verify correct template selected. Re-print test.', 'System'),
  ('Printing', 'Print and QMS not working', 'Check printer online + set as default. Restart Print Spooler via services.msc.', 'System'),
  ('Inventory', 'Cannot enter medicine at inventory portal', 'Admin > User Rights > enable Inventory access.', 'System'),
  ('Schedule', 'Cannot edit patient name', 'Admin > User Rights > enable Edit Patient Name.', 'System'),
  ('Others', 'Clinic wants to delete all data', 'ESCALATE IMMEDIATELY. Do NOT allow deletion. Log as Escalated.', 'System'),
  ('Others', 'eINV / consolidated eINV submission', 'Schedule with senior staff. Do not do remotely without supervision.', 'System'),
  ('Login Issue', 'Password expired or forgotten', 'Reset password via Admin panel. If admin access unavailable, escalate to senior.', 'System'),
  ('Printing', 'Receipt printer not detected', 'Check USB connection. Reinstall printer driver. Set as default printer in Windows.', 'System'),
  ('Others', 'Request for new user account setup', 'Admin > User Management > Add New User. Set appropriate access rights per clinic type.', 'System');


-- ============================================================
-- PART 6: PERFORMANCE INDEXES
-- ============================================================

CREATE INDEX idx_tickets_record_type ON tickets(record_type);
CREATE INDEX idx_tickets_open_type ON tickets(record_type, status, last_activity_at)
  WHERE status != 'Resolved' AND record_type = 'ticket';
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_created_at ON tickets(created_at);
CREATE INDEX idx_tickets_clinic_code ON tickets(clinic_code);
CREATE INDEX idx_tickets_need_team_check ON tickets(need_team_check) WHERE need_team_check = true;
CREATE INDEX idx_tickets_last_activity ON tickets(last_activity_at);
CREATE INDEX idx_tickets_issue_type ON tickets(issue_type);
CREATE INDEX idx_tickets_created_by ON tickets(created_by);
CREATE INDEX idx_tickets_open_priority ON tickets(need_team_check DESC, last_activity_at ASC)
  WHERE status != 'Resolved';
CREATE INDEX idx_timeline_ticket_id ON timeline_entries(ticket_id);
CREATE INDEX idx_clinics_code ON clinics(clinic_code);
CREATE INDEX idx_clinics_name ON clinics(clinic_name);
CREATE INDEX idx_audit_record ON audit_log(record_id);
CREATE INDEX idx_audit_table_record ON audit_log(table_name, record_id);


-- ============================================================
-- PART 7: ENABLE REALTIME ON TICKETS TABLE
-- ============================================================
-- WHY: Dashboard needs live updates when any agent creates/edits a ticket.
-- Without this, agents would need to refresh the page to see changes.

ALTER PUBLICATION supabase_realtime ADD TABLE tickets;


-- ============================================================
-- DONE! Your database is fully configured.
-- Next: go to Authentication > Settings and disable email confirmation.
-- ============================================================
