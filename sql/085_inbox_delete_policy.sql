-- 085: Allow administrators to delete inbox messages
-- Checks profiles.role to restrict DELETE to administrator/admin only

CREATE POLICY "inbox_messages_delete_admin" ON inbox_messages
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('administrator', 'admin')
    )
  );
