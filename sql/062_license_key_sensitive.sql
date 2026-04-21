-- Migration 062: License Key sensitivity flag
-- WHY: License keys often contain passwords, tokens, and install PWs.
-- Flag sensitive values so the UI can mask them by default and require
-- explicit reveal. Non-sensitive keys (e.g. branch codes) stay visible.

ALTER TABLE license_key_data
  ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN NOT NULL DEFAULT false;

-- Auto-flag existing rows whose key name looks like a credential.
-- One-off backfill — safe to re-run (WHERE clause excludes already-flagged rows).
UPDATE license_key_data
SET is_sensitive = true
WHERE is_sensitive = false
  AND field_key ~* '(password|pwd|^pw$|secret|token|api[_ -]?key)';
