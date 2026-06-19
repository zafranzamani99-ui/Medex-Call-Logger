-- Allow users to delete own OT claims in draft, submitted, or rejected status (not approved)
DROP POLICY IF EXISTS "Users can delete own draft OT claims" ON ot_claims;
CREATE POLICY "Users can delete own OT claims"
  ON ot_claims FOR DELETE USING (auth.uid() = user_id AND status != 'approved');
