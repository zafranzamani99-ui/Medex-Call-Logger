-- 076: ticket_plans — append-only history of "Next Step" plan versions
-- WHY: tickets.next_step / next_step_pic / next_step_contact are scalar columns
-- that get overwritten on every save, losing the chronology of plan changes.
-- This table captures every plan version with author + timestamp, plus an
-- optional link to the timeline_entries row that triggered the change (when a
-- follow-up and a plan update happen in the same save).
--
-- The scalar columns on tickets stay as the denormalised "current plan" so
-- existing readers (CSV export, KB generation, WA draft modal, my-log card,
-- tickets list) keep working without changes.
--
-- Run this in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS ticket_plans (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id                 UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  next_step                 TEXT,
  next_step_pic             TEXT,
  next_step_contact         TEXT,
  set_by                    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  set_by_name               TEXT,
  set_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at             TIMESTAMPTZ,
  related_timeline_entry_id UUID REFERENCES timeline_entries(id) ON DELETE SET NULL,
  reason                    TEXT
  -- reason values are advisory: 'created' | 'follow_up' | 'manual' | 'resolved'
);

CREATE INDEX IF NOT EXISTS idx_ticket_plans_ticket_id ON ticket_plans(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_plans_active
  ON ticket_plans(ticket_id, set_at DESC)
  WHERE superseded_at IS NULL;

ALTER TABLE ticket_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_plans_select" ON ticket_plans;
DROP POLICY IF EXISTS "ticket_plans_insert" ON ticket_plans;

CREATE POLICY "ticket_plans_select" ON ticket_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "ticket_plans_insert" ON ticket_plans FOR INSERT TO authenticated WITH CHECK (true);
-- intentionally NO update/delete policy — history is append-only

-- Atomic supersede: when a new plan is inserted, mark all prior active plans on
-- this ticket as superseded. App code does NOT supersede — DB does. This avoids
-- a race when two agents save plans concurrently (both rows persist, the later
-- set_at wins as current).
CREATE OR REPLACE FUNCTION fn_supersede_active_plans()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE ticket_plans
  SET superseded_at = NEW.set_at
  WHERE ticket_id = NEW.ticket_id
    AND id <> NEW.id
    AND superseded_at IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_supersede_active_plans ON ticket_plans;
CREATE TRIGGER trg_supersede_active_plans
  AFTER INSERT ON ticket_plans
  FOR EACH ROW
  EXECUTE FUNCTION fn_supersede_active_plans();

-- Backfill: every existing ticket with a non-null plan field gets v1 from
-- creation time. Tickets with no plan get nothing (PlanCard shows "No plan yet").
INSERT INTO ticket_plans (ticket_id, next_step, next_step_pic, next_step_contact,
                          set_by, set_by_name, set_at, reason)
SELECT id, next_step, next_step_pic, next_step_contact,
       created_by, created_by_name, created_at, 'created'
FROM tickets
WHERE next_step IS NOT NULL
   OR next_step_pic IS NOT NULL
   OR next_step_contact IS NOT NULL;
