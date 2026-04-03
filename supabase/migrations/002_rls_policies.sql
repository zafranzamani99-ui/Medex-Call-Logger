-- Migration 002: Row Level Security policies
-- WHY: Spec Section 4.7 — all authenticated users have full CRUD on all tables.
-- No per-row ownership restrictions. audit_log is INSERT-only (BR-08).

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- profiles: all authenticated users can read/write all profiles
-- WHY: Agents need to see each other's names on tickets
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- clinics: full access for authenticated users
-- WHY: CRM upload truncates and re-inserts. All agents need to search.
CREATE POLICY "clinics_select" ON clinics FOR SELECT TO authenticated USING (true);
CREATE POLICY "clinics_insert" ON clinics FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clinics_update" ON clinics FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "clinics_delete" ON clinics FOR DELETE TO authenticated USING (true);

-- tickets: full access for authenticated users
-- WHY: Any agent can edit/delete any ticket (spec Section 5.3, BR-10)
CREATE POLICY "tickets_select" ON tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "tickets_insert" ON tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tickets_update" ON tickets FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tickets_delete" ON tickets FOR DELETE TO authenticated USING (true);

-- timeline_entries: full access for authenticated users
-- WHY: Any agent can add entries to any ticket (concurrent-safe)
CREATE POLICY "timeline_select" ON timeline_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "timeline_insert" ON timeline_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "timeline_update" ON timeline_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "timeline_delete" ON timeline_entries FOR DELETE TO authenticated USING (true);

-- knowledge_base: full access for authenticated users
-- WHY: Any agent can add or delete KB entries
CREATE POLICY "kb_select" ON knowledge_base FOR SELECT TO authenticated USING (true);
CREATE POLICY "kb_insert" ON knowledge_base FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "kb_delete" ON knowledge_base FOR DELETE TO authenticated USING (true);

-- audit_log: INSERT-only for authenticated users — NO update/delete
-- WHY: Tamper-proof trail (BR-08). Once written, audit entries cannot be modified.
CREATE POLICY "audit_select" ON audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_insert" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);
-- Deliberately NO update or delete policies on audit_log
