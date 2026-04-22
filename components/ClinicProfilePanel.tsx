'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import type { Clinic, LicenseKeyEntry } from '@/lib/types'
import { useToast } from '@/components/ui/Toast'
import { RENEWAL_COLORS, toProperCase } from '@/lib/constants'
import Button from '@/components/ui/Button'
import { ModalDialog } from '@/components/Modal'

// WHY: Shared CRM panel — the clinic's "profile card."
// Opens from any page via clinicCode prop. Inline-editable fields.
// Section A: Identity (CRM-imported), Section B: System Info (operational),
// Section C: Notes & audit trail.

interface ClinicProfilePanelProps {
  clinicCode: string
  onClose: () => void
  onClinicUpdated?: () => void
  onClinicDeleted?: () => void
  isAdmin?: boolean
}

// Friendly labels for the change history diff output.
// Any field not listed falls back to the raw column name.
const FIELD_LABELS: Record<string, string> = {
  clinic_name: 'Clinic Name', clinic_phone: 'Phone', customer_status: 'Customer Status',
  email_main: 'Email (Main)', email_secondary: 'Email (Secondary)', product_type: 'Product Type',
  registered_contact: 'Registered Contact', support_name: 'Support Name',
  city: 'City', state: 'State', mtn_start: 'MTN Start', mtn_expiry: 'MTN Expiry',
  renewal_status: 'Renewal Status', company_name: 'Company Name', company_reg: 'Company Reg',
  clinic_group: 'Group', clinic_type: 'Clinic Type', product: 'Product',
  signed_up: 'Signed-up', customer_cert_no: 'Customer Cert No', account_manager: 'Account Manager',
  address1: 'Address 1', address3: 'Address 3', address4: 'Address 4',
  billing_address: 'Billing Address', contact_tel: 'Contact Tel', race: 'Race',
  cloud_start: 'Cloud Start', cloud_end: 'Cloud End', cms_install_date: 'CMS Install Date',
  cms_running_no: 'CMS Running No', invoice_no: 'Invoice No', m1g_dealer_case: 'M1G / Dealer Case',
  pass_to_dealer: 'Pass to Dealer', remark_additional_pc: 'Remark (Add. PC)',
  status_renewal: 'Status Renewal', einv_no_reason: 'E-INV No Reason',
  remarks_followup: 'Remarks / Follow Up', info: 'Info',
  workstation_count: 'Workstation Count', main_pc_name: 'Server Name',
  device_id: 'Device ID', current_program_version: 'Program Version',
  current_db_version: 'DB Version', db_size: 'DB Size', ram: 'RAM', processor: 'Processor',
  ultraviewer_id: 'UltraViewer ID', ultraviewer_pw: 'UltraViewer PW',
  anydesk_id: 'AnyDesk ID', anydesk_pw: 'AnyDesk PW',
  has_e_invoice: 'e-Invoice', has_sst: 'SST', has_whatsapp: 'WhatsApp',
  has_backup: 'Auto Backup', has_ext_hdd: 'External HDD',
  wa_account_no: 'WS Account No', wa_api_key: 'WS API Key',
  sst_registration_no: 'SST Registration', sst_start_date: 'SST Start Date',
  sst_submission: 'SST Submission', sst_frequency: 'SST Frequency',
  sst_period_next: 'SST Next Period',
  // E-Invoice detail (migration 066)
  einv_v1_signed: 'E-INV V1 Signed', einv_v2_signed: 'E-INV V2 Signed',
  einv_setup_fee_status: 'Setup Fee Status', einv_hosting_fee_status: 'Hosting Fee Status',
  einv_payment_date: 'E-INV Payment Date', einv_install_date: 'E-INV Install Date',
  einv_portal_credentials: 'E-INV Portal Credentials', einv_install_status: 'E-INV Install Status',
  // CRM-sheet additions (migration 067)
  hyb_live_date: 'HYB Live Date', einv_live_date: 'E-INV Live Date',
  einv_po_rcvd_date: 'E-INV PO Received', kiosk_po_date: 'Kiosk PO Date',
  kiosk_survey_form: 'Kiosk Survey Form', pc_total: 'PC Total',
  db_version: 'DB Version (xlsx)', product_version: 'Product Version (xlsx)',
  // Final 1:1 xlsx parity (migration 068)
  wspp_live_date: 'WSPP Live Date', mtn_important_note: 'MTN Important Note',
  mtn_important_note_2: 'MTN Important Note (2)',
  mn_cld_einv_renewal_rate: 'MN/CLD/EINV Renewal Rate',
  clinic_notes: 'Notes',
  lkey_line1: 'LK Address 1', lkey_line2: 'LK Address 2', lkey_line3: 'LK Address 3',
  lkey_line4: 'LK Address 4', lkey_line5: 'LK Address 5',
}

// System fields excluded from the diff — these change on every save and would drown out the real edits.
const SYSTEM_FIELDS = new Set([
  'updated_at', 'last_updated_by', 'last_updated_by_name', 'id', 'clinic_code', 'custom_data',
])

// Key fields shown for INSERT/DELETE entries — everything else hidden behind "Show all".
const KEY_SNAPSHOT_FIELDS = [
  'clinic_name', 'clinic_phone', 'state', 'product_type', 'mtn_expiry', 'renewal_status',
]

interface AuditEntry {
  id: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  changed_by: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  created_at: string
}

interface FieldChange {
  field: string
  label: string
  oldValue: string
  newValue: string
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

// Extract displayable fields from a snapshot — used for INSERT (new_data) or DELETE (old_data).
// Returns key fields first, then all other non-system fields with a value.
function snapshotFields(data: Record<string, unknown> | null): { key: FieldChange[]; extra: FieldChange[] } {
  if (!data) return { key: [], extra: [] }
  const key: FieldChange[] = []
  const extra: FieldChange[] = []
  for (const k of KEY_SNAPSHOT_FIELDS) {
    const v = data[k]
    if (v === null || v === undefined || v === '') continue
    key.push({
      field: k,
      label: FIELD_LABELS[k] || k,
      oldValue: '',
      newValue: formatValue(v),
    })
  }
  const keySet = new Set(KEY_SNAPSHOT_FIELDS)
  for (const k of Object.keys(data)) {
    if (SYSTEM_FIELDS.has(k) || keySet.has(k)) continue
    const v = data[k]
    if (v === null || v === undefined || v === '') continue
    if (typeof v === 'boolean' && !v) continue // skip "No" flags to reduce noise
    extra.push({
      field: k,
      label: FIELD_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      oldValue: '',
      newValue: formatValue(v),
    })
  }
  return { key, extra }
}

function diffAuditEntry(entry: AuditEntry): FieldChange[] {
  if (entry.action !== 'UPDATE') return []
  const oldData = entry.old_data || {}
  const newData = entry.new_data || {}
  const changes: FieldChange[] = []
  const seen = new Set<string>()
  const allKeys = [...Object.keys(oldData), ...Object.keys(newData)]
  for (const key of allKeys) {
    if (seen.has(key)) continue
    seen.add(key)
    if (SYSTEM_FIELDS.has(key)) continue
    const oldV = oldData[key]
    const newV = newData[key]
    // Treat null/undefined/empty as equal
    const oldNorm = oldV === null || oldV === undefined || oldV === '' ? null : oldV
    const newNorm = newV === null || newV === undefined || newV === '' ? null : newV
    if (JSON.stringify(oldNorm) === JSON.stringify(newNorm)) continue
    changes.push({
      field: key,
      label: FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      oldValue: formatValue(oldV),
      newValue: formatValue(newV),
    })
  }
  return changes
}

// Inline-editable text field
function EditableField({ label, value, onSave, mono, masked }: {
  label: string
  value: string | null
  onSave: (v: string) => void
  mono?: boolean
  masked?: boolean
}) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [revealed, setRevealed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      toast(`${label} copied`, 'success')
    } catch {
      toast('Copy failed', 'error')
    }
  }

  useEffect(() => { setDraft(value || '') }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commit = () => {
    setEditing(false)
    if (draft.trim() !== (value || '')) onSave(draft.trim())
  }

  if (editing) {
    return (
      <div>
        <span className="text-[11px] text-text-tertiary">{label}</span>
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) } }}
          className={`w-full px-2 py-1 bg-surface-inset border border-accent/40 rounded text-[13px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent ${mono ? 'font-mono' : ''}`}
        />
      </div>
    )
  }

  const display = value || '—'
  const showMasked = masked && value && !revealed

  return (
    <div
      className="group cursor-pointer rounded px-1 -mx-1 py-0.5 hover:bg-surface-raised transition-colors"
      onClick={() => setEditing(true)}
    >
      <span className="text-[11px] text-text-tertiary">{label}</span>
      <div className="flex items-center gap-1.5">
        <p className={`text-[13px] ${value ? 'text-text-primary' : 'text-text-muted italic'} ${mono ? 'font-mono' : ''}`}>
          {showMasked ? '••••••••' : display}
        </p>
        {masked && value && (
          <button
            onClick={e => { e.stopPropagation(); setRevealed(!revealed) }}
            className="text-text-muted hover:text-text-secondary transition-colors"
            aria-label={revealed ? 'Hide' : 'Show'}
          >
            <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              {revealed ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              ) : (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </>
              )}
            </svg>
          </button>
        )}
        <div className="ml-auto flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {value && (
            <button
              onClick={handleCopy}
              className="text-text-muted hover:text-accent transition-colors p-0.5"
              aria-label={`Copy ${label}`}
              title={`Copy ${label}`}
            >
              <svg className="size-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
            </button>
          )}
          <svg className="size-3 text-text-muted" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
          </svg>
        </div>
      </div>
    </div>
  )
}

