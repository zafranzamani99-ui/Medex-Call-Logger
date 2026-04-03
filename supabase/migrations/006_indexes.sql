-- Migration 006: Performance indexes
-- WHY (MY ADDITION): The spec didn't mention indexes. With ~29,000 tickets/year,
-- queries will degrade without them. These indexes target the most common queries:
-- dashboard stats, history page filters, clinic search, and timeline lookups.

-- tickets: most queried table
-- WHY: Dashboard counts filter by status constantly
CREATE INDEX idx_tickets_status ON tickets(status);

-- WHY: "Total Today" and "Resolved Today" filter by date
CREATE INDEX idx_tickets_created_at ON tickets(created_at);

-- WHY: Open ticket detection queries by clinic_code + status
CREATE INDEX idx_tickets_clinic_code ON tickets(clinic_code);

-- WHY: "Needs Attention" counter filters by this flag
CREATE INDEX idx_tickets_need_team_check ON tickets(need_team_check) WHERE need_team_check = true;

-- WHY: Stale detection queries last_activity_at for non-resolved tickets
CREATE INDEX idx_tickets_last_activity ON tickets(last_activity_at);

-- WHY: History page filters by issue_type
CREATE INDEX idx_tickets_issue_type ON tickets(issue_type);

-- WHY: History page "logged by" filter
CREATE INDEX idx_tickets_created_by ON tickets(created_by);

-- WHY: Composite index for the most common dashboard query:
-- "all open tickets, ordered by need_team_check then last_activity_at"
CREATE INDEX idx_tickets_open_priority ON tickets(need_team_check DESC, last_activity_at ASC)
  WHERE status != 'Resolved';

-- timeline_entries: always queried by ticket_id
-- WHY: Every ticket detail page fetches all timeline entries for that ticket
CREATE INDEX idx_timeline_ticket_id ON timeline_entries(ticket_id);

-- clinics: searched by name and code
-- WHY: Fuzzy search loads all clinics client-side (Fuse.js), but exact code lookup
-- is used for open-ticket-check and CRM upload validation
CREATE INDEX idx_clinics_code ON clinics(clinic_code);
CREATE INDEX idx_clinics_name ON clinics(clinic_name);

-- audit_log: queried by record_id when investigating changes
CREATE INDEX idx_audit_record ON audit_log(record_id);
CREATE INDEX idx_audit_table_record ON audit_log(table_name, record_id);
