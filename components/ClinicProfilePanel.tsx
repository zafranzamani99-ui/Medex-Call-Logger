'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  clinic_notes: 'Notes',
  lkey_line1: 'LK Address 1', lkey_line2: 'LK Address 2', lkey_line3: 'LK Address 3',
  lkey_line4: 'LK Address 4', lkey_line5: 'LK Address 5',
}

// System fields excluded from the diff — these change on every save and would drown out the real edits.
const SYSTEM_FIELDS = new Set([
  'updated_at', 'last_updated_by', 'last_updated_by_name', 'id', 'clinic_code', 'custom_data',
])

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
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [revealed, setRevealed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

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
        <svg className="size-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity ml-auto flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
        </svg>
      </div>
    </div>
  )
}

// License Key row — displays key + value with inline edit and copy
function LicenseKeyRow({ entry, onUpdate, onDelete, onCopy }: {
  entry: LicenseKeyEntry
  onUpdate: (patch: Partial<Pick<LicenseKeyEntry, 'field_key' | 'field_value'>>) => void
  onDelete: () => void
  onCopy: (value: string) => void
}) {
  const [editingKey, setEditingKey] = useState(false)
  const [editingValue, setEditingValue] = useState(false)
  const [keyDraft, setKeyDraft] = useState(entry.field_key)
  const [valueDraft, setValueDraft] = useState(entry.field_value || '')

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
      <div className="flex-1 min-w-0">
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
            className={`w-full text-left text-[12px] font-mono truncate px-1.5 py-0.5 rounded hover:bg-surface-inset transition-colors cursor-pointer ${entry.field_value ? 'text-text-primary' : 'text-text-muted italic'}`}
            title="Click to edit"
          >
            {entry.field_value || '—'}
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover/lk:opacity-100 transition-opacity">
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
function ToggleFlag({ label, value, onToggle }: { label: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group rounded px-1 -mx-1 py-1 hover:bg-surface-raised transition-colors">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onToggle(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${value ? 'bg-accent' : 'bg-zinc-600'}`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
      </button>
      <span className="text-[12px] text-text-secondary">{label}</span>
    </label>
  )
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

  // Save a single field
  const saveField = useCallback(async (field: string, value: string | boolean) => {
    if (!clinic) return
    const { error } = await supabase
      .from('clinics')
      .update({
        [field]: value === '' ? null : value,
        last_updated_by: userId,
        last_updated_by_name: userName,
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_code', clinicCode)

    if (error) {
      toast('Failed to save', 'error')
    } else {
      setClinic(prev => prev ? { ...prev, [field]: value === '' ? null : value, last_updated_by: userId, last_updated_by_name: userName } : null)
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

  const toggleHistory = () => {
    const next = !historyOpen
    setHistoryOpen(next)
    if (next && !historyLoaded) loadHistory()
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
    const { data, error } = await supabase
      .from('license_key_data')
      .insert({
        clinic_id: clinic.id,
        clinic_code: clinic.clinic_code,
        field_key: key,
        field_value: value || null,
        display_order: lkEntries.length,
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

  const updateLicenseKey = async (id: string, patch: Partial<Pick<LicenseKeyEntry, 'field_key' | 'field_value'>>) => {
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
          </div>

          {/* Section: Renewal & Status */}
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Renewal & Status</h4>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1">
              <EditableField label="Status Renewal" value={clinic.status_renewal} onSave={v => saveField('status_renewal', v)} />
              <EditableField label="E-INV No Reason" value={clinic.einv_no_reason} onSave={v => saveField('einv_no_reason', v)} />
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
              <EditableField label="Workstation Count" value={clinic.workstation_count} onSave={v => saveField('workstation_count', v)} />
              <EditableField label="Server Name" value={clinic.main_pc_name} onSave={v => saveField('main_pc_name', v)} mono />
              <EditableField label="Device ID" value={clinic.device_id} onSave={v => saveField('device_id', v)} mono />
              <EditableField label="Program Version" value={clinic.current_program_version} onSave={v => saveField('current_program_version', v)} mono />
              <EditableField label="DB Version" value={clinic.current_db_version} onSave={v => saveField('current_db_version', v)} mono />
              <EditableField label="DB Size" value={clinic.db_size} onSave={v => saveField('db_size', v)} mono />
              <EditableField label="RAM" value={clinic.ram} onSave={v => saveField('ram', v)} />
              <EditableField label="Processor" value={clinic.processor} onSave={v => saveField('processor', v)} />
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

            {/* WhatsApp Details */}
            <div className="mt-3">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">WhatsApp Details</span>
              <div className="grid grid-cols-2 gap-x-4 mt-1">
                <EditableField label="WS Account No" value={clinic.wa_account_no} onSave={v => saveField('wa_account_no', v)} mono />
                <EditableField label="WS API Key" value={clinic.wa_api_key} onSave={v => saveField('wa_api_key', v)} mono />
              </div>
            </div>

            {/* SST Details */}
            <div className="mt-3">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">SST Details</span>
              <div className="grid grid-cols-2 gap-x-4 mt-1">
                <EditableField label="Registration No" value={clinic.sst_registration_no} onSave={v => saveField('sst_registration_no', v)} mono />
                <EditableField label="Start Date" value={clinic.sst_start_date} onSave={v => saveField('sst_start_date', v)} />
                <EditableField label="Submission" value={clinic.sst_submission} onSave={v => saveField('sst_submission', v)} />
                <EditableField label="Frequency" value={clinic.sst_frequency} onSave={v => saveField('sst_frequency', v)} />
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
                  const changes = diffAuditEntry(entry)
                  const isInsert = entry.action === 'INSERT'
                  const isDelete = entry.action === 'DELETE'
                  const dotColor = isInsert ? 'bg-emerald-400/70' : isDelete ? 'bg-red-400/70' : 'bg-blue-400/70'
                  const actionLabel = isInsert ? 'Created' : isDelete ? 'Deleted' : null
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
                        {!actionLabel && changes.length === 0 && (
                          <p className="text-text-muted italic mt-0.5">No visible changes</p>
                        )}
                      </div>
                    </div>
                  )
                })}
                {historyCount !== null && historyCount > 50 && historyLoaded && (
                  <p className="text-[11px] text-text-muted text-center pt-2 border-t border-border/50">
                    Showing most recent 50 of {historyCount} changes
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
    </div>
  )
}