// Regex heuristic for auto-marking new keys as sensitive.
const SENSITIVE_KEY_RE = /password|pwd|^pw$|secret|token|api[_ -]?key/i

// License Key row — displays key + value with inline edit and copy
function LicenseKeyRow({ entry, onUpdate, onDelete, onCopy }: {
  entry: LicenseKeyEntry
  onUpdate: (patch: Partial<Pick<LicenseKeyEntry, 'field_key' | 'field_value' | 'is_sensitive'>>) => void
  onDelete: () => void
  onCopy: (value: string) => void
}) {
  const [editingKey, setEditingKey] = useState(false)
  const [editingValue, setEditingValue] = useState(false)
  const [keyDraft, setKeyDraft] = useState(entry.field_key)
  const [valueDraft, setValueDraft] = useState(entry.field_value || '')
  const [revealed, setRevealed] = useState(false)

  useEffect(() => { setKeyDraft(entry.field_key) }, [entry.field_key])
  useEffect(() => { setValueDraft(entry.field_value || '') }, [entry.field_value])

  const commitKey = () => {
    setEditingKey(false)
    const trimmed = keyDraft.trim()
    if (trimmed && trimmed !== entry.field_key) onUpdate({ field_key: trimmed })
    else setKeyDraft(entry.field_key)
  }

  const commitValue = () => {
    setEditingValue(false)
    const trimmed = valueDraft.trim()
    if (trimmed !== (entry.field_value || '')) onUpdate({ field_value: trimmed || null })
  }

  return (
    <div className="group/lk flex items-center gap-2 py-1.5 px-2 rounded hover:bg-surface-raised/50 transition-colors">
      {/* Key */}
      <div className="w-1/3 min-w-0">
        {editingKey ? (
          <input
            autoFocus
            value={keyDraft}
            onChange={e => setKeyDraft(e.target.value)}
            onBlur={commitKey}
            onKeyDown={e => { if (e.key === 'Enter') commitKey(); if (e.key === 'Escape') { setKeyDraft(entry.field_key); setEditingKey(false) } }}
            className="w-full px-1.5 py-0.5 bg-surface-inset border border-accent/40 rounded text-[12px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        ) : (
          <button
            onClick={() => setEditingKey(true)}
            className="text-[12px] text-text-tertiary hover:text-text-primary text-left truncate block w-full cursor-pointer"
            title="Click to rename"
          >
            {entry.field_key}
          </button>
        )}
      </div>

      {/* Value */}
      <div className="flex-1 min-w-0 flex items-center gap-1">
        {editingValue ? (
          <input
            autoFocus
            value={valueDraft}
            onChange={e => setValueDraft(e.target.value)}
            onBlur={commitValue}
            onKeyDown={e => { if (e.key === 'Enter') commitValue(); if (e.key === 'Escape') { setValueDraft(entry.field_value || ''); setEditingValue(false) } }}
            className="w-full px-1.5 py-0.5 bg-surface-inset border border-accent/40 rounded text-[12px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent font-mono"
          />
        ) : (
          <button
            onClick={() => setEditingValue(true)}
            className={`flex-1 text-left text-[12px] font-mono truncate px-1.5 py-0.5 rounded hover:bg-surface-inset transition-colors cursor-pointer ${entry.field_value ? 'text-text-primary' : 'text-text-muted italic'}`}
            title="Click to edit"
          >
            {!entry.field_value
              ? '—'
              : entry.is_sensitive && !revealed
                ? '••••••••'
                : entry.field_value}
          </button>
        )}
        {entry.field_value && entry.is_sensitive && !editingValue && (
          <button
            onClick={() => setRevealed(v => !v)}
            className="p-0.5 text-text-muted hover:text-accent transition-colors flex-shrink-0"
            aria-label={revealed ? 'Hide' : 'Reveal'}
            title={revealed ? 'Hide' : 'Reveal'}
          >
            <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              {revealed ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              ) : (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </>
              )}
            </svg>
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover/lk:opacity-100 transition-opacity">
        <button
          onClick={() => onUpdate({ is_sensitive: !entry.is_sensitive })}
          className={`p-1 transition-colors ${entry.is_sensitive ? 'text-amber-400 hover:text-amber-300' : 'text-text-muted hover:text-amber-400'}`}
          aria-label={entry.is_sensitive ? 'Mark not sensitive' : 'Mark sensitive'}
          title={entry.is_sensitive ? 'Sensitive — click to unmark' : 'Mark as sensitive'}
        >
          <svg className="size-3.5" fill={entry.is_sensitive ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m0 0v2m0-2h2m-2 0H10m8-7V7a6 6 0 10-12 0v3m11 11H6a2 2 0 01-2-2v-8a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2z" />
          </svg>
        </button>
        {entry.field_value && (
          <button
            onClick={() => onCopy(entry.field_value || '')}
            className="p-1 text-text-muted hover:text-accent transition-colors"
            aria-label="Copy value"
            title="Copy value"
          >
            <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
          </button>
        )}
        <button
          onClick={() => { if (confirm(`Delete "${entry.field_key}"?`)) onDelete() }}
          className="p-1 text-text-muted hover:text-red-400 transition-colors"
          aria-label="Delete"
          title="Delete"
        >
          <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// Toggle switch for boolean flags
function ToggleFlag({ label, value, onToggle }: { label: string; value: boolean | null; onToggle: (v: boolean) => void }) {
  const on = value === true
  return (
    <label className="flex items-center gap-2 cursor-pointer group rounded px-1 -mx-1 py-1 hover:bg-surface-raised transition-colors">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onToggle(!on)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${on ? 'bg-accent' : 'bg-zinc-600'}`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
      </button>
      <span className="text-[12px] text-text-secondary">{label}</span>
    </label>
  )
}

// ── Record Renewal modal ───────────────────────────────────────
// Atomic MTN renewal — instead of making the agent hunt through 4 different
// fields (mtn_start, mtn_expiry, invoice_no, renewal_status) across 2
// sections, this captures everything in one form and writes it in one update.

function RenewalModal({ clinic, open, onClose, onSaved }: {
  clinic: Clinic
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const { toast } = useToast()

  // CONVENTION B (per user decision 2026-04-22):
  //   Start = same day as current expiry (1-day overlap on the transition day)
  //   End   = start + K months + 1 day (so 1 year = 366 days, 2 years = 731 days)
  // Example: current 08/12/2026, renew 1yr → 08/12/2026 → 09/12/2027.
  const defaultStart = useMemo(() => {
    if (clinic.mtn_expiry) {
      const e = new Date(clinic.mtn_expiry); e.setHours(0, 0, 0, 0)
      const today = new Date(); today.setHours(0, 0, 0, 0)
      if (!Number.isNaN(e.getTime()) && e.getTime() >= today.getTime()) {
        // Continuous renewal — start on the current expiry date itself.
        return e.toISOString().slice(0, 10)
      }
    }
    // Lapsed or never-set: start today.
    return new Date().toISOString().slice(0, 10)
  }, [clinic.mtn_expiry])

  const addMonths = (iso: string, m: number) => {
    const d = new Date(iso); d.setMonth(d.getMonth() + m); d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }

  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(() => addMonths(defaultStart, 12))
  const [invoiceNo, setInvoiceNo] = useState('')
  const [rate, setRate] = useState('')
  const [setValidMN, setSetValidMN] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setStart(defaultStart)
      setEnd(addMonths(defaultStart, 12))
      setInvoiceNo('')
      setRate('')
      setSetValidMN(true)
    }
  }, [open, defaultStart])

  const quickDuration = (months: number) => setEnd(addMonths(start, months))

  const onStartChange = (v: string) => {
    setStart(v)
    // Roll expiry to preserve the old duration, default 12mth if nothing makes sense.
    try {
      const oldStart = new Date(start)
      const oldEnd = new Date(end)
      const days = Math.max(1, Math.round((oldEnd.getTime() - oldStart.getTime()) / 86400000))
      const ne = new Date(v); ne.setDate(ne.getDate() + days)
      setEnd(ne.toISOString().slice(0, 10))
    } catch {
      setEnd(addMonths(v, 12))
    }
  }

  const handleSubmit = async () => {
    if (!start || !end) { toast('Both dates required', 'error'); return }
    if (new Date(end) <= new Date(start)) { toast('Expiry must be after start', 'error'); return }

    setSaving(true)
    const patch: Record<string, string> = {
      mtn_start: start,
      mtn_expiry: end,
      updated_at: new Date().toISOString(),
    }
    if (invoiceNo.trim()) patch.invoice_no = invoiceNo.trim()
    if (rate.trim()) patch.mn_cld_einv_renewal_rate = rate.trim()
    if (setValidMN) {
      patch.renewal_status = 'Valid MN'
      patch.status_renewal = 'Renewed'
    }
    const { error } = await supabase.from('clinics').update(patch).eq('clinic_code', clinic.clinic_code)
    setSaving(false)
    if (error) { toast(`Save failed: ${error.message}`, 'error'); return }
    toast('Renewal recorded', 'success')
    onSaved()
    onClose()
  }

  const durationDays = (() => {
    try {
      const d = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
      return d > 0 ? d : null
    } catch { return null }
  })()

  return (
    <ModalDialog open={open} onClose={onClose} title={`Record Renewal · ${clinic.clinic_code}`} size="md">
      <div className="p-4 space-y-4">
        {/* Context: current period */}
        <div className="text-[12px] bg-surface-inset/40 border border-border rounded-lg p-3 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-text-muted">Currently:</span>
            <span className="font-mono text-text-primary">{formatDDMMYYYY(clinic.mtn_start)} → {formatDDMMYYYY(clinic.mtn_expiry)}</span>
          </div>
          {clinic.renewal_status && (
            <div className="flex items-center gap-2">
              <span className="text-text-muted">Status:</span>
              <span className="text-text-secondary">{clinic.renewal_status}</span>
            </div>
          )}
        </div>

        {/* New period */}
        <div>
          <label className="text-[11px] uppercase tracking-wider text-text-muted block mb-1.5">New MTN period</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-text-tertiary block mb-1">Start</label>
              <input
                type="date"
                value={start}
                onChange={e => onStartChange(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-surface-inset border border-border rounded text-[13px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="text-[11px] text-text-tertiary block mb-1">Expiry</label>
              <input
                type="date"
                value={end}
                onChange={e => setEnd(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-surface-inset border border-border rounded text-[13px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px]">
            <span className="text-text-muted">Quick:</span>
            {[6, 12, 18, 24].map(m => (
              <button
                key={m}
                type="button"
                onClick={() => quickDuration(m)}
                className="px-2 py-0.5 rounded border border-border bg-surface text-text-secondary hover:border-accent/40 hover:text-text-primary transition-colors"
              >
                {m} mth
              </button>
            ))}
            {durationDays && <span className="ml-auto text-text-tertiary tabular-nums">= {durationDays} days</span>}
          </div>
        </div>

        {/* Invoice + rate */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-text-tertiary block mb-1">Invoice No.</label>
            <input
              type="text"
              value={invoiceNo}
              onChange={e => setInvoiceNo(e.target.value)}
              placeholder="e.g. TX00910"
              className="w-full px-2.5 py-1.5 bg-surface-inset border border-border rounded text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] text-text-tertiary block mb-1">Rate / Amount</label>
            <input
              type="text"
              value={rate}
              onChange={e => setRate(e.target.value)}
              placeholder="e.g. RM600"
              className="w-full px-2.5 py-1.5 bg-surface-inset border border-border rounded text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        {/* Auto-status checkbox */}
        <label className="flex items-start gap-2 cursor-pointer group text-[12px] p-2.5 bg-surface-inset/30 border border-border rounded">
          <input
            type="checkbox"
            checked={setValidMN}
            onChange={e => setSetValidMN(e.target.checked)}
            className="mt-0.5 size-4 accent-accent"
          />
          <span className="text-text-secondary">
            Auto-set <span className="text-text-primary font-medium">Renewal Status = &quot;Valid MN&quot;</span> and <span className="text-text-primary font-medium">Status Renewal = &quot;Renewed&quot;</span>
          </span>
        </label>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="px-3 py-1.5 text-[13px] rounded text-text-secondary hover:text-text-primary hover:bg-surface-inset transition-colors disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="px-4 py-1.5 text-[13px] font-medium rounded bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Record Renewal'}
        </button>
      </div>
    </ModalDialog>
  )
}

// ── At-a-glance summary card ──────────────────────────────────
// Shows the minimum info needed to field a phone call: subscription chips,
// MTN expiry countdown (color-coded), tap-to-call / email / WhatsApp buttons.
// Below this card the detailed editable sections handle everything else.

function formatDDMMYYYY(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return d
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${dt.getFullYear()}`
}

function daysBetween(d: string | null): number | null {
  if (!d) return null
  const dt = new Date(d); dt.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  if (Number.isNaN(dt.getTime())) return null
  return Math.round((dt.getTime() - today.getTime()) / 86400000)
}

function SubChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
      on
        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
        : 'bg-surface-inset/60 border-border/60 text-text-muted'
    }`}>
      <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-text-muted/40'}`} />
      {label}
    </span>
  )
}

function ActionButton({ href, label, sub, tone, external, icon }: {
  href: string
  label: string
  sub?: string
  tone: 'blue' | 'emerald' | 'indigo'
  external?: boolean
  icon: React.ReactNode
}) {
  const toneMap = {
    blue:    'border-blue-500/30 bg-blue-500/8 text-blue-400 hover:bg-blue-500/15 hover:border-blue-500/50',
    emerald: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-400 hover:bg-emerald-500/15 hover:border-emerald-500/50',
    indigo:  'border-indigo-500/30 bg-indigo-500/8 text-indigo-400 hover:bg-indigo-500/15 hover:border-indigo-500/50',
  }
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={`group flex-1 min-w-[110px] inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] transition-all ${toneMap[tone]}`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-none">{label}</span>
        {sub && <span className="block text-[10px] font-mono opacity-60 mt-0.5 truncate">{sub}</span>}
      </span>
    </a>
  )
}

function ClinicSummaryCard({ clinic, onRenewalClick }: { clinic: Clinic; onRenewalClick: () => void }) {
  const mtnDays = daysBetween(clinic.mtn_expiry)

  const mtnState = mtnDays === null ? 'none' : mtnDays < 0 ? 'expired' : mtnDays <= 30 ? 'expiring' : 'active'
  const mtnHeroStyle = {
    none:     'from-zinc-500/5 to-zinc-500/10 border-border text-text-muted',
    expired:  'from-red-500/5 to-red-500/10 border-red-500/30 text-red-400',
    expiring: 'from-amber-500/5 to-amber-500/10 border-amber-500/30 text-amber-400',
    active:   'from-emerald-500/5 to-emerald-500/10 border-emerald-500/30 text-emerald-400',
  }[mtnState]
  const mtnBig = mtnDays === null
    ? 'Not set'
    : mtnDays < 0
    ? `${Math.abs(mtnDays).toLocaleString()}d`
    : mtnDays === 0
    ? 'TODAY'
    : `${mtnDays.toLocaleString()}d`
  const mtnCaption = mtnDays === null
    ? 'no expiry recorded'
    : mtnDays < 0
    ? 'overdue'
    : mtnDays === 0
    ? 'expires today'
    : 'until expiry'

  const cloudActive = (() => {
    if (!clinic.cloud_end) return false
    const d = new Date(clinic.cloud_end); d.setHours(0, 0, 0, 0)
    const t = new Date(); t.setHours(0, 0, 0, 0)
    return !Number.isNaN(d.getTime()) && d.getTime() >= t.getTime()
  })()
  const mtnActive = mtnDays !== null && mtnDays >= 0

  // Normalise phone for tel: / wa.me links. Strip non-digits, keep leading "6" for MY.
  const rawPhone = clinic.clinic_phone || clinic.contact_tel || ''
  const telHref = rawPhone ? `tel:${rawPhone.replace(/[^\d+]/g, '')}` : null
  const waNumber = rawPhone ? rawPhone.replace(/[^\d]/g, '').replace(/^0/, '60') : ''
  const waHref = waNumber ? `https://wa.me/${waNumber}` : null

  const metaParts: string[] = []
  if (clinic.state) metaParts.push(clinic.state)
  if (clinic.product) metaParts.push(clinic.product)
  if (clinic.customer_status) metaParts.push(clinic.customer_status)

  const phoneIcon = <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
  const waIcon = <svg className="size-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.52 3.48A12 12 0 0012.07 0C5.42 0 .09 5.33.09 11.98c0 2.11.55 4.17 1.6 5.99L0 24l6.18-1.62a12 12 0 005.88 1.51h.01c6.64 0 12.03-5.33 12.03-11.98a11.9 11.9 0 00-3.58-8.43zM12.07 21.79h-.01a9.83 9.83 0 01-5-1.37l-.36-.21-3.71.97.99-3.62-.23-.37a9.83 9.83 0 01-1.52-5.21c0-5.46 4.44-9.9 9.9-9.9 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 012.89 6.99c0 5.46-4.44 9.89-9.94 9.89zm5.43-7.41c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.08-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.21-.24-.58-.49-.5-.67-.51l-.58-.01c-.2 0-.52.07-.79.37s-1.04 1.02-1.04 2.48 1.07 2.87 1.22 3.07c.15.2 2.11 3.22 5.11 4.52.72.31 1.28.5 1.71.64.72.23 1.38.2 1.89.12.58-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z"/></svg>
  const mailIcon = <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>

  return (
    <div className="px-5 py-4 border-b border-border bg-gradient-to-b from-surface-raised/20 to-transparent space-y-3.5">
      {/* Meta line */}
      {metaParts.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
          {metaParts.map((p, i) => (
            <span key={i} className="contents">
              {i > 0 && <span className="text-text-muted/60">·</span>}
              <span className={i === 1 ? 'text-text-secondary font-medium' : ''}>{p}</span>
            </span>
          ))}
        </div>
      )}

      {/* Hero stat: MTN countdown + record renewal CTA */}
      <div className={`rounded-xl border bg-gradient-to-br p-3.5 ${mtnHeroStyle}`}>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider opacity-75 mb-1">MTN Maintenance</p>
            <p className="text-3xl font-bold tabular-nums leading-none">{mtnBig}</p>
            <p className="text-[11px] mt-1 opacity-80">{mtnCaption}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[10px] uppercase tracking-wider opacity-75 mb-1">Expires</p>
            <p className="text-[13px] font-mono tabular-nums font-medium">{formatDDMMYYYY(clinic.mtn_expiry)}</p>
            {clinic.mtn_start && (
              <p className="text-[10px] font-mono tabular-nums opacity-60 mt-0.5">since {formatDDMMYYYY(clinic.mtn_start)}</p>
            )}
          </div>
        </div>
        {/* Record Renewal — always available. Intensity matches MTN state: solid
            button when expiring/expired, outline when still healthy. */}
        <button
          type="button"
          onClick={onRenewalClick}
          className={`mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors ${
            mtnState === 'active' || mtnState === 'none'
              ? 'bg-surface/60 border border-current/30 hover:bg-surface'
              : 'bg-current/15 border border-current/40 hover:bg-current/25'
          }`}
        >
          <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Record Renewal
        </button>
      </div>

      {/* Subscriptions */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Subscriptions</p>
        <div className="flex flex-wrap gap-1.5">
          <SubChip label="MTN" on={mtnActive} />
          <SubChip label="Cloud" on={cloudActive} />
          <SubChip label="E-Invoice" on={!!clinic.has_e_invoice} />
          <SubChip label="WhatsApp" on={!!clinic.has_whatsapp} />
          <SubChip label="SST" on={!!clinic.has_sst} />
        </div>
      </div>

      {/* Quick contact actions */}
      {(telHref || clinic.email_main || waHref) && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Quick contact</p>
          <div className="flex flex-wrap gap-2">
            {telHref && <ActionButton href={telHref} label="Call" sub={rawPhone} tone="blue" icon={phoneIcon} />}
            {waHref && <ActionButton href={waHref} label="WhatsApp" tone="emerald" external icon={waIcon} />}
            {clinic.email_main && <ActionButton href={`mailto:${clinic.email_main}`} label="Email" sub={clinic.email_main} tone="indigo" icon={mailIcon} />}
          </div>
        </div>
      )}
    </div>
  )
}

