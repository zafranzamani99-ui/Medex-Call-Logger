// WHY: Single source of truth for all UI constants — colours, labels, options.
// Prevents typos and keeps colour coding consistent across all components.
// Colours from spec Section 13.2.

import type { TicketStatus, Channel, RecordType } from './types'

// Psychology-based color mapping:
// Red/Rose = problems, errors, danger | Amber/Orange = warnings, attention needed
// Green/Emerald = money, success, health | Blue/Sky = calm, system, scheduling
// Purple/Violet = advisory, learning | Cyan/Teal = tech, medical | Slate/Gray = neutral
export const ISSUE_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  'Enquiry':        { bg: 'bg-slate-500/20', text: 'text-slate-400' },      // neutral — general question
  'Login Issue':    { bg: 'bg-rose-500/20', text: 'text-rose-400' },        // problem — access blocked
  'Printing':       { bg: 'bg-amber-500/20', text: 'text-amber-400' },      // warning — needs attention
  'Schedule':       { bg: 'bg-blue-500/20', text: 'text-blue-400' },        // calendar — time/planning
  'MTN / Sys Update': { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },      // tech — system level
  'Inventory':      { bg: 'bg-amber-600/20', text: 'text-amber-300' },      // stock — needs tracking
  'Others':         { bg: 'bg-gray-500/20', text: 'text-gray-400' },        // generic — uncategorized
  'Dispensary':     { bg: 'bg-teal-500/20', text: 'text-teal-400' },        // medical — pharmacy
  'Report':         { bg: 'bg-violet-500/20', text: 'text-violet-400' },    // output — documents
  'SST':            { bg: 'bg-orange-500/20', text: 'text-orange-400' },     // tax — warning/compliance
  'E-INV':          { bg: 'bg-rose-400/20', text: 'text-rose-300' },        // formal — invoice/document
  'WhatsApp':       { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },  // brand green — WhatsApp
  'Billing':        { bg: 'bg-green-500/20', text: 'text-green-400' },      // money — financial
  'Consultation':   { bg: 'bg-purple-500/20', text: 'text-purple-400' },    // advisory — medical counsel
  'Registration':   { bg: 'bg-sky-500/20', text: 'text-sky-400' },          // onboarding — fresh/new
  'Corp Invoice':   { bg: 'bg-emerald-600/20', text: 'text-emerald-300' },  // corporate money — green
  'Training':       { bg: 'bg-indigo-500/20', text: 'text-indigo-400' },    // learning — deep/calm
  'Bug':            { bg: 'bg-red-500/20', text: 'text-red-400' },          // danger — error/defect
}

// Default fallback color for custom issue types
export const DEFAULT_ISSUE_COLOR = { bg: 'bg-zinc-500/20', text: 'text-zinc-400' }

// Issue categories — parent classification above issue types
export const ISSUE_CATEGORIES: string[] = [
  'System Implementation',
  'User',
  'Data Issue',
  'System Issue',
  'Change Request',
]

