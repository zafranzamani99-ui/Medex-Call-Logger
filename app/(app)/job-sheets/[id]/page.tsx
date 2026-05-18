'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import type { JobSheet, JobSheetChecklistItem, JobSheetIssueCategory, JobSheetImportantDetails, BackupStatus, JobOutcome, PaymentMethod } from '@/lib/types'
import { JOB_SHEET_CHECKLIST_LABELS, JOB_SHEET_ISSUE_CATEGORIES, JOB_SHEET_STATUS_COLORS, DEFAULT_IMPORTANT_DETAILS, toProperCase } from '@/lib/constants'
import Button from '@/components/ui/Button'
import { Input, Label, Textarea, Select } from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import ClinicProfilePanel from '@/components/ClinicProfilePanel'
import JobSheetPrintLayout from '@/components/JobSheetPrintLayout'

// Section wrapper
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5" data-js-section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-4" data-js-section-title>{title}</h3>
      {children}
    </div>
  )
}

// Pill button for selecting options
function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-transparent border-border text-text-primary hover:border-blue-400'
      }`}
    >
      {label}
    </button>
  )
}

export default function JobSheetDetailPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [showCrmPanel, setShowCrmPanel] = useState(false)
  const [sourceSchedule, setSourceSchedule] = useState<{ id: string; source_ticket_id: string | null; schedule_type: string; schedule_date: string } | null>(null)
  const [sourceTicketRef, setSourceTicketRef] = useState<{ id: string; ticket_ref: string } | null>(null)
  const [savingToCrm, setSavingToCrm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoSaved, setAutoSaved] = useState(false)
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Form state — single consolidated object
  const [jsNumber, setJsNumber] = useState('')
  const [status, setStatus] = useState<'draft' | 'completed'>('draft')
  const [serviceDate, setServiceDate] = useState('')
  const [timeStart, setTimeStart] = useState('')
  const [timeEnd, setTimeEnd] = useState('')
  const [serviceBy, setServiceBy] = useState('')

  const [clinicCode, setClinicCode] = useState('')
  const [clinicName, setClinicName] = useState('')
  const [lkeyLines, setLkeyLines] = useState<string[]>([])
  const [contactPerson, setContactPerson] = useState('')
  const [contactTel, setContactTel] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [doctorPhone, setDoctorPhone] = useState('')
  const [clinicEmail, setClinicEmail] = useState('')

  const [programType, setProgramType] = useState('')
  const [versionBefore, setVersionBefore] = useState('')
  const [dbVersionBefore, setDbVersionBefore] = useState('')

  const [serviceTypes, setServiceTypes] = useState<string[]>([])
  const [otherServiceText, setOtherServiceText] = useState('')
  const [issueDetail, setIssueDetail] = useState('')
  const [issueCategories, setIssueCategories] = useState<JobSheetIssueCategory[]>([])
  const [otherIssueText, setOtherIssueText] = useState('')
  const [backupStatus, setBackupStatus] = useState<BackupStatus | ''>('')
  const [serviceDone, setServiceDone] = useState('')

  const [suggestion, setSuggestion] = useState('')
  const [remark, setRemark] = useState('')

  const [checklist, setChecklist] = useState<JobSheetChecklistItem[]>([])
  const [importantDetails, setImportantDetails] = useState<JobSheetImportantDetails>(DEFAULT_IMPORTANT_DETAILS)

  const [chargeAmount, setChargeAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [needReceipt, setNeedReceipt] = useState(false)
  const [needInvoice, setNeedInvoice] = useState(false)

  const [jobOutcome, setJobOutcome] = useState<JobOutcome>('completed')
  const [customerRepName, setCustomerRepName] = useState('')

  // Email template (persisted in Supabase profiles.email_settings)
  const JS_HEADER_DEFAULT = 'Dear Dr/PIC,\n\nKindly print out the attachment for job sheet done for {{SERVICE_TYPE}} {{YEAR}}.\nPlease sign and chop the job sheet form and email back the form.'
  const [jsEmailHeader, setJsEmailHeader] = useState(JS_HEADER_DEFAULT)
  const [jsEmailFooter, setJsEmailFooter] = useState('')
  const jsHeaderRef = useRef(JS_HEADER_DEFAULT)
  const jsFooterRef = useRef('')
  const jsEmailSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleEmailSettingsSave = useCallback(() => {
    if (jsEmailSaveRef.current) clearTimeout(jsEmailSaveRef.current)
    jsEmailSaveRef.current = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) return
      const { data } = await supabase.from('profiles').select('email_settings').eq('id', session.user.id).single()
      const existing = (data?.email_settings || {}) as Record<string, string>
      await supabase.from('profiles').update({
        email_settings: { ...existing, js_header: jsHeaderRef.current, js_footer: jsFooterRef.current }
      }).eq('id', session.user.id)
    }, 1500)
  }, [supabase])

  useEffect(() => {
    fetchJobSheet()
    // Load email settings from Supabase
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) return
      const { data } = await supabase.from('profiles').select('email_settings').eq('id', session.user.id).single()
      const s = (data?.email_settings || {}) as Record<string, string>
      if (s.js_header !== undefined) { setJsEmailHeader(s.js_header); jsHeaderRef.current = s.js_header }
      // Footer falls back to LK footer (shared signature)
      const footer = s.js_footer || s.lk_footer || localStorage.getItem('lk_email_footer') || ''
      setJsEmailFooter(footer); jsFooterRef.current = footer
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const fetchJobSheet = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('job_sheets').select('*').eq('id', id).single()

    if (error || !data) {
      toast('Job sheet not found', 'error')
      router.push('/job-sheets')
      return
    }

    const js = data as JobSheet
    setJsNumber(js.js_number)
    setStatus(js.status)
    setServiceDate(js.service_date)
    setTimeStart(js.time_start || '')
    setTimeEnd(js.time_end || '')
    setServiceBy(toProperCase(js.service_by))
    setClinicCode(js.clinic_code)
    setClinicName(js.clinic_name)
    setContactPerson(js.contact_person || '')
    setContactTel(js.contact_tel || '')
    setDoctorName(js.doctor_name || '')
    setDoctorPhone(js.doctor_phone || '')
    setClinicEmail(js.clinic_email || '')
    setProgramType(js.program_type || '')
    setVersionBefore(js.version_before || '')
    setDbVersionBefore(js.db_version_before || '')
    setServiceTypes((js.service_types || []).filter((t: string) => t !== 'Delivery'))
    setOtherServiceText(js.other_service_text || '')
    setIssueDetail(js.issue_detail || '')
    setBackupStatus((js.backup_status as BackupStatus) || '')
    setServiceDone(js.service_done || '')
    setSuggestion(js.suggestion || '')
    setRemark(js.remark || '')
    setChargeAmount(js.charge_amount != null ? String(js.charge_amount) : '')
    setPaymentMethod((js.payment_method as PaymentMethod) || '')
    setNeedReceipt(js.need_receipt)
    setNeedInvoice(js.need_invoice)
    setJobOutcome(js.job_outcome)
    setCustomerRepName(js.customer_rep_name || '')

    // Checklist — initialize from constants if empty
    const cl = Array.isArray(js.checklist) && js.checklist.length > 0
      ? js.checklist
      : JOB_SHEET_CHECKLIST_LABELS.map(label => ({ label, checked: false, notes: '' }))
    setChecklist(cl)

    // Issue categories
    const ic = Array.isArray(js.issue_categories) && js.issue_categories.length > 0
      ? js.issue_categories
      : JOB_SHEET_ISSUE_CATEGORIES.map(label => ({ label, checked: false }))
    setIssueCategories(ic)
    setOtherIssueText(js.other_issue_text || '')

    // Important details
    setImportantDetails(js.important_details && typeof js.important_details === 'object' && 'main_pc_name' in js.important_details
      ? js.important_details
      : DEFAULT_IMPORTANT_DETAILS)

    // Fetch LKEY lines for clinic stamp
    if (js.clinic_code) {
      const { data: clinic } = await supabase
        .from('clinics')
        .select('lkey_line1, lkey_line2, lkey_line3, lkey_line4')
        .eq('clinic_code', js.clinic_code)
        .single()
      if (clinic) {
        setLkeyLines([clinic.lkey_line1, clinic.lkey_line2, clinic.lkey_line3, clinic.lkey_line4].filter(Boolean) as string[])
      }
    }

    // Fetch source schedule & ticket (if this JS came from a schedule)
    if (js.schedule_id) {
      const { data: sched } = await supabase
        .from('schedules')
        .select('id, source_ticket_id, schedule_type, schedule_date')
        .eq('id', js.schedule_id)
        .maybeSingle()
      setSourceSchedule(sched)
      if (sched?.source_ticket_id) {
        const { data: tkt } = await supabase
          .from('tickets')
          .select('id, ticket_ref')
          .eq('id', sched.source_ticket_id)
          .maybeSingle()
        setSourceTicketRef(tkt)
      } else {
        setSourceTicketRef(null)
      }
    } else {
      setSourceSchedule(null)
      setSourceTicketRef(null)
    }

    setLoading(false)
  }

  const buildPayload = (newStatus?: 'draft' | 'completed') => ({
    status: newStatus || status,
    service_date: serviceDate,
    time_start: timeStart || null,
    time_end: timeEnd || null,
    contact_person: contactPerson || null,
    contact_tel: contactTel || null,
    doctor_name: doctorName || null,
    doctor_phone: doctorPhone || null,
    clinic_email: clinicEmail || null,
    program_type: programType || null,
    version_before: versionBefore || null,
    db_version_before: dbVersionBefore || null,
    service_types: serviceTypes,
    other_service_text: otherServiceText || null,
    issue_detail: issueDetail || null,
    issue_categories: issueCategories,
    other_issue_text: otherIssueText || null,
    backup_status: backupStatus || null,
    service_done: serviceDone || null,
    suggestion: suggestion || null,
    remark: remark || null,
    checklist,
    important_details: importantDetails,
    charge_amount: chargeAmount ? parseFloat(chargeAmount) : null,
    payment_method: paymentMethod || null,
    need_receipt: needReceipt,
    need_invoice: needInvoice,
    job_outcome: jobOutcome,
    customer_rep_name: customerRepName || null,
    updated_at: new Date().toISOString(),
  })

  const handleSave = async (newStatus?: 'draft' | 'completed', silent = false) => {
    if (!silent) setSaving(true)
    const { error } = await supabase.from('job_sheets').update(buildPayload(newStatus)).eq('id', id)
    if (!silent) setSaving(false)

    if (error) {
      if (!silent) toast('Failed to save: ' + error.message, 'error')
      return
    }

    if (newStatus) setStatus(newStatus)
    if (newStatus === 'completed' && clinicCode) {
      await saveToCrm(true)
    }
    if (!silent) {
      toast(newStatus === 'completed' ? 'Job sheet completed — system info saved to CRM' : 'Saved')
      if (newStatus === 'draft' || newStatus === 'completed') router.push('/job-sheets')
    } else {
      setAutoSaved(true)
      setTimeout(() => setAutoSaved(false), 2000)
    }
  }

  // Auto-save debounce
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(() => {
      handleSave(undefined, true)
    }, 3000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceDate, timeStart, timeEnd, contactPerson, contactTel, doctorName, doctorPhone, clinicEmail, programType, versionBefore, dbVersionBefore, serviceTypes, otherServiceText, issueDetail, issueCategories, otherIssueText, backupStatus, serviceDone, suggestion, remark, checklist, importantDetails, chargeAmount, paymentMethod, needReceipt, needInvoice, jobOutcome, customerRepName])

  // Toggle service type
  const toggleServiceType = (type: string) => {
    setServiceTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
    scheduleAutoSave()
  }

  // Update checklist item
  const updateChecklistItem = (idx: number, field: 'checked' | 'notes', value: boolean | string) => {
    setChecklist(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
    scheduleAutoSave()
  }

  // Update important details
  const updateDetail = (field: keyof JobSheetImportantDetails, value: string | boolean) => {
    setImportantDetails(prev => ({ ...prev, [field]: value }))
    scheduleAutoSave()
  }

  // Save operational data back to CRM. silent=true skips toast (used by auto-sync on complete).
  const saveToCrm = async (silent = false) => {
    if (!clinicCode) return
    if (!silent) setSavingToCrm(true)
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id || null
    const { data: profile } = uid ? await supabase.from('profiles').select('display_name').eq('id', uid).single() : { data: null }

    // Only sync non-empty fields — don't overwrite CRM with blanks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {
      last_updated_by: uid,
      last_updated_by_name: profile?.display_name || serviceBy,
      updated_at: new Date().toISOString(),
    }
    if (importantDetails.main_pc_name) updates.main_pc_name = importantDetails.main_pc_name
    if (importantDetails.ultraviewer_id) updates.ultraviewer_id = importantDetails.ultraviewer_id
    if (importantDetails.ultraviewer_pw) updates.ultraviewer_pw = importantDetails.ultraviewer_pw
    if (importantDetails.anydesk_id) updates.anydesk_id = importantDetails.anydesk_id
    if (importantDetails.anydesk_pw) updates.anydesk_pw = importantDetails.anydesk_pw
    if (importantDetails.ram) updates.ram = importantDetails.ram
    if (importantDetails.processor) updates.processor = importantDetails.processor
    if (importantDetails.service_db_size_after) updates.db_size = importantDetails.service_db_size_after
    updates.has_backup = importantDetails.auto_backup_30days
    updates.has_ext_hdd = importantDetails.ext_hdd_backup

    // Extract from checklist notes
    const wsNote = checklist.find(c => c.label === 'Total Workstation')?.notes
    if (wsNote) updates.workstation_count = wsNote
    const progNote = checklist.find(c => c.label === 'Install/Update Program Version No')?.notes
    if (progNote) updates.current_program_version = progNote
    const dbNote = checklist.find(c => c.label === 'Database Version (after update)')?.notes
    if (dbNote) updates.current_db_version = dbNote

    const { error } = await supabase.from('clinics').update(updates).eq('clinic_code', clinicCode)
    if (!silent) setSavingToCrm(false)
    if (error) {
      if (!silent) toast('Failed to save to CRM: ' + error.message, 'error')
    } else {
      if (!silent) toast('System info saved to CRM')
    }
  }

  // Toggle issue category
  const toggleIssueCategory = (idx: number) => {
    setIssueCategories(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], checked: !next[idx].checked }
      return next
    })
    scheduleAutoSave()
  }

  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Delete this job sheet? This cannot be undone.')) return
    setDeleting(true)
    const { error } = await supabase.from('job_sheets').delete().eq('id', id)
    setDeleting(false)
    if (error) {
      toast('Failed to delete: ' + error.message, 'error')
    } else {
      toast('Job sheet deleted')
      router.push('/job-sheets')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-text-tertiary">Loading...</div>
  }

  const sc = JOB_SHEET_STATUS_COLORS[status] || JOB_SHEET_STATUS_COLORS.draft

  return (
    <div className="pb-20 md:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6" data-print-hide>
        <button onClick={() => router.push('/job-sheets')} className="text-text-tertiary hover:text-text-primary transition-colors">
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-text-primary font-mono">{jsNumber}</h1>
            <Badge bg={sc.bg} text={sc.text}>{status}</Badge>
            {autoSaved && <span className="text-[11px] text-green-400 animate-fadeIn">Saved</span>}
          </div>
          <p className="text-[12px] text-text-tertiary">{clinicName}</p>
        </div>
      </div>

      {/* Source links — Schedule & Ticket this job sheet came from */}
      {(sourceSchedule || sourceTicketRef) && (
        <div className="flex items-center gap-2 mb-4 flex-wrap print:hidden" data-print-hide>
          <span className="text-[11px] text-text-muted">From:</span>
          {sourceTicketRef && (
            <button
              onClick={() => router.push(`/tickets/${sourceTicketRef.id}`)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 transition-colors"
            >
              <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {sourceTicketRef.ticket_ref}
            </button>
          )}
          {sourceSchedule && (
            <button
              onClick={() => router.push('/schedule')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 transition-colors"
            >
              <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              {sourceSchedule.schedule_type} ({format(new Date(sourceSchedule.schedule_date + 'T00:00:00'), 'dd MMM')})
            </button>
          )}
        </div>
      )}

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-4 left-1/2 md:left-[calc(var(--sidebar-width)+50%)] md:-translate-x-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-surface/80 backdrop-blur-md border border-border rounded-full px-4 py-2 shadow-lg transition-[left] duration-200 print:hidden" data-print-hide>
        <Button variant="secondary" size="sm" loading={saving} onClick={() => handleSave('draft')}>
          Save Draft
        </Button>
        <Button variant="success" size="sm" onClick={() => handleSave('completed')}>
          Complete
        </Button>
        <Button variant="ghost" size="sm" onClick={() => {
          const prev = document.title
          document.title = `${clinicName} (${clinicCode})`
          window.print()
          document.title = prev
        }}>
          <svg className="size-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          PDF
        </Button>
        {status === 'completed' && (
          <Button variant="ghost" size="sm" onClick={() => window.open(`/print/job-sheet/${id}`, 'js-email', 'width=850,height=1100,scrollbars=yes')}>
            <svg className="size-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Email
          </Button>
        )}
        <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>
          <svg className="size-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </Button>
      </div>

      {/* ===== PRINT LAYOUT — uses shared component ===== */}
      <div className="hidden print:block" data-print-only id="js-print">
        <JobSheetPrintLayout
          jsNumber={jsNumber}
          serviceDate={serviceDate}
          timeStart={timeStart}
          timeEnd={timeEnd}
          serviceBy={serviceBy}
          clinicCode={clinicCode}
          clinicName={clinicName}
          lkeyLines={lkeyLines}
          contactPerson={contactPerson}
          contactTel={contactTel}
          doctorName={doctorName}
          doctorPhone={doctorPhone}
          clinicEmail={clinicEmail}
          programType={programType}
          versionBefore={versionBefore}
          dbVersionBefore={dbVersionBefore}
          serviceTypes={serviceTypes}
          otherServiceText={otherServiceText}
          issueDetail={issueDetail}
          issueCategories={issueCategories}
          otherIssueText={otherIssueText}
          backupStatus={backupStatus}
          serviceDone={serviceDone}
          suggestion={suggestion}
          remark={remark}
          checklist={checklist}
          importantDetails={importantDetails}
          chargeAmount={chargeAmount}
          paymentMethod={paymentMethod}
          needReceipt={needReceipt}
          needInvoice={needInvoice}
          jobOutcome={jobOutcome}
          customerRepName={customerRepName}
          printMediaWrap={true}
        />
      </div>

      {/* ===== INTERACTIVE FORM — visible on screen, hidden when printing ===== */}
      <div className="space-y-4 print:hidden">
        {/* 1. Header */}
        <Section title="Header">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label>JS Number</Label>
              <Input type="text" value={jsNumber} disabled />
            </div>
            <div>
              <Label required>Date</Label>
              <Input type="date" value={serviceDate} onChange={(e) => { setServiceDate(e.target.value); scheduleAutoSave() }} />
            </div>
            <div>
              <Label>Time Start</Label>
              <Input type="text" value={timeStart} onChange={(e) => { setTimeStart(e.target.value); scheduleAutoSave() }} placeholder="e.g. 10:00 AM" />
            </div>
            <div>
              <Label>Time End</Label>
              <Input type="text" value={timeEnd} onChange={(e) => { setTimeEnd(e.target.value); scheduleAutoSave() }} placeholder="e.g. 5:00 PM" />
            </div>
          </div>
          <div className="mt-3">
            <Label>Service By</Label>
            <Input type="text" value={serviceBy} disabled />
          </div>
        </Section>

        {/* 2. Clinic Information */}
        <Section title="Clinic Information">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Clinic</Label>
              <Input type="text" value={`${clinicName} (${clinicCode})`} disabled />
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input type="text" value={contactPerson} onChange={(e) => { setContactPerson(e.target.value); scheduleAutoSave() }} placeholder="PIC name" />
            </div>
            <div>
              <Label>Tel No</Label>
              <Input type="text" value={contactTel} onChange={(e) => { setContactTel(e.target.value); scheduleAutoSave() }} placeholder="Phone" />
            </div>
            <div>
              <Label>Doctor Name</Label>
              <Input type="text" value={doctorName} onChange={(e) => { setDoctorName(e.target.value); scheduleAutoSave() }} placeholder="Doctor name" />
            </div>
            <div>
              <Label>Doctor H/P</Label>
              <Input type="text" value={doctorPhone} onChange={(e) => { setDoctorPhone(e.target.value); scheduleAutoSave() }} placeholder="Doctor phone" />
            </div>
            <div className="col-span-2">
              <Label>Email</Label>
              <Input type="text" value={clinicEmail} onChange={(e) => { setClinicEmail(e.target.value); scheduleAutoSave() }} placeholder="Email" />
            </div>
          </div>
        </Section>

        {/* 3. Program Information */}
        <Section title="Program Information">
          <div className="mb-3">
            <Label>Medexone Program</Label>
            <Input type="text" value={programType} onChange={(e) => { setProgramType(e.target.value); scheduleAutoSave() }} placeholder="e.g. GP, MHIS, DENTAL, GP+IP" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Pro & DB Ver Before Update</Label>
              <Input type="text" value={versionBefore} onChange={(e) => { setVersionBefore(e.target.value); scheduleAutoSave() }} placeholder="e.g. 177" />
            </div>
            <div>
              <Label>DB Version Before</Label>
              <Input type="text" value={dbVersionBefore} onChange={(e) => { setDbVersionBefore(e.target.value); scheduleAutoSave() }} placeholder="e.g. 415" />
            </div>
          </div>
        </Section>

        {/* 4. Type of Service */}
        <Section title="Type of Service">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {['ISP1', 'ISP2', 'ISP3', 'MTN', 'AD-HOC', 'KIOSK'].map(type => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={serviceTypes.includes(type)}
                  onChange={() => toggleServiceType(type)}
                  className="rounded border-border text-accent focus:ring-accent/30 bg-surface-inset"
                />
                <span className="text-sm text-text-secondary">{type}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <Label>Delivery</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {['Hardware', 'Label', 'Others'].map(type => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={serviceTypes.includes(type)}
                    onChange={() => toggleServiceType(type)}
                    className="rounded border-border text-accent focus:ring-accent/30 bg-surface-inset"
                  />
                  <span className="text-sm text-text-secondary">{type}</span>
                </label>
              ))}
            </div>
            {serviceTypes.includes('Others') && (
              <input
                type="text"
                value={otherServiceText}
                onChange={e => setOtherServiceText(e.target.value)}
                placeholder="Specify what to deliver (e.g. Printer)"
                className="mt-2 w-full rounded border border-border bg-surface-inset px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
            )}
          </div>
        </Section>

        {/* 5. Issue Detail */}
        <Section title="Issue">
          <div className="space-y-3">
            <div>
              <Label>Issue Detail</Label>
              <Textarea value={issueDetail} onChange={(e) => { setIssueDetail(e.target.value); scheduleAutoSave() }} rows={3} placeholder="Describe the issue..." />
            </div>
            <div>
              <Label>Issue Categories</Label>
              <div className="space-y-2 mt-1">
                {issueCategories.map((cat, idx) => (
                  <label key={cat.label} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cat.checked}
                      onChange={() => toggleIssueCategory(idx)}
                      className="rounded border-border text-accent focus:ring-accent/30 bg-surface-inset"
                    />
                    <span className="text-sm text-text-secondary">{cat.label}</span>
                  </label>
                ))}
              </div>
              {issueCategories.find(c => c.label.includes('Other'))?.checked && (
                <input
                  type="text"
                  value={otherIssueText}
                  onChange={e => setOtherIssueText(e.target.value)}
                  placeholder="Specify other issue (e.g. Printer)"
                  className="mt-2 w-full rounded border border-border bg-surface-inset px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
              )}
            </div>
          </div>
        </Section>

        {/* 6. Service Detail */}
        <Section title="Service Detail">
          <div className="space-y-3">
            <div>
              <Label>Backup Status</Label>
              <div className="flex gap-2 mt-1">
                {(['Yes', 'No', 'N/A'] as BackupStatus[]).map(opt => (
                  <Pill key={opt} label={opt} active={backupStatus === opt} onClick={() => { setBackupStatus(backupStatus === opt ? '' : opt); scheduleAutoSave() }} />
                ))}
              </div>
            </div>
            <div>
              <Label>Service Done</Label>
              <Textarea value={serviceDone} onChange={(e) => { setServiceDone(e.target.value); scheduleAutoSave() }} rows={4} placeholder="Describe what was done..." />
            </div>
          </div>
        </Section>

        {/* 7. Additional */}
        <Section title="Suggestion & Remark">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Suggestion</Label>
              <Textarea value={suggestion} onChange={(e) => { setSuggestion(e.target.value); scheduleAutoSave() }} rows={3} placeholder="Suggestions..." />
            </div>
            <div>
              <Label>Remark</Label>
              <Textarea value={remark} onChange={(e) => { setRemark(e.target.value); scheduleAutoSave() }} rows={3} placeholder="Remarks..." />
            </div>
          </div>
        </Section>

        {/* 8. Checklist */}
        <Section title="Checklist">
          <div className="space-y-1">
            <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 items-center text-xs text-text-secondary font-medium pb-1 border-b border-border">
              <span className="w-5"></span>
              <span>Item</span>
              <span>Notes</span>
            </div>
            {checklist.map((item, idx) => (
              <div key={item.label} className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 items-center py-1.5 border-b border-zinc-500/10">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => updateChecklistItem(idx, 'checked', e.target.checked)}
                  className="rounded border-border text-accent focus:ring-accent/30 bg-surface-inset"
                />
                <span className={`text-sm ${item.checked ? 'text-text-primary' : 'text-text-secondary'}`}>{item.label}</span>
                <Input
                  type="text"
                  value={item.notes}
                  onChange={(e) => updateChecklistItem(idx, 'notes', e.target.value)}
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        </Section>

        {/* 9. Important Details */}
        <Section title="Important Details (ISP/MTN Visit)">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Main PC Name</Label>
              <Input type="text" value={importantDetails.main_pc_name} onChange={(e) => updateDetail('main_pc_name', e.target.value)} placeholder="e.g. KPKSERVERNEW" />
            </div>
            <div>
              <Label>RAM</Label>
              <Input type="text" value={importantDetails.ram} onChange={(e) => updateDetail('ram', e.target.value)} placeholder="e.g. 16GB" />
            </div>
            <div>
              <Label>C Drive</Label>
              <div className="flex gap-2">
                <Select value={importantDetails.space_c_type || ''} onChange={(e) => updateDetail('space_c_type', e.target.value)} className="!w-24 flex-shrink-0">
                  <option value="">Type</option>
                  <option value="SSD">SSD</option>
                  <option value="HDD">HDD</option>
                </Select>
                <Input type="text" value={importantDetails.space_c} onChange={(e) => updateDetail('space_c', e.target.value)} placeholder="e.g. 326 GB" className="flex-1" />
              </div>
            </div>
            <div>
              <Label>D Drive</Label>
              <Input type="text" value={importantDetails.space_d} onChange={(e) => updateDetail('space_d', e.target.value)} placeholder="e.g. 500 GB" />
            </div>
            <div>
              <Label>Processor</Label>
              <Input type="text" value={importantDetails.processor} onChange={(e) => updateDetail('processor', e.target.value)} placeholder="e.g. Intel i7-9000" />
            </div>
            <div>
              <Label>Service DB Size Before</Label>
              <Input type="text" value={importantDetails.service_db_size_before} onChange={(e) => updateDetail('service_db_size_before', e.target.value)} placeholder="Size" />
            </div>
            <div>
              <Label>Service DB Size After</Label>
              <Input type="text" value={importantDetails.service_db_size_after} onChange={(e) => updateDetail('service_db_size_after', e.target.value)} placeholder="Size" />
            </div>
            <div className="col-span-2 grid grid-cols-4 gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={importantDetails.auto_backup_30days} onChange={(e) => updateDetail('auto_backup_30days', e.target.checked)} className="rounded border-border text-accent focus:ring-accent/30 bg-surface-inset" />
                <span className="text-sm text-text-secondary">Auto-Backup 30days</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={importantDetails.ext_hdd_backup} onChange={(e) => updateDetail('ext_hdd_backup', e.target.checked)} className="rounded border-border text-accent focus:ring-accent/30 bg-surface-inset" />
                <span className="text-sm text-text-secondary">Ext. HDD Backup</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={importantDetails.need_server} onChange={(e) => updateDetail('need_server', e.target.checked)} className="rounded border-border text-accent focus:ring-accent/30 bg-surface-inset" />
                <span className="text-sm text-text-secondary">Need Server?</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={importantDetails.brief_doctor} onChange={(e) => updateDetail('brief_doctor', e.target.checked)} className="rounded border-border text-accent focus:ring-accent/30 bg-surface-inset" />
                <span className="text-sm text-text-secondary">Brief Doctor?</span>
              </label>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Remote Access</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ultraviewer ID</Label>
                <Input type="text" value={importantDetails.ultraviewer_id} onChange={(e) => updateDetail('ultraviewer_id', e.target.value)} placeholder="ID" />
              </div>
              <div>
                <Label>Ultraviewer PW</Label>
                <Input type="text" value={importantDetails.ultraviewer_pw} onChange={(e) => updateDetail('ultraviewer_pw', e.target.value)} placeholder="Password" />
              </div>
              <div>
                <Label>Anydesk ID</Label>
                <Input type="text" value={importantDetails.anydesk_id} onChange={(e) => updateDetail('anydesk_id', e.target.value)} placeholder="ID" />
              </div>
              <div>
                <Label>Anydesk PW</Label>
                <Input type="text" value={importantDetails.anydesk_pw} onChange={(e) => updateDetail('anydesk_pw', e.target.value)} placeholder="Password" />
              </div>
            </div>
          </div>

          {/* Save to CRM + View CRM */}
          <div className="mt-4 pt-4 border-t border-border flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCrmPanel(true)}
              disabled={!clinicCode}
              className="border border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/10"
            >
              <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
              View CRM
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => saveToCrm()}
              loading={savingToCrm}
              disabled={!clinicCode || savingToCrm}
              className="border border-green-500/30 text-green-400 hover:bg-green-600/10"
            >
              <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Save to CRM
            </Button>
          </div>
        </Section>

        {/* 10. Charges */}
        <Section title="Charges">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label>Amount (RM)</Label>
              <Input type="number" value={chargeAmount} onChange={(e) => { setChargeAmount(e.target.value); scheduleAutoSave() }} placeholder="0.00" />
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value as PaymentMethod | ''); scheduleAutoSave() }}>
                <option value="">-- Select --</option>
                <option value="COD">COD</option>
                <option value="Cheque">Cheque</option>
                <option value="Online Transfer">Online Transfer</option>
                <option value="Credit Card">Credit Card</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer self-end pb-2">
              <input type="checkbox" checked={needReceipt} onChange={(e) => { setNeedReceipt(e.target.checked); scheduleAutoSave() }} className="rounded border-border text-accent focus:ring-accent/30 bg-surface-inset" />
              <span className="text-sm text-text-secondary">Need Receipt</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer self-end pb-2">
              <input type="checkbox" checked={needInvoice} onChange={(e) => { setNeedInvoice(e.target.checked); scheduleAutoSave() }} className="rounded border-border text-accent focus:ring-accent/30 bg-surface-inset" />
              <span className="text-sm text-text-secondary">Need Invoice</span>
            </label>
          </div>
        </Section>

        {/* 11. Sign-off */}
        <Section title="Sign-off">
          <div className="space-y-3">
            <div>
              <Label>Job Outcome</Label>
              <div className="flex gap-2 mt-1">
                <Pill label="Completed" active={jobOutcome === 'completed'} onClick={() => { setJobOutcome('completed'); scheduleAutoSave() }} />
                <Pill label="To Be Continued" active={jobOutcome === 'to_be_continued'} onClick={() => { setJobOutcome('to_be_continued'); scheduleAutoSave() }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Service Performed By</Label>
                <Input type="text" value={serviceBy} disabled />
                <div className="print-signature mt-2 hidden print:block"></div>
              </div>
              <div>
                <Label>Customer Representative</Label>
                <Input type="text" value={customerRepName} onChange={(e) => { setCustomerRepName(e.target.value); scheduleAutoSave() }} placeholder="Customer name" />
                <div className="print-signature mt-2 hidden print:block"></div>
              </div>
            </div>
          </div>
        </Section>

        {/* Email Template — editable, persisted to Supabase (print:hidden) */}
        <div className="print:hidden" data-print-hide>
          <Section title="Email Template (saved for next time)">
            <div className="space-y-3">
              <div>
                <Label>Header / Body</Label>
                <p className="text-[10px] text-text-muted mb-1">Use {'{{SERVICE_TYPE}}'} and {'{{YEAR}}'} as placeholders</p>
                <Textarea
                  value={jsEmailHeader}
                  onChange={(e) => { setJsEmailHeader(e.target.value); jsHeaderRef.current = e.target.value; scheduleEmailSettingsSave() }}
                  rows={4}
                  placeholder="Dear Dr/PIC,&#10;&#10;Kindly print out the attachment..."
                />
              </div>
              <div>
                <Label>Footer / Signature</Label>
                <Textarea
                  value={jsEmailFooter}
                  onChange={(e) => { setJsEmailFooter(e.target.value); jsFooterRef.current = e.target.value; scheduleEmailSettingsSave() }}
                  rows={5}
                  placeholder={"Thanks & Regards,\n\nYOUR NAME\nIT Professional Services Consultant\n..."}
                />
              </div>
            </div>
          </Section>
        </div>
      </div>

      {/* CRM Profile Panel */}
      {showCrmPanel && clinicCode && (
        <ClinicProfilePanel
          clinicCode={clinicCode}
          onClose={() => setShowCrmPanel(false)}
        />
      )}
    </div>
  )
}