// E-Invoice funnel stage helpers — mirrors classifyEinv in ReportsView so
// "Advance Stage" sets the right field to today when user clicks the button.
type EinvFunnelStage = 'live' | 'paid' | 'signed' | 'po_only' | 'exempt' | 'not_started'

function classifyEinvStage(c: Clinic): EinvFunnelStage {
  if (c.has_e_invoice) return 'live'
  if (c.einv_no_reason && c.einv_no_reason.trim()) return 'exempt'
  if (c.einv_payment_date) return 'paid'
  if (c.einv_v1_signed || c.einv_v2_signed) return 'signed'
  if (c.einv_po_rcvd_date) return 'po_only'
  return 'not_started'
}

// Returns the set of field updates required to advance one stage, or null at terminal.
function advancementFor(stage: EinvFunnelStage, isoToday: string): {
  label: string
  nextStageLabel: string
  patch: Partial<Record<keyof Clinic, string | boolean>>
} | null {
  switch (stage) {
    case 'not_started':
      return { label: 'Mark PO Received', nextStageLabel: 'Signup Pending', patch: { einv_po_rcvd_date: isoToday } }
    case 'po_only':
      return { label: 'Mark V1 Signed', nextStageLabel: 'Payment Pending', patch: { einv_v1_signed: true, has_e_invoice: false } }
    case 'signed':
      return { label: 'Mark Payment Received', nextStageLabel: 'Install Pending', patch: { einv_payment_date: isoToday } }
    case 'paid':
      return { label: 'Mark as Live', nextStageLabel: 'Live', patch: { einv_install_date: isoToday, einv_live_date: isoToday, has_e_invoice: true } }
    case 'live': return null
    case 'exempt': return null
  }
}