export const ISSUE_CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  'System Implementation': { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  'User':                  { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  'Data Issue':            { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  'System Issue':          { bg: 'bg-red-500/20', text: 'text-red-400' },
  'Change Request':        { bg: 'bg-violet-500/20', text: 'text-violet-400' },
}

export const DEFAULT_CATEGORY_COLOR = { bg: 'bg-zinc-500/20', text: 'text-zinc-400' }

export function getIssueCategoryColor(cat: string) {
  return ISSUE_CATEGORY_COLORS[cat] || DEFAULT_CATEGORY_COLOR
}

// Helper to get issue type color with fallback
export function getIssueTypeColor(issueType: string) {
  return ISSUE_TYPE_COLORS[issueType] || DEFAULT_ISSUE_COLOR
}

// Status colours (spec Section 13.2)
export const STATUS_COLORS: Record<TicketStatus, { bg: string; text: string }> = {
  'Resolved':         { bg: 'bg-green-500/20', text: 'text-green-400' },
  'In Progress':      { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  'Pending Customer': { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  'Pending Team':     { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  'Escalated':        { bg: 'bg-red-500/20', text: 'text-red-400' },
}

// Renewal status colours (spec Section 13.2)
export const RENEWAL_COLORS: Record<string, { bg: string; text: string }> = {
  'VALID MN':     { bg: 'bg-green-500/20', text: 'text-green-400' },
  'EXPIRING':     { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  'EXPIRED':      { bg: 'bg-red-500/20', text: 'text-red-400' },
  'LONG EXPIRED': { bg: 'bg-red-500/20', text: 'text-red-300' },
}

// Channel options (spec Section 4.4)
export const CHANNELS: Channel[] = ['Call', 'WhatsApp', 'Email', 'Internal']

// Default issue type options — order matches team's priority
export const ISSUE_TYPES: string[] = [
  'Enquiry',
  'Login Issue',
  'Printing',
  'Schedule',
  'MTN / Sys Update',
  'Inventory',
  'Others',
  'Dispensary',
  'Report',
  'SST',
  'E-INV',
  'WhatsApp',
  'Billing',
  'Consultation',
  'Registration',
  'Corp Invoice',
  'Training',
  'Bug',
]

// Status options (spec Section 4.3)
export const STATUSES: TicketStatus[] = [
  'Resolved',
  'In Progress',
  'Pending Customer',
  'Pending Team',
  'Escalated',
]

// Record type colours — call logs vs tickets
export const RECORD_TYPE_COLORS: Record<RecordType, { bg: string; text: string }> = {
  'call':   { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  'ticket': { bg: 'bg-violet-500/20', text: 'text-violet-400' },
}

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  'call': 'Call Log',
  'ticket': 'Ticket',
}

// Call duration options (minutes → label)
export const CALL_DURATIONS: { value: number; label: string }[] = [
  { value: 15, label: '< 15 min' },
  { value: 30, label: '< 30 min' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1.5 hours' },
  { value: 120, label: '2 hours' },
]

export function getDurationLabel(minutes: number | null): string {
  if (!minutes) return '-'
  const found = CALL_DURATIONS.find((d) => d.value === minutes)
  return found ? found.label : `${minutes} min`
}

// Format actual work duration (minutes → "45m", "1h 30m", "2h")
export function formatWorkDuration(minutes: number | null): string {
  if (!minutes) return '-'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// Format live work duration (seconds → "04:32", "1:23:05")
export function formatWorkDurationLive(totalSeconds: number): string {
  if (totalSeconds < 0) return '0:00'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

// Schedule type options with duration estimates
export const SCHEDULE_TYPES: { value: string; label: string; duration: string }[] = [
  { value: 'MTN', label: 'MTN (Maintenance)', duration: '~1 hour' },
  { value: 'Server Migration', label: 'Server Migration', duration: '~1.5 to 2 hours' },
  { value: 'E-INV + SST', label: 'E-INV + SST', duration: '~1 hour' },
  { value: 'WhatsApp', label: 'WhatsApp Setup', duration: '~30 minutes' },
  { value: 'Training', label: 'Training', duration: 'Varies' },
  { value: 'Others', label: 'Others', duration: '' },
]

export const SCHEDULE_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  'MTN':              { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  'Server Migration': { bg: 'bg-violet-500/20', text: 'text-violet-400' },
  'E-INV + SST':      { bg: 'bg-rose-500/20', text: 'text-rose-400' },
  'WhatsApp':         { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  'Training':         { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  'Others':           { bg: 'bg-gray-500/20', text: 'text-gray-400' },
}

// Channel colours for timeline display
export const CHANNEL_COLORS: Record<Channel, { bg: string; text: string }> = {
  'Call':      { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  'WhatsApp':  { bg: 'bg-green-500/20', text: 'text-green-400' },
  'Email':     { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  'Internal':  { bg: 'bg-gray-500/20', text: 'text-gray-400' },
}

// Convert ALL CAPS or mixed-case names to Proper Case (e.g. "ZAFRAN ZAMANI" → "Zafran Zamani")
// CSS text-transform: capitalize won't work for ALL CAPS — must use JS
export function toProperCase(name: string): string {
  return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

// ---- Job Sheet constants ----

export const JOB_SHEET_SERVICE_TYPES = [
  'ISP1', 'ISP2', 'ISP3', 'MTN', 'AD-HOC/KIOSK',
  'Hardware', 'Label', 'Others',
]

export const JOB_SHEET_ISSUE_CATEGORIES = [
  'Mdx1 Pro/Database/Gprinter/Mycard',
  'Migrate server',
  'Network/Internet',
  'Other chargeable',
]

export const JOB_SHEET_CHECKLIST_LABELS = [
  'Total Workstation',
  'Install/Update Program Version No',
  'Database Version (after update)',
  'Apply License Key',
  'Open port tcp: 3050 and udp: 9050',
  'Change Referral Letter Header',
  'Install Ultraviewer/Anydesk',
  'Download handwriting language',
  'Share MDO_SERVER and setting directory',
  'Create System Shortcut and rename "Clinisys"',
  'Turn on sharing folder',
  'Setting region – English (Malaysia)',
  'Install Gprinter (*if any)',
  'Install Mycard Reader (*if any)',
  'Full Training',
]

export const JOB_SHEET_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft:     { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  completed: { bg: 'bg-green-500/20', text: 'text-green-400' },
}

export const DEFAULT_IMPORTANT_DETAILS = {
  main_pc_name: '',
  space_c: '',
  space_d: '',
  auto_backup_30days: false,
  ext_hdd_backup: false,
  service_db_size_before: '',
  service_db_size_after: '',
  ultraviewer_id: '',
  ultraviewer_pw: '',
  anydesk_id: '',
  anydesk_pw: '',
  ram: '',
  processor: '',
  need_server: false,
  brief_doctor: false,
}
