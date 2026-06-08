-- 089: Allow all authenticated users to READ call_log_drafts
-- WHY: The Call Log monitor page needs to show phone numbers from
-- ALL staff's drafts + submitted tickets to cross-reference with
-- the actual phone call log. The existing RLS only lets users see
-- their own drafts. This adds a read-all policy for the monitor.

CREATE POLICY "Authenticated can read all drafts"
  ON call_log_drafts FOR SELECT TO authenticated
  USING (true);
