-- Migration 059: Performance indexes for hot queries
-- WHY: Site is getting slow as row counts grow. Existing indexes (006_indexes.sql
-- and per-feature migrations) miss several columns that are filtered/ordered on
-- heavily by dashboard, my-log, schedule, and inbox pages.
--
-- All statements are idempotent (IF NOT EXISTS) so this is safe to re-run.
-- Run in Supabase SQL Editor. No table rewrites, no locks beyond the brief
-- build window per index. Run ANALYZE at the end to refresh planner stats.

-- =========================================================================
-- TICKETS
-- =========================================================================

-- my-log page: WHERE created_by_name = $1 ORDER BY created_at DESC
-- Composite so both the filter and the sort are served by one index.
CREATE INDEX IF NOT EXISTS idx_tickets_created_by_name_created_at
  ON tickets (created_by_name, created_at DESC);

-- my-log "touched recently" query: WHERE created_by_name = $1
--   AND last_activity_at >= $2 ORDER BY last_activity_at DESC
CREATE INDEX IF NOT EXISTS idx_tickets_created_by_name_activity
  ON tickets (created_by_name, last_activity_at DESC);

-- Backdate / report queries: filter by submitted_at (added in 048_backdate_support)
CREATE INDEX IF NOT EXISTS idx_tickets_submitted_at
  ON tickets (submitted_at DESC);

-- =========================================================================
-- SCHEDULES
-- =========================================================================

-- Schedule page + open-schedule checks query by clinic_code
CREATE INDEX IF NOT EXISTS idx_schedules_clinic_code
  ON schedules (clinic_code);

-- Dashboard / schedule page filters: status IN ('scheduled','in_progress')
-- Composite with schedule_date because lists are ordered by date.
CREATE INDEX IF NOT EXISTS idx_schedules_status_date
  ON schedules (status, schedule_date);

-- Partial index for the hot "active" subset (scheduled + in_progress)
-- Keeps the index small and lets the planner skip completed/cancelled rows.
CREATE INDEX IF NOT EXISTS idx_schedules_active
  ON schedules (schedule_date, agent_id)
  WHERE status IN ('scheduled', 'in_progress');

-- =========================================================================
-- JOB SHEETS
-- =========================================================================

-- my-log OR clause: service_by_id = $1 OR created_by = $1
-- created_by already indexed; add service_by_id to cover the other half.
CREATE INDEX IF NOT EXISTS idx_job_sheets_service_by_id
  ON job_sheets (service_by_id);

-- =========================================================================
-- INBOX
-- =========================================================================

-- Inbox page filters by status ('open' vs 'done') ordered by created_at.
-- Partial index on 'open' only because that's the default view and the
-- subset that stays small (done messages accumulate forever).
CREATE INDEX IF NOT EXISTS idx_inbox_messages_open
  ON inbox_messages (created_at DESC)
  WHERE status = 'open';

-- =========================================================================
-- KNOWLEDGE BASE
-- =========================================================================

-- Dashboard counts drafts: WHERE status = 'draft'
-- Partial index keeps it tiny (drafts are rare vs published).
CREATE INDEX IF NOT EXISTS idx_knowledge_base_drafts
  ON knowledge_base (created_at DESC)
  WHERE status = 'draft';

-- General filter by status for KB listing
CREATE INDEX IF NOT EXISTS idx_knowledge_base_status
  ON knowledge_base (status);

-- =========================================================================
-- LICENSE KEY REQUESTS
-- =========================================================================

-- my-log filters: WHERE created_by = $1 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_lkr_created_by_created_at
  ON license_key_requests (created_by, created_at DESC);

-- =========================================================================
-- TIMELINE ENTRIES
-- =========================================================================

-- Timeline on ticket detail always loads ORDER BY created_at ASC for a ticket.
-- Existing idx_timeline_ticket_id covers the filter; composite lets the sort
-- skip an extra sort step.
CREATE INDEX IF NOT EXISTS idx_timeline_ticket_created
  ON timeline_entries (ticket_id, created_at ASC);

-- =========================================================================
-- AUDIT LOG
-- =========================================================================

-- Audit lookups on ticket detail are usually scoped to recent entries for a
-- record; adding created_at lets the planner paginate without a heap scan.
CREATE INDEX IF NOT EXISTS idx_audit_record_created
  ON audit_log (record_id, created_at DESC);

-- =========================================================================
-- REFRESH PLANNER STATS
-- =========================================================================

ANALYZE tickets;
ANALYZE schedules;
ANALYZE job_sheets;
ANALYZE inbox_messages;
ANALYZE inbox_replies;
ANALYZE knowledge_base;
ANALYZE license_key_requests;
ANALYZE timeline_entries;
ANALYZE audit_log;
