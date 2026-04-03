-- Fix: knowledge_base had SELECT, INSERT, DELETE policies but no UPDATE policy.
-- Publish (draft → published) and editing KB entries requires UPDATE.
CREATE POLICY "kb_update" ON knowledge_base FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
