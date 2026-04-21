// WHY: Central type definitions mirroring the Supabase database schema.
// All components import from here — single source of truth prevents mismatches.

export type UserRole = 'admin' | 'support'

export interface Profile {
  id: string
  display_name: string
  email: string
  role: UserRole
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

  // Extended CRM columns (full Excel file)
  cloud_start: string | null
  cloud_end: string | null
  m1g_dealer_case: string | null
  pass_to_dealer: string | null
  product: string | null
  signed_up: string | null
  cms_running_no: string | null
  clinic_group: string | null
  company_name: string | null
  company_reg: string | null
  remark_additional_pc: string | null
  customer_cert_no: string | null
  cms_install_date: string | null
  address1: string | null
  address3: string | null
  address4: string | null
  contact_tel: string | null
  race: string | null
  invoice_no: string | null
  billing_address: string | null
  account_manager: string | null
  info: string | null
  clinic_type: string | null
  einv_no_reason: string | null
  status_renewal: string | null
  remarks_followup: string | null

  // Custom columns (JSONB — user-defined fields)
  custom_data: Record<string, string | boolean | null> | null

  // Operational fields (agent-managed, never overwritten by CRM upload)
  workstation_count: string | null
  main_pc_name: string | null
  device_id: string | null
  current_program_version: string | null
  current_db_version: string | null
  db_size: string | null
  ultraviewer_id: string | null
  ultraviewer_pw: string | null
  anydesk_id: string | null
  anydesk_pw: string | null
  ram: string | null
  processor: string | null
  has_e_invoice: boolean
  has_sst: boolean
  has_whatsapp: boolean
  has_backup: boolean
  has_ext_hdd: boolean
  wa_account_no: string | null
  wa_api_key: string | null
  sst_registration_no: string | null
  sst_start_date: string | null
  sst_submission: string | null
  sst_frequency: string | null
  clinic_notes: string | null
  last_updated_by: string | null
  last_updated_by_name: string | null
}

// Status values — spec Section 4.3
export type TicketStatus =
  | 'Resolved'
  | 'In Progress'
  | 'Pending Customer'
  | 'Pending Team'
  | 'Escalated'
  | 'Escalated to Admin'

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
  issue_category: string | null
  issue_type: IssueType
  issue: string
  my_response: string | null
  next_step: string | null
  next_step_pic: string | null
  next_step_contact: string | null
  timeline_from_customer: string | null
  internal_timeline: string | null

  // Duration & status
  call_duration: number | null
  status: TicketStatus
  need_team_check: boolean
  jira_link: string | null
  admin_message: string | null

  // Audit
  created_by: string
  created_by_name: string
  created_at: string
  submitted_at?: string
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
  attachment_urls?: string[]
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
  openCalls: number
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
  issue_category: string | null
  issue_type: IssueType
  issue: string
  my_response: string | null
  next_step: string | null
  next_step_pic: string | null
  next_step_contact: string | null
  timeline_from_customer: string | null
  internal_timeline: string | null
  call_duration: number | null
  status: TicketStatus
  need_team_check: boolean
  jira_link: string | null
  admin_message: string | null
}

// For inbox messages (Escalated to Admin)
export interface InboxMessage {
  id: string
  ticket_id: string
  ticket_ref: string
  clinic_name: string
  message: string
  sent_by: string
  sent_by_name: string
  status: 'open' | 'done'
  admin_reply: string | null
  replied_by: string | null
  replied_by_name: string | null
  replied_at: string | null
  reply_count: number
  created_at: string
}

// Individual reply in an inbox chat thread
export interface InboxReply {
  id: string
  inbox_message_id: string
  message: string
  sent_by: string
  sent_by_name: string
  created_at: string
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
export type ScheduleStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'rescheduled' | 'no_answer'
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
  started_at: string | null
  completed_at: string | null
  actual_duration_minutes: number | null
  pic_support: string | null
  reschedule_reason: string | null
  created_at: string
  updated_at: string
}

// ---- Job Sheet types ----

export type JobSheetStatus = 'draft' | 'completed'
export type JobOutcome = 'completed' | 'to_be_continued'
export type PaymentMethod = 'COD' | 'Cheque' | 'Online Transfer' | 'Credit Card'
export type BackupStatus = 'Yes' | 'No' | 'N/A'

export interface JobSheetChecklistItem {
  label: string
  checked: boolean
  notes: string
}

export interface JobSheetIssueCategory {
  label: string
  checked: boolean
}

export interface JobSheetImportantDetails {
  main_pc_name: string
  space_c: string
  space_c_type: '' | 'SSD' | 'HDD'
  space_d: string
  space_d_type: '' | 'SSD' | 'HDD'
  auto_backup_30days: boolean
  ext_hdd_backup: boolean
  service_db_size_before: string
  service_db_size_after: string
  ultraviewer_id: string
  ultraviewer_pw: string
  anydesk_id: string
  anydesk_pw: string
  ram: string
  processor: string
  need_server: boolean
  brief_doctor: boolean
}

export interface JobSheet {
  id: string
  js_number: string
  status: JobSheetStatus

  service_date: string
  time_start: string | null
  time_end: string | null
  service_by: string
  service_by_id: string | null

  clinic_code: string
  clinic_name: string
  contact_person: string | null
  contact_tel: string | null
  doctor_name: string | null
  doctor_phone: string | null
  clinic_email: string | null

  program_type: string | null
  version_before: string | null
  db_version_before: string | null

  service_types: string[]
  other_service_text: string | null
  issue_detail: string | null
  issue_categories: JobSheetIssueCategory[]
  other_issue_text: string | null
  backup_status: BackupStatus | null
  service_done: string | null

  suggestion: string | null
  remark: string | null

  checklist: JobSheetChecklistItem[]
  important_details: JobSheetImportantDetails

  charge_amount: number | null
  payment_method: PaymentMethod | null
  need_receipt: boolean
  need_invoice: boolean

  job_outcome: JobOutcome
  customer_rep_name: string | null

  schedule_id: string | null
  created_by: string | null
  created_by_name: string
  created_at: string
  updated_at: string
}

// CRM custom column definitions (team-shared)
export interface CustomColumn {
  id: string
  column_key: string
  column_name: string
  column_type: 'text' | 'toggle' | 'date'
  display_order: number
  created_by: string | null
  created_by_name: string | null
  created_at: string
}

// License key data — key/value pairs per clinic (master license DB)
export interface LicenseKeyEntry {
  id: string
  clinic_id: string
  clinic_code: string
  field_key: string
  field_value: string | null
  display_order: number
  updated_by: string | null
  updated_by_name: string | null
  created_at: string
  updated_at: string
}

// Resource Hub
export type ResourceCategory =
  | 'System Versions'
  | 'Database Files'
  | 'Templates'
  | 'SOPs & Guides'
  | 'Training'
  | 'Tools & Utilities'
  | 'SQL Scripts'
  | 'Support Scripts'

export interface Resource {
  id: string
  title: string
  url: string | null
  content: string | null
  description: string | null
  category: ResourceCategory
  tags: string[]
  version: string | null
  is_pinned: boolean
  created_by: string | null
  created_by_name: string
  updated_by_name: string | null
  created_at: string
  updated_at: string
}
