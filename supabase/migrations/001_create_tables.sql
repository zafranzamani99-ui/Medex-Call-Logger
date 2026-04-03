-- Migration 001: Create all tables
-- WHY: Foundation tables from spec Section 4. All 6 tables created in dependency order.

-- 1. profiles — created when a user registers
-- WHY: Stores display_name shown on every log entry. FK to auth.users.
CREATE TABLE profiles (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text        NOT NULL,
  email         text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. clinics — populated by CRM CSV upload
-- WHY: Lookup table for clinic data. Truncated and replaced on each CRM upload.
-- clinic_code is UNIQUE — it's the real identifier (multiple clinics share names).
CREATE TABLE clinics (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_code         text        UNIQUE NOT NULL,
  clinic_name         text        NOT NULL,
  clinic_phone        text,
  mtn_expiry          date,
  renewal_status      text,
  product_type        text,
  state               text,
  registered_contact  text,
  support_name        text,
  customer_status     text,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 3. tickets — one row per support issue
-- WHY: Core table. Clinic fields are denormalized (snapshot at creation time)
-- so CRM uploads never retroactively change ticket data (BR-03).
-- ADDITION: assigned_to + assigned_to_name — spec didn't have ticket ownership.
-- Without this, nobody knows who should follow up on "Pending Customer" tickets.
-- Both are nullable so the existing workflow isn't affected.
CREATE TABLE tickets (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_ref              text        UNIQUE,

  -- clinic snapshot (denormalized)
  clinic_code             text        NOT NULL,
  clinic_name             text        NOT NULL,
  clinic_phone            text,
  mtn_expiry              date,
  renewal_status          text,
  product_type            text,
  state                   text,
  registered_contact      text,

  -- caller info (NOT from CRM — whoever called that day)
  caller_tel              text,
  pic                     text,

  -- issue
  issue_type              text        NOT NULL,
  issue                   text        NOT NULL,
  my_response             text,
  next_step               text,
  timeline_from_customer  text,
  internal_timeline       text,

  -- status & flags
  status                  text        NOT NULL DEFAULT 'In Progress',
  need_team_check         boolean     NOT NULL DEFAULT false,
  jira_link               text,

  -- assignment (MY ADDITION — spec didn't have this)
  assigned_to             uuid        REFERENCES profiles(id),
  assigned_to_name        text,

  -- audit
  created_by              uuid        NOT NULL REFERENCES profiles(id),
  created_by_name         text        NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  last_updated_by         uuid        REFERENCES profiles(id),
  last_updated_by_name    text,

  -- stale detection
  last_activity_at        timestamptz NOT NULL DEFAULT now()
);

-- 4. timeline_entries — each call/WA/email update on a ticket
-- WHY: Append-only per ticket. Multiple agents can add simultaneously (independent INSERTs).
-- ON DELETE CASCADE so deleting a ticket cleans up its entries.
CREATE TABLE timeline_entries (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       uuid        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  entry_date      date        NOT NULL,
  channel         text        NOT NULL,
  notes           text        NOT NULL,
  added_by        uuid        REFERENCES profiles(id),
  added_by_name   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 5. knowledge_base — shared fixes
-- WHY: Pre-seeded with common Medex issues. Any agent can add or delete.
CREATE TABLE knowledge_base (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_type  text        NOT NULL,
  issue       text        NOT NULL,
  fix         text        NOT NULL,
  added_by    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 6. audit_log — silent trail of all edits/deletes
-- WHY: Tamper-proof record. INSERT-only via RLS (BR-08).
-- old_data and new_data store full JSON snapshots for recovery.
CREATE TABLE audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  text        NOT NULL,
  record_id   uuid        NOT NULL,
  action      text        NOT NULL,
  changed_by  text        NOT NULL,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
