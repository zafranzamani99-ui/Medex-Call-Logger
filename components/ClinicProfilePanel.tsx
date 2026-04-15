'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Clinic } from '@/lib/types'
import { useToast } from '@/components/ui/Toast'
import { RENEWAL_COLORS, toProperCase } from '@/lib/constants'

// WHY: Shared CRM panel — the clinic's "profile card."
// Opens from any page via clinicCode prop. Inline-editable fields.
// Section A: Identity (CRM-imported), Section B: System Info (operational),
// Section C: Notes & audit trail.

interface ClinicProfilePanelProps {
  clinicCode: string
  onClose: () => void
  onClinicUpdated?: () => void
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

export default function ClinicProfilePanel({ clinicCode, onClose, onClinicUpdated }: ClinicProfilePanelProps) {
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
          <div className="px-4 py-3">
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
        </div>
      </div>
    </div>
  )
}