const STAGE_DISPLAY: Record<EinvFunnelStage, { label: string; tone: string }> = {
  live:        { label: 'Live',            tone: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' },
  paid:        { label: 'Install Pending', tone: 'text-sky-400 bg-sky-500/15 border-sky-500/30' },
  signed:      { label: 'Payment Pending', tone: 'text-violet-400 bg-violet-500/15 border-violet-500/30' },
  po_only:     { label: 'Signup Pending',  tone: 'text-amber-400 bg-amber-500/15 border-amber-500/30' },
  exempt:      { label: 'Exempt',          tone: 'text-zinc-400 bg-zinc-500/15 border-zinc-500/30' },
  not_started: { label: 'Not Started',     tone: 'text-zinc-500 bg-zinc-500/10 border-zinc-600/30' },
}

export default function ClinicProfilePanel({ clinicCode, onClose, onClinicUpdated, onClinicDeleted, isAdmin = false }: ClinicProfilePanelProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const overlayRef = useRef<HTMLDivElement>(null)

  const [clinic, setClinic] = useState<Clinic | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')

  // Notes
  const [notes, setNotes] = useState('')
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Change history (Phase 2.1)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<AuditEntry[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [historyCount, setHistoryCount] = useState<number | null>(null)
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false)
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())

  // Delete confirmation (Phase 1.2)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [dependencies, setDependencies] = useState<{ openTickets: number; activeSchedules: number; draftJobSheets: number } | null>(null)

  // License Keys (MEDEXCRM parity)
  const [lkOpen, setLkOpen] = useState(false)
  const [lkLoaded, setLkLoaded] = useState(false)
  const [lkEntries, setLkEntries] = useState<LicenseKeyEntry[]>([])
  const [lkAddingKey, setLkAddingKey] = useState(false)
  const [lkNewKey, setLkNewKey] = useState('')
  const [lkNewValue, setLkNewValue] = useState('')

  // Escape key + body overflow
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  // Load clinic + user
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUserId(session.user.id)
        const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', session.user.id).single()
        if (profile) setUserName(profile.display_name)
      }

      const { data } = await supabase.from('clinics').select('*').eq('clinic_code', clinicCode).single()
      if (data) {
        setClinic(data as Clinic)
        setNotes(data.clinic_notes || '')
      }
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicCode])

  // Refetch after multi-field updates (renewal modal, etc.).
  const refetchClinic = useCallback(async () => {
    const { data } = await supabase.from('clinics').select('*').eq('clinic_code', clinicCode).single()
    if (data) {
      setClinic(data as Clinic)
      setNotes(data.clinic_notes || '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicCode])

  // Renewal modal state
  const [renewalOpen, setRenewalOpen] = useState(false)

  // Save a single field
  const saveField = useCallback(async (field: string, value: string | boolean) => {
    if (!clinic) return
    const normalized = value === '' ? null : value
    const patch: Record<string, unknown> = {
      [field]: normalized,
      last_updated_by: userId,
      last_updated_by_name: userName,
      updated_at: new Date().toISOString(),
    }

    // Auto-cascade derived flags so the dashboard status stays consistent with
    // the signal fields — otherwise users have to manually toggle has_e_invoice
    // after flipping V1/V2, and has_sst after entering an SST number.
    // Rule matches the upload route's parseEinvRows derivation.
    if (field === 'einv_v1_signed' || field === 'einv_v2_signed') {
      const v1 = field === 'einv_v1_signed' ? !!normalized : !!clinic.einv_v1_signed
      const v2 = field === 'einv_v2_signed' ? !!normalized : !!clinic.einv_v2_signed
      patch.has_e_invoice = v1 || v2
    }
    if (field === 'has_e_invoice') {
      // User flipping the top-level toggle: keep V1/V2 consistent with their intent.
      if (normalized === true) {
        // Turning ON while both V1/V2 are off — nudge V1 on so the status makes sense.
        if (!clinic.einv_v1_signed && !clinic.einv_v2_signed) patch.einv_v1_signed = true
      } else {
        // Turning OFF — clear both signups so the state is unambiguous.
        patch.einv_v1_signed = false
        patch.einv_v2_signed = false
      }
    }
    if (field === 'sst_registration_no') {
      patch.has_sst = normalized != null && String(normalized).trim() !== ''
    }

    const { error } = await supabase
      .from('clinics')
      .update(patch)
      .eq('clinic_code', clinicCode)

    if (error) {
      toast('Failed to save', 'error')
    } else {
      setClinic(prev => prev ? { ...prev, ...patch, [field]: normalized, last_updated_by: userId, last_updated_by_name: userName } as Clinic : null)
      onClinicUpdated?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic, clinicCode, userId, userName])

  // Auto-save notes on blur
  const saveNotes = useCallback(() => {
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    saveField('clinic_notes', notes)
  }, [notes, saveField])

  // Debounced notes save (2s after typing stops)
  const handleNotesChange = (val: string) => {
    setNotes(val)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(() => saveField('clinic_notes', val), 2000)
  }

  // Cleanup timer
  useEffect(() => {
    return () => { if (notesTimerRef.current) clearTimeout(notesTimerRef.current) }
  }, [])

  // Phase 2.1 — prefetch history count (cheap HEAD query) when clinic loads,
  // so the "Change History · N" header can show the count without loading rows.
  useEffect(() => {
    if (!clinic) return
    let cancelled = false
    const loadCount = async () => {
      const { count } = await supabase
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('table_name', 'clinics')
        .eq('record_id', clinic.id)
      if (!cancelled) setHistoryCount(count ?? 0)
    }
    loadCount()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id])

  // Phase 2.1 — lazy-load full history on first expand
  const loadHistory = useCallback(async () => {
    if (!clinic || historyLoaded) return
    setHistoryLoading(true)
    const { data } = await supabase
      .from('audit_log')
      .select('id, action, changed_by, old_data, new_data, created_at')
      .eq('table_name', 'clinics')
      .eq('record_id', clinic.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setHistoryEntries((data || []) as AuditEntry[])
    setHistoryLoaded(true)
    setHistoryLoading(false)
  }, [clinic, historyLoaded, supabase])

  // Phase A.1 — append the next 50 entries
  const loadMoreHistory = useCallback(async () => {
    if (!clinic || historyLoadingMore) return
    setHistoryLoadingMore(true)
    const offset = historyEntries.length
    const { data } = await supabase
      .from('audit_log')
      .select('id, action, changed_by, old_data, new_data, created_at')
      .eq('table_name', 'clinics')
      .eq('record_id', clinic.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + 49)
    if (data && data.length > 0) {
      setHistoryEntries(prev => [...prev, ...(data as AuditEntry[])])
    }
    setHistoryLoadingMore(false)
  }, [clinic, historyEntries.length, historyLoadingMore, supabase])

  const toggleHistory = () => {
    const next = !historyOpen
    setHistoryOpen(next)
    if (next && !historyLoaded) loadHistory()
  }

  const toggleEntryExpanded = (id: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Phase 1.2 — load dependency counts when delete modal opens
  const openDeleteModal = useCallback(async () => {
    if (!clinic) return
    setDeleteModalOpen(true)
    setDependencies(null)
    const [ticketsRes, schedulesRes, jobSheetsRes] = await Promise.all([
      supabase.from('tickets').select('id', { count: 'exact', head: true })
        .eq('clinic_code', clinic.clinic_code).neq('status', 'Resolved'),
      supabase.from('schedules').select('id', { count: 'exact', head: true })
        .eq('clinic_code', clinic.clinic_code).in('status', ['scheduled', 'in_progress']),
      supabase.from('job_sheets').select('id', { count: 'exact', head: true })
        .eq('clinic_code', clinic.clinic_code).eq('status', 'draft'),
    ])
    setDependencies({
      openTickets: ticketsRes.count || 0,
      activeSchedules: schedulesRes.count || 0,
      draftJobSheets: jobSheetsRes.count || 0,
    })
  }, [clinic, supabase])

  // ── License Keys ─────────────────────────────────────────────────
  const loadLicenseKeys = useCallback(async () => {
    if (!clinic || lkLoaded) return
    const { data } = await supabase
      .from('license_key_data')
      .select('*')
      .eq('clinic_id', clinic.id)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })
    setLkEntries((data || []) as LicenseKeyEntry[])
    setLkLoaded(true)
  }, [clinic, lkLoaded, supabase])

  const toggleLicenseKeys = () => {
    const next = !lkOpen
    setLkOpen(next)
    if (next && !lkLoaded) loadLicenseKeys()
  }

  const addLicenseKey = async () => {
    if (!clinic) return
    const key = lkNewKey.trim()
    const value = lkNewValue.trim()
    if (!key) return
    // Auto-flag keys that look like credentials.
    const isSensitive = SENSITIVE_KEY_RE.test(key)
    const { data, error } = await supabase
      .from('license_key_data')
      .insert({
        clinic_id: clinic.id,
        clinic_code: clinic.clinic_code,
        field_key: key,
        field_value: value || null,
        display_order: lkEntries.length,
        is_sensitive: isSensitive,
        updated_by: userId || null,
        updated_by_name: userName || null,
      })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') toast(`Key "${key}" already exists`, 'error')
      else toast(`Failed to add: ${error.message}`, 'error')
      return
    }
    setLkEntries(prev => [...prev, data as LicenseKeyEntry])
    setLkNewKey('')
    setLkNewValue('')
    setLkAddingKey(false)
  }

  const updateLicenseKey = async (id: string, patch: Partial<Pick<LicenseKeyEntry, 'field_key' | 'field_value' | 'is_sensitive'>>) => {
    const { error } = await supabase
      .from('license_key_data')
      .update({
        ...patch,
        updated_by: userId || null,
        updated_by_name: userName || null,
      })
      .eq('id', id)
    if (error) {
      toast('Failed to save', 'error')
      return
    }
    setLkEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }

  const deleteLicenseKey = async (id: string) => {
    const { error } = await supabase.from('license_key_data').delete().eq('id', id)
    if (error) {
      toast('Failed to delete', 'error')
      return
    }
    setLkEntries(prev => prev.filter(e => e.id !== id))
  }

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(`${label} copied`, 'success')
    } catch {
      toast('Copy failed', 'error')
    }
  }

  const copyAllLicenseKeys = () => {
    if (!clinic) return
    const lines = [
      `${clinic.clinic_code} — ${clinic.clinic_name}`,
      ...lkEntries.map(e => `${e.field_key}: ${e.field_value || ''}`),
    ]
    copyToClipboard(lines.join('\n'), 'All license keys')
  }

  // Phase C.8 — Export LK entries to Excel
  const exportLicenseKeys = async () => {
    if (!clinic || lkEntries.length === 0) return
    const XLSX = await import('xlsx')
    const headers = ['Key', 'Value', 'Sensitive', 'Updated By', 'Updated At']
    const rows = lkEntries.map(e => [
      e.field_key,
      e.field_value || '',
      e.is_sensitive ? 'Yes' : 'No',
      e.updated_by_name || '',
      e.updated_at ? format(new Date(e.updated_at), 'yyyy-MM-dd HH:mm') : '',
    ])
    const ws = XLSX.utils.aoa_to_sheet([
      [`License Keys — ${clinic.clinic_code} ${clinic.clinic_name}`],
      [],
      headers,
      ...rows,
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'License Keys')
    XLSX.writeFile(wb, `lk-${clinic.clinic_code}-${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast('License keys exported', 'success')
  }

  const handleDelete = async () => {
    if (!clinic) return
    setDeleting(true)

    // Manual audit write (trigger is UPDATE-only — see migration 042 comment)
    await supabase.from('audit_log').insert({
      table_name: 'clinics',
      record_id: clinic.id,
      action: 'DELETE',
      changed_by: userName || 'system',
      old_data: clinic,
      new_data: null,
    })

    const { error } = await supabase.from('clinics').delete().eq('id', clinic.id)

    if (error) {
      toast(`Failed to delete: ${error.message}`, 'error')
      setDeleting(false)
      return
    }

    toast(`Clinic ${clinic.clinic_code} deleted`, 'success')
    setDeleting(false)
    setDeleteModalOpen(false)
    onClinicDeleted?.()
  }

  const renewalColor = clinic?.renewal_status ? RENEWAL_COLORS[clinic.renewal_status] : null

  if (loading) {
    return (
      <div ref={overlayRef} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === overlayRef.current) onClose() }}>
        <div className="absolute inset-y-0 right-0 w-full max-w-2xl bg-surface border-l border-border shadow-theme-lg flex flex-col animate-fadeIn">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="h-5 w-40 skeleton rounded" />
            <button onClick={onClose} className="text-text-secondary hover:text-text-primary p-1"><svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
          <div className="p-4 space-y-4">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 skeleton rounded" />)}
          </div>
        </div>
      </div>
    )
  }

  if (!clinic) {
    return (
      <div ref={overlayRef} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === overlayRef.current) onClose() }}>
        <div className="absolute inset-y-0 right-0 w-full max-w-2xl bg-surface border-l border-border shadow-theme-lg flex flex-col animate-fadeIn">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-text-primary">Clinic Not Found</h3>
            <button onClick={onClose} className="text-text-secondary hover:text-text-primary p-1"><svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
          <div className="p-4"><p className="text-sm text-text-tertiary">No clinic found with code &quot;{clinicCode}&quot;</p></div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="absolute inset-y-0 right-0 w-full max-w-2xl bg-surface border-l border-border shadow-theme-lg flex flex-col animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400 text-[11px] font-mono font-medium">{clinic.clinic_code}</span>
              <h3 className="font-semibold text-text-primary text-sm truncate">{clinic.clinic_name}</h3>
            </div>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors p-1 -mr-1 ml-2 flex-shrink-0" aria-label="Close">
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Summary Card — at-a-glance snapshot for phone calls:
              subscription chips, MTN countdown, quick contact. */}
          <ClinicSummaryCard clinic={clinic} onRenewalClick={() => setRenewalOpen(true)} />

          {/* Section A: Identity (CRM-imported) */}
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Identity</h4>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1">
              <EditableField label="Clinic Name" value={clinic.clinic_name} onSave={v => saveField('clinic_name', v)} />
              <EditableField label="Phone" value={clinic.clinic_phone} onSave={v => saveField('clinic_phone', v)} mono />
              <EditableField label="Customer Status" value={clinic.customer_status} onSave={v => saveField('customer_status', v)} />
              <EditableField label="Email (Main)" value={clinic.email_main} onSave={v => saveField('email_main', v)} />
              <EditableField label="Email (Secondary)" value={clinic.email_secondary} onSave={v => saveField('email_secondary', v)} />
              <EditableField label="Product Type" value={clinic.product_type} onSave={v => saveField('product_type', v)} />
              <EditableField label="Registered Contact" value={clinic.registered_contact} onSave={v => saveField('registered_contact', v)} />
              <EditableField label="Support Name" value={clinic.support_name} onSave={v => saveField('support_name', v)} />
              <EditableField label="City" value={clinic.city} onSave={v => saveField('city', v)} />
              <EditableField label="State" value={clinic.state} onSave={v => saveField('state', v)} />
            </div>

            {/* MTN Info */}
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 mt-1">
              <div className="px-1 py-0.5">
                <span className="text-[11px] text-text-tertiary">MTN Start</span>
                <p className="text-[13px] text-text-primary">{clinic.mtn_start || '—'}</p>
              </div>
              <div className="px-1 py-0.5">
                <span className="text-[11px] text-text-tertiary">MTN Expiry</span>
                <div className="flex items-center gap-1.5">
                  <p className="text-[13px] text-text-primary">{clinic.mtn_expiry || '—'}</p>
                  {clinic.renewal_status && renewalColor && (
                    <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${renewalColor.bg} ${renewalColor.text}`}>
                      {clinic.renewal_status}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* LKEY Address */}
            {(clinic.lkey_line1 || clinic.lkey_line2 || clinic.lkey_line3 || clinic.lkey_line4) && (
              <div className="mt-2 px-1">
                <span className="text-[11px] text-text-tertiary">License Key Address</span>
                <div className="text-[12px] text-text-secondary leading-relaxed">
                  {[clinic.lkey_line1, clinic.lkey_line2, clinic.lkey_line3, clinic.lkey_line4].filter(Boolean).map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section: Company Info */}
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Company</h4>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1">
              <EditableField label="Company Name" value={clinic.company_name} onSave={v => saveField('company_name', v)} />
              <EditableField label="Co. Reg & BRN" value={clinic.company_reg} onSave={v => saveField('company_reg', v)} mono />
              <EditableField label="Group" value={clinic.clinic_group} onSave={v => saveField('clinic_group', v)} />
              <EditableField label="Clinic Type" value={clinic.clinic_type} onSave={v => saveField('clinic_type', v)} />
              <EditableField label="Product" value={clinic.product} onSave={v => saveField('product', v)} />
              <EditableField label="Signed-up" value={clinic.signed_up} onSave={v => saveField('signed_up', v)} />
              <EditableField label="Customer Cert No." value={clinic.customer_cert_no} onSave={v => saveField('customer_cert_no', v)} mono />
              <EditableField label="Account Manager" value={clinic.account_manager} onSave={v => saveField('account_manager', v)} />
            </div>
          </div>

          {/* Section: Address */}
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Address</h4>
            <div className="grid grid-cols-1 gap-y-1">
              <EditableField label="Address 1" value={clinic.address1} onSave={v => saveField('address1', v)} />
              <EditableField label="Address 3" value={clinic.address3} onSave={v => saveField('address3', v)} />
              <EditableField label="Address 4" value={clinic.address4} onSave={v => saveField('address4', v)} />
              <EditableField label="Billing Address / AAMS Acc No" value={clinic.billing_address} onSave={v => saveField('billing_address', v)} />
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 mt-1">
              <EditableField label="Contact Tel" value={clinic.contact_tel} onSave={v => saveField('contact_tel', v)} mono />
              <EditableField label="Race" value={clinic.race} onSave={v => saveField('race', v)} />
            </div>
          </div>

          {/* Section: CRM Dates & Billing */}
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Dates & Billing</h4>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1">
              <div className="px-1 py-0.5">
                <span className="text-[11px] text-text-tertiary">Cloud Start</span>
                <p className="text-[13px] text-text-primary">{clinic.cloud_start || '—'}</p>
              </div>
              <div className="px-1 py-0.5">
                <span className="text-[11px] text-text-tertiary">Cloud End</span>
                <p className="text-[13px] text-text-primary">{clinic.cloud_end || '—'}</p>
              </div>
              <div className="px-1 py-0.5">
                <span className="text-[11px] text-text-tertiary">CMS Install Date</span>
                <p className="text-[13px] text-text-primary">{clinic.cms_install_date || '—'}</p>
              </div>
              <EditableField label="CMS Running No." value={clinic.cms_running_no} onSave={v => saveField('cms_running_no', v)} mono />
              <EditableField label="Invoice No." value={clinic.invoice_no} onSave={v => saveField('invoice_no', v)} mono />
              <EditableField label="M1G / Dealer Case" value={clinic.m1g_dealer_case} onSave={v => saveField('m1g_dealer_case', v)} />
              <EditableField label="Pass to Dealer/M1G" value={clinic.pass_to_dealer} onSave={v => saveField('pass_to_dealer', v)} />
              <EditableField label="Remark (add. PC)" value={clinic.remark_additional_pc} onSave={v => saveField('remark_additional_pc', v)} />
            </div>
            <div className="grid grid-cols-1 gap-y-1 mt-1">
              <EditableField label="MTN Important Note" value={clinic.mtn_important_note} onSave={v => saveField('mtn_important_note', v)} />
              <EditableField label="MTN Important Note (2)" value={clinic.mtn_important_note_2} onSave={v => saveField('mtn_important_note_2', v)} />
            </div>
          </div>

          {/* Section: Renewal & Status */}
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Renewal & Status</h4>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1">
              <EditableField label="Status Renewal" value={clinic.status_renewal} onSave={v => saveField('status_renewal', v)} />
              <EditableField label="E-INV No Reason" value={clinic.einv_no_reason} onSave={v => saveField('einv_no_reason', v)} />
              <EditableField label="MN/CLD/EINV Renewal Rate" value={clinic.mn_cld_einv_renewal_rate} onSave={v => saveField('mn_cld_einv_renewal_rate', v)} />
            </div>
            <div className="grid grid-cols-1 gap-y-1 mt-1">
              <EditableField label="Remarks / Follow Up" value={clinic.remarks_followup} onSave={v => saveField('remarks_followup', v)} />
              <EditableField label="Info" value={clinic.info} onSave={v => saveField('info', v)} />
            </div>
          </div>

          {/* Section B: System Info (Operational) */}
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">System Info</h4>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1">
              <EditableField label="PC Total" value={clinic.pc_total} onSave={v => saveField('pc_total', v)} />
              <EditableField label="Workstation Count" value={clinic.workstation_count} onSave={v => saveField('workstation_count', v)} />
              <EditableField label="Server Name" value={clinic.main_pc_name} onSave={v => saveField('main_pc_name', v)} mono />
              <EditableField label="Device ID" value={clinic.device_id} onSave={v => saveField('device_id', v)} mono />
              <EditableField label="Program Version (on-site)" value={clinic.current_program_version} onSave={v => saveField('current_program_version', v)} mono />
              <EditableField label="Product Version (xlsx)" value={clinic.product_version} onSave={v => saveField('product_version', v)} mono />
              <EditableField label="DB Version (on-site)" value={clinic.current_db_version} onSave={v => saveField('current_db_version', v)} mono />
              <EditableField label="DB Version (xlsx)" value={clinic.db_version} onSave={v => saveField('db_version', v)} mono />
              <EditableField label="DB Size" value={clinic.db_size} onSave={v => saveField('db_size', v)} mono />
              <EditableField label="RAM" value={clinic.ram} onSave={v => saveField('ram', v)} />
              <EditableField label="Processor" value={clinic.processor} onSave={v => saveField('processor', v)} />
            </div>

            {/* Kiosk / Hybrid (sparse, niche) */}
            <div className="mt-3">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Kiosk / Hybrid</span>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1 mt-1">
                <ToggleFlag label="Kiosk Survey Form" value={clinic.kiosk_survey_form} onToggle={v => saveField('kiosk_survey_form', v)} />
                <EditableField label="Kiosk PO Date" value={clinic.kiosk_po_date} onSave={v => saveField('kiosk_po_date', v)} />
                <EditableField label="HYB Live Date" value={clinic.hyb_live_date} onSave={v => saveField('hyb_live_date', v)} />
              </div>
            </div>

            {/* Remote Access */}
            <div className="mt-3">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Remote Access</span>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1 mt-1">
                <EditableField label="UltraViewer ID" value={clinic.ultraviewer_id} onSave={v => saveField('ultraviewer_id', v)} mono />
                <EditableField label="UltraViewer PW" value={clinic.ultraviewer_pw} onSave={v => saveField('ultraviewer_pw', v)} mono masked />
                <EditableField label="AnyDesk ID" value={clinic.anydesk_id} onSave={v => saveField('anydesk_id', v)} mono />
                <EditableField label="AnyDesk PW" value={clinic.anydesk_pw} onSave={v => saveField('anydesk_pw', v)} mono masked />
              </div>
            </div>

            {/* Feature Flags */}
            <div className="mt-3">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Features</span>
              <div className="grid grid-cols-3 gap-x-4 mt-1">
                <ToggleFlag label="e-Invoice" value={clinic.has_e_invoice} onToggle={v => saveField('has_e_invoice', v)} />
                <ToggleFlag label="SST" value={clinic.has_sst} onToggle={v => saveField('has_sst', v)} />
                <ToggleFlag label="WhatsApp" value={clinic.has_whatsapp} onToggle={v => saveField('has_whatsapp', v)} />
                <ToggleFlag label="Auto Backup" value={clinic.has_backup} onToggle={v => saveField('has_backup', v)} />
                <ToggleFlag label="External HDD" value={clinic.has_ext_hdd} onToggle={v => saveField('has_ext_hdd', v)} />
              </div>
            </div>

          </div>

          {/* Section: E-Invoice & WhatsApp (dedicated) */}
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">E-Invoice &amp; WhatsApp</h4>

            {/* Funnel stage card: shows where this clinic is in the E-Invoice
                adoption funnel + a one-click button to advance to the next stage.
                Terminal stages (Live, Exempt) hide the button. */}
            {(() => {
              const stage = classifyEinvStage(clinic)
              const display = STAGE_DISPLAY[stage]
              const isoToday = new Date().toISOString().slice(0, 10)
              const next = advancementFor(stage, isoToday)
              return (
                <div className="mb-4 rounded-xl border border-border bg-gradient-to-br from-surface-inset/40 to-transparent overflow-hidden">
                  <div className="flex flex-wrap items-center gap-3 p-3.5">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">E-Invoice funnel stage</p>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold border ${display.tone}`}>
                        <span className="size-1.5 rounded-full bg-current" />
                        {display.label}
                      </span>
                    </div>
                    {next ? (
                      <button
                        onClick={async () => {
                          if (!confirm(`Advance this clinic from "${display.label}" to "${next.nextStageLabel}"?\n\nThis will set today's date on the matching field.`)) return
                          for (const [field, value] of Object.entries(next.patch)) {
                            await saveField(field, value as string | boolean)
                          }
                        }}
                        className="ml-auto group inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium bg-accent/15 border border-accent/40 text-accent hover:bg-accent hover:text-white hover:border-accent transition-all shadow-sm"
                      >
                        <span>{next.label}</span>
                        <svg className="size-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                      </button>
                    ) : (
                      <span className="ml-auto text-[11px] text-text-muted italic">Terminal stage — no action</span>
                    )}
                  </div>
                  {next && (
                    <div className="px-3.5 py-2 text-[11px] text-text-tertiary border-t border-border/60 bg-surface-inset/20">
                      Click to advance → <span className="text-text-secondary font-medium">{next.nextStageLabel}</span> (sets today&apos;s date)
                    </div>
                  )}
                </div>
              )
            })()}

            {/* E-Invoice block */}
            <div>
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">E-Invoice</span>
              <div className="grid grid-cols-3 gap-x-4 mt-1">
                <ToggleFlag label="e-Invoice" value={clinic.has_e_invoice} onToggle={v => saveField('has_e_invoice', v)} />
                <ToggleFlag label="V1 Signed (RM699)" value={clinic.einv_v1_signed} onToggle={v => saveField('einv_v1_signed', v)} />
                <ToggleFlag label="V2 Signed (RM500)" value={clinic.einv_v2_signed} onToggle={v => saveField('einv_v2_signed', v)} />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                <EditableField label="PO Received" value={clinic.einv_po_rcvd_date} onSave={v => saveField('einv_po_rcvd_date', v)} />
                <EditableField label="Live Date" value={clinic.einv_live_date} onSave={v => saveField('einv_live_date', v)} />
                <EditableField label="Install Date" value={clinic.einv_install_date} onSave={v => saveField('einv_install_date', v)} />
                <EditableField label="Payment Date (Hosting)" value={clinic.einv_payment_date} onSave={v => saveField('einv_payment_date', v)} />
                <EditableField label="Setup Fee Status" value={clinic.einv_setup_fee_status} onSave={v => saveField('einv_setup_fee_status', v)} />
                <EditableField label="Hosting Fee Status" value={clinic.einv_hosting_fee_status} onSave={v => saveField('einv_hosting_fee_status', v)} />
                <EditableField label="Install Status" value={clinic.einv_install_status} onSave={v => saveField('einv_install_status', v)} />
                <EditableField label="Reason (not using)" value={clinic.einv_no_reason} onSave={v => saveField('einv_no_reason', v)} />
              </div>
              {isAdmin && (
                <div className="grid grid-cols-1 gap-x-4 mt-1">
                  <EditableField label="Portal Credentials" value={clinic.einv_portal_credentials} onSave={v => saveField('einv_portal_credentials', v)} mono masked />
                </div>
              )}
            </div>

            {/* WhatsApp block */}
            <div className="mt-3">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">WhatsApp</span>
              <div className="grid grid-cols-3 gap-x-4 mt-1">
                <ToggleFlag label="WhatsApp" value={clinic.has_whatsapp} onToggle={v => saveField('has_whatsapp', v)} />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                <EditableField label="WSPP Live Date" value={clinic.wspp_live_date} onSave={v => saveField('wspp_live_date', v)} />
                <EditableField label="WS Account No" value={clinic.wa_account_no} onSave={v => saveField('wa_account_no', v)} mono />
                <EditableField label="WS API Key" value={clinic.wa_api_key} onSave={v => saveField('wa_api_key', v)} mono masked />
              </div>
            </div>

            {/* SST block */}
            <div className="mt-3">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">SST</span>
              <div className="grid grid-cols-3 gap-x-4 mt-1">
                <ToggleFlag label="SST" value={clinic.has_sst} onToggle={v => saveField('has_sst', v)} />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                <EditableField label="Registration No" value={clinic.sst_registration_no} onSave={v => saveField('sst_registration_no', v)} mono />
                <EditableField label="Start Date" value={clinic.sst_start_date} onSave={v => saveField('sst_start_date', v)} />
                <EditableField label="Current Period" value={clinic.sst_frequency} onSave={v => saveField('sst_frequency', v)} />
                <EditableField label="Next Period" value={clinic.sst_period_next} onSave={v => saveField('sst_period_next', v)} />
                <EditableField label="Submission" value={clinic.sst_submission} onSave={v => saveField('sst_submission', v)} />
              </div>
            </div>
          </div>

          {/* Section C: Notes & Audit */}
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Notes</h4>
            <textarea
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
              onBlur={saveNotes}
              placeholder="Add notes about this clinic..."
              rows={4}
              className="w-full px-3 py-2 bg-surface-inset border border-border rounded-lg text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent resize-none"
            />

            {/* Last updated */}
            {clinic.last_updated_by_name && (
              <p className="text-[11px] text-text-muted mt-2">
                Last updated by <span className="text-text-tertiary font-medium">{toProperCase(clinic.last_updated_by_name)}</span>
              </p>
            )}
          </div>

          {/* License Keys (MEDEXCRM parity) */}
          <div className="px-4 py-3 border-b border-border">
            <button
              type="button"
              onClick={toggleLicenseKeys}
              className="w-full flex items-center justify-between text-left hover:bg-surface-raised/50 -mx-1 px-1 py-1 rounded transition-colors"
            >
              <div className="flex items-center gap-2">
                <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">License Keys</h4>
                {lkLoaded && <span className="text-[11px] text-text-tertiary">· {lkEntries.length}</span>}
              </div>
              <svg
                className={`size-4 text-text-muted transition-transform duration-200 ${lkOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {lkOpen && (
              <div className="mt-3 space-y-2">
                {!lkLoaded && <p className="text-[12px] text-text-muted">Loading…</p>}

                {lkLoaded && lkEntries.length === 0 && !lkAddingKey && (
                  <p className="text-[12px] text-text-muted">No license keys recorded.</p>
                )}

                {lkLoaded && lkEntries.map(entry => (
                  <LicenseKeyRow
                    key={entry.id}
                    entry={entry}
                    onUpdate={(patch) => updateLicenseKey(entry.id, patch)}
                    onDelete={() => deleteLicenseKey(entry.id)}
                    onCopy={(v) => copyToClipboard(v, entry.field_key)}
                  />
                ))}

                {lkAddingKey && (
                  <div className="flex items-center gap-2 p-2 bg-surface-inset rounded-lg border border-accent/30">
                    <input
                      value={lkNewKey}
                      onChange={e => setLkNewKey(e.target.value)}
                      placeholder="Key (e.g. Install Key)"
                      className="w-1/3 px-2 py-1 bg-surface border border-border rounded text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                      autoFocus
                    />
                    <input
                      value={lkNewValue}
                      onChange={e => setLkNewValue(e.target.value)}
                      placeholder="Value"
                      className="flex-1 px-2 py-1 bg-surface border border-border rounded text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent font-mono"
                      onKeyDown={e => { if (e.key === 'Enter' && lkNewKey.trim()) addLicenseKey() }}
                    />
                    <button
                      onClick={addLicenseKey}
                      disabled={!lkNewKey.trim()}
                      className="px-2.5 py-1 bg-accent text-white rounded text-[12px] font-medium disabled:opacity-40 hover:bg-accent/90 transition-colors"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setLkAddingKey(false); setLkNewKey(''); setLkNewValue('') }}
                      className="text-text-muted hover:text-text-primary p-1"
                      aria-label="Cancel"
                    >
                      <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Footer actions */}
                <div className="flex items-center gap-2 pt-1">
                  {!lkAddingKey && (
                    <button
                      onClick={() => setLkAddingKey(true)}
                      className="text-[12px] text-accent hover:underline flex items-center gap-1"
                    >
                      <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add key
                    </button>
                  )}
                  {lkEntries.length > 0 && (
                    <>
                      <span className="text-text-muted">·</span>
                      <button
                        onClick={copyAllLicenseKeys}
                        className="text-[12px] text-text-tertiary hover:text-text-primary flex items-center gap-1 transition-colors"
                      >
                        <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        Copy all
                      </button>
                      <span className="text-text-muted">·</span>
                      <button
                        onClick={exportLicenseKeys}
                        className="text-[12px] text-text-tertiary hover:text-text-primary flex items-center gap-1 transition-colors"
                      >
                        <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Export Excel
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Phase 2.1 — Change History */}
          <div className="px-4 py-3 border-b border-border">
            <button
              type="button"
              onClick={toggleHistory}
              className="w-full flex items-center justify-between text-left hover:bg-surface-raised/50 -mx-1 px-1 py-1 rounded transition-colors"
            >
              <div className="flex items-center gap-2">
                <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Change History</h4>
                {historyCount !== null && (
                  <span className="text-[11px] text-text-tertiary">· {historyCount} {historyCount === 1 ? 'change' : 'changes'}</span>
                )}
              </div>
              <svg
                className={`size-4 text-text-muted transition-transform duration-200 ${historyOpen ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {historyOpen && (
              <div className="mt-3 space-y-3 max-h-72 overflow-y-auto">
                {historyLoading && <p className="text-[12px] text-text-muted">Loading history…</p>}
                {!historyLoading && historyEntries.length === 0 && (
                  <p className="text-[12px] text-text-muted">No changes recorded yet.</p>
                )}
                {historyEntries.map(entry => {
                  const isInsert = entry.action === 'INSERT'
                  const isDelete = entry.action === 'DELETE'
                  const dotColor = isInsert ? 'bg-emerald-400/70' : isDelete ? 'bg-red-400/70' : 'bg-blue-400/70'
                  const actionLabel = isInsert ? 'Created' : isDelete ? 'Deleted' : null
                  const isExpanded = expandedEntries.has(entry.id)

                  // UPDATE: diff old→new. INSERT/DELETE: snapshot fields from new_data/old_data.
                  const changes = diffAuditEntry(entry)
                  const snapshot = isInsert
                    ? snapshotFields(entry.new_data)
                    : isDelete
                      ? snapshotFields(entry.old_data)
                      : { key: [], extra: [] }

                  return (
                    <div key={entry.id} className="flex items-start gap-2 text-[12px]">
                      <div className={`size-1.5 rounded-full flex-shrink-0 mt-1.5 ${dotColor}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-text-tertiary">
                          <span title={format(new Date(entry.created_at), 'dd MMM yyyy HH:mm')}>
                            {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                          </span>
                          {' · '}
                          <span className="text-text-secondary">{toProperCase(entry.changed_by)}</span>
                        </div>
                        {actionLabel && <p className="text-text-muted mt-0.5">{actionLabel}</p>}

                        {/* UPDATE: field-level diff */}
                        {changes.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {changes.map(c => (
                              <li key={c.field} className="text-text-muted">
                                <span className="text-text-secondary">{c.label}:</span>{' '}
                                <span className="line-through opacity-60" title={c.oldValue}>{c.oldValue.length > 40 ? c.oldValue.slice(0, 40) + '…' : c.oldValue}</span>
                                {' → '}
                                <span className="text-text-primary" title={c.newValue}>{c.newValue.length > 40 ? c.newValue.slice(0, 40) + '…' : c.newValue}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {/* INSERT/DELETE: snapshot fields */}
                        {(isInsert || isDelete) && (snapshot.key.length > 0 || snapshot.extra.length > 0) && (
                          <div className="mt-1">
                            <ul className="space-y-0.5">
                              {snapshot.key.map(c => (
                                <li key={c.field} className="text-text-muted">
                                  <span className="text-text-secondary">{c.label}:</span>{' '}
                                  <span className="text-text-primary" title={c.newValue}>
                                    {c.newValue.length > 40 ? c.newValue.slice(0, 40) + '…' : c.newValue}
                                  </span>
                                </li>
                              ))}
                              {isExpanded && snapshot.extra.map(c => (
                                <li key={c.field} className="text-text-muted">
                                  <span className="text-text-secondary">{c.label}:</span>{' '}
                                  <span className="text-text-primary" title={c.newValue}>
                                    {c.newValue.length > 40 ? c.newValue.slice(0, 40) + '…' : c.newValue}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {snapshot.extra.length > 0 && (
                              <button
                                onClick={() => toggleEntryExpanded(entry.id)}
                                className="text-[11px] text-accent hover:underline mt-1"
                              >
                                {isExpanded ? 'Show less' : `Show all fields (+${snapshot.extra.length})`}
                              </button>
                            )}
                          </div>
                        )}

                        {!actionLabel && changes.length === 0 && (
                          <p className="text-text-muted italic mt-0.5">No visible changes</p>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Phase A.1 — Load 50 more */}
                {historyLoaded && historyCount !== null && historyEntries.length < historyCount && (
                  <div className="pt-2 border-t border-border/50 flex items-center justify-center">
                    <button
                      onClick={loadMoreHistory}
                      disabled={historyLoadingMore}
                      className="text-[12px] text-accent hover:underline disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {historyLoadingMore ? (
                        <>
                          <svg className="size-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                            <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                          </svg>
                          Loading…
                        </>
                      ) : (
                        <>Load {Math.min(50, historyCount - historyEntries.length)} more</>
                      )}
                    </button>
                  </div>
                )}
                {historyLoaded && historyCount !== null && historyEntries.length >= historyCount && historyCount > 50 && (
                  <p className="text-[11px] text-text-muted text-center pt-2 border-t border-border/50">
                    Showing all {historyCount} changes
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Phase 1.2 — Danger Zone (admin only) */}
          {isAdmin && (
            <div className="px-4 py-3">
              <h4 className="text-[11px] font-semibold text-red-400/80 uppercase tracking-wider mb-2">Danger Zone</h4>
              <div className="rounded-lg border border-red-500/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] text-text-primary font-medium">Delete this clinic</p>
                    <p className="text-[12px] text-text-muted mt-0.5">
                      Existing tickets and job sheets keep their snapshot. Cannot be undone.
                    </p>
                  </div>
                  <Button variant="danger" size="sm" onClick={openDeleteModal}>
                    Delete Clinic
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <ModalDialog
        open={deleteModalOpen}
        onClose={() => { if (!deleting) setDeleteModalOpen(false) }}
        title="Delete clinic?"
        size="md"
      >
        <div className="p-4 space-y-3">
          <p className="text-[13px] text-text-primary">
            This will permanently remove{' '}
            <span className="font-semibold">{clinic.clinic_name}</span>{' '}
            <span className="font-mono text-text-tertiary">({clinic.clinic_code})</span>{' '}
            from the CRM.
          </p>
          <p className="text-[12px] text-text-tertiary">
            Existing tickets, schedules, and job sheets will keep their snapshot of this clinic — they will not be affected.
          </p>

          {dependencies === null && (
            <p className="text-[12px] text-text-muted">Checking dependencies…</p>
          )}

          {dependencies && (dependencies.openTickets > 0 || dependencies.activeSchedules > 0 || dependencies.draftJobSheets > 0) && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-300">
              <p className="font-semibold mb-1">⚠ This clinic has active references:</p>
              <ul className="space-y-0.5 text-amber-200/90">
                {dependencies.openTickets > 0 && <li>· {dependencies.openTickets} open ticket{dependencies.openTickets !== 1 ? 's' : ''}</li>}
                {dependencies.activeSchedules > 0 && <li>· {dependencies.activeSchedules} active schedule{dependencies.activeSchedules !== 1 ? 's' : ''}</li>}
                {dependencies.draftJobSheets > 0 && <li>· {dependencies.draftJobSheets} draft job sheet{dependencies.draftJobSheets !== 1 ? 's' : ''}</li>}
              </ul>
              <p className="mt-2 text-amber-200/80">Consider resolving these first.</p>
            </div>
          )}

          <p className="text-[12px] text-red-400 font-medium">This action cannot be undone.</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-surface-inset/30">
          <Button variant="ghost" onClick={() => setDeleteModalOpen(false)} disabled={deleting}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} loading={deleting}>
            Delete permanently
          </Button>
        </div>
      </ModalDialog>

      {/* Record Renewal modal — atomic MTN update */}
      <RenewalModal
        clinic={clinic}
        open={renewalOpen}
        onClose={() => setRenewalOpen(false)}
        onSaved={() => { refetchClinic(); onClinicUpdated?.() }}
      />
    </div>
  )
}
