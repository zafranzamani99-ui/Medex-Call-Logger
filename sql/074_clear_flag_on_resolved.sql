-- 074: One-time cleanup — clear "Needs Attention" flag on already-resolved tickets
-- WHY: Previously the flag was set at log time but never auto-cleared on resolve,
-- so the History page kept showing red "Needs Attention" badges on tickets that
-- were already done. Going forward, app code clears the flag when status flips
-- to Resolved (see app/(app)/tickets/[id]/page.tsx). This migration fixes the
-- existing mismatched rows.
--
-- Audit trigger on tickets logs each row update, so this batch is captured.

UPDATE tickets
SET need_team_check = false
WHERE status = 'Resolved'
  AND need_team_check = true;
