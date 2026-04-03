// WHY: Central type definitions mirroring the Supabase database schema.
// All components import from here — single source of truth prevents mismatches.

export interface Profile {
  id: string
  display_name: string
  email: string
  created_at: string
}

export interface Clinic {
  id: string
  clinic_code: string
  clinic_name: string
  clinic_phone: string | null
  mtn_start: string | null
  mtn_expiry: string | null
  renewal_status: string | null
  product_type: string | null
  city: string | null
  state: string | null
  registered_contact: string | null
  support_name: string | null
  customer_status: string | null
  email_main: string | null
  email_secondary: string | null
  lkey_line1: string | null
  lkey_line2: string | null
  lkey_line3: string | null
  lkey_line4: string | null
  lkey_line5: string | null
  updated_at: string
}

// Status values — spec Section 4.3
export type TicketStatus =
  | 'Resolved'
  | 'In Progress'
  | 'Pending Customer'
  | 'Pending Team'
  | 'Escalated'

// Issue types — dynamic (defaults + custom from DB)
export type IssueType = string

// Channel types — spec Section 4.4
export type Channel = 'Call' | 'WhatsApp' | 'Email' | 'Internal'

// Renewal status values — spec Section 3
export type RenewalStatus = 'VALID MN' | 'EXPIRING' | 'EXPIRED' | 'LONG EXPIRED'

// WHY: Call logs vs tickets — calls are routine (80%), tickets are for escalation (20%)
export type RecordType = 'call' | 'ticket'

// Call duration options (in minutes)
export type CallDuration = 15 | 30 | 60 | 90 | 120

export interface Ticket {
  id: string
  ticket_ref: string
  record_type: RecordType

  // Clinic snapshot (denormalized — CRM may change, ticket must not)
  clinic_code: string
  clinic_name: string
  clinic_phone: string | null
  mtn_expiry: string | null
  renewal_status: string | null
  product_type: string | null
  city: string | null
  state: string | null
  registered_contact: string | null

  // Caller info (NOT from CRM)
  caller_tel: string | null
  pic: string | null

  // Issue
  issue_type: IssueType
  issue: string
  my_response: string | null
  next_step: string | null
  timeline_from_customer: string | null
  internal_timeline: string | null

  // Duration & status
  call_duration: number | null
  status: TicketStatus
  need_team_check: boolean
  jira_link: string | null

  // Audit
  created_by: string
  created_by_name: string
  created_at: string
  updated_at: string
  last_updated_by: string | null
  last_updated_by_name: string | null
  last_change_note: string | null

  // Stale detection
  last_activity_at: string

  // Attachments
  attachment_urls: string[]

  // Joined data (optional — only when fetching with timeline)
  timeline_entries?: TimelineEntry[]
}

export interface TimelineEntry {
  id: string
  ticket_id: string
  entry_date: string
  channel: Channel
  notes: string
  added_by: string
  added_by_name: string
  created_at: string
}

export interface KnowledgeBaseEntry {
  id: string
  issue_type: IssueType
  issue: string
  fix: string
  added_by: string | null
  status: 'draft' | 'published'
  source_ticket_id: string | null
  image_urls: string[]
  created_at: string
}

export interface AuditLog {
  id: string
  table_name: string
  record_id: string
  action: 'UPDATE' | 'DELETE'
  changed_by: string
  old_data: Record<string, unknown>
  new_data: Record<string, unknown>
  created_at: string
}

// -- UI helper types --

// For the clinic search dropdown display
export interface ClinicSearchResult {
  id: string
  clinic_code: string
  clinic_name: string
  state: string | null
  product_type: string | null
  renewal_status: string | null
  // The full clinic object for auto-fill
  clinic: Clinic
}

// For the open ticket check banner
export interface OpenTicketWarning {
  id: string
  ticket_ref: string
  issue_type: IssueType
  issue: string
  created_at: string
  created_by_name: string
  status: TicketStatus
  record_type: RecordType
}

// Dashboard stats — split by call logs vs tickets
export interface DashboardStats {
  callsToday: number
  openTickets: number
  needsAttention: number
  stale: number
  resolvedToday: number
}

// For the new ticket form submission
export interface NewTicketInput {
  record_type: RecordType
  clinic_code: string
  clinic_name: string
  clinic_phone: string | null
  mtn_expiry: string | null
  renewal_status: string | null
  product_type: string | null
  city: string | null
  state: string | null
  registered_contact: string | null
  caller_tel: string | null
  pic: string | null
  issue_type: IssueType
  issue: string
  my_response: string | null
  next_step: string | null
  timeline_from_customer: string | null
  internal_timeline: string | null
  call_duration: number | null
  status: TicketStatus
  need_team_check: boolean
  jira_link: string | null
}

// For the timeline entry form
export interface NewTimelineInput {
  ticket_id: string
  entry_date: string
  channel: Channel
  notes: string
}

// Schedule types — appointment management
export type ScheduleType = 'MTN' | 'Server Migration' | 'E-INV + SST' | 'WhatsApp' | 'Training' | 'Others'
export type ScheduleStatus = 'scheduled' | 'completed' | 'cancelled' | 'rescheduled' | 'no_answer'
export type ScheduleMode = 'Remote' | 'Onsite'

export interface Schedule {
  id: string
  clinic_code: string
  clinic_name: string
  pic: string | null
  clinic_wa: string | null
  schedule_date: string
  schedule_time: string
  schedule_type: string
  custom_type: string | null
  duration_estimate: string | null
  mode: ScheduleMode
  agent_name: string
  agent_id: string
  notes: string | null
  source_ticket_id: string | null
  status: ScheduleStatus
  created_at: string
  updated_at: string
}
