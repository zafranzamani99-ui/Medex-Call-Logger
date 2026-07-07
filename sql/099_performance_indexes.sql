-- Performance indexes to remove full-table scans on hot queries.
-- All idempotent and safe to re-run.

-- 1. Phone-number autocomplete on call-log + log pages does a leading-wildcard
--    ILIKE ('%q%') on tickets.caller_tel, which no B-tree can serve. A trigram
--    GIN index lets Postgres seek instead of scanning the whole tickets table.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_tickets_caller_tel_trgm
  ON tickets USING GIN (caller_tel gin_trgm_ops);

-- 2. Activity feed sorts audit_log by created_at DESC with no supporting index
--    (only record_id-scoped indexes exist), forcing a full scan + top-N sort.
CREATE INDEX IF NOT EXISTS idx_audit_created_at
  ON audit_log (created_at DESC, id DESC);

-- 3. Dashboard "Resolved Today" count filters tickets by updated_at (unindexed).
--    Partial index range-seeks straight to today's resolved rows.
CREATE INDEX IF NOT EXISTS idx_tickets_resolved_updated
  ON tickets (updated_at DESC) WHERE status = 'Resolved';

-- 4. Job-sheets list filters/sorts by created_at but only service_date is indexed.
CREATE INDEX IF NOT EXISTS idx_job_sheets_created_at
  ON job_sheets (created_at DESC);

ANALYZE tickets;
ANALYZE audit_log;
ANALYZE job_sheets;
