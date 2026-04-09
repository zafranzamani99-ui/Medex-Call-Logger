'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { JobSheet, JobSheetChecklistItem, JobSheetIssueCategory, JobSheetImportantDetails, BackupStatus, JobOutcome, PaymentMethod } from '@/lib/types'
import { JOB_SHEET_CHECKLIST_LABELS, JOB_SHEET_ISSUE_CATEGORIES, JOB_SHEET_STATUS_COLORS, DEFAULT_IMPORTANT_DETAILS, toProperCase } from '@/lib/constants'
import Button from '@/components/ui/Button'
import { Input, Label, Textarea, Select } from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'

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
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
        active
          ? 'bg-accent/15 text-accent border-accent/30'
          : 'bg-surface border-border text-text-tertiary hover:text-text-secondary hover:border-border'
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

  useEffect(() => {
    fetchJobSheet()
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
    if (!silent) {
      toast(newStatus === 'completed' ? 'Job sheet completed' : 'Saved')
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

  // Toggle issue category
  const toggleIssueCategory = (idx: number) => {
    setIssueCategories(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], checked: !next[idx].checked }
      return next
    })
    scheduleAutoSave()
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-text-tertiary">Loading...</div>
  }

  const sc = JOB_SHEET_STATUS_COLORS[status] || JOB_SHEET_STATUS_COLORS.draft

  return (
    <div className="pb-20 md:pb-6">
      {/* Sticky header bar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3" data-print-hide>
        <div className="flex items-center gap-3">
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
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" loading={saving} onClick={() => handleSave('draft')}>
            Save Draft
          </Button>
          <Button variant="success" size="sm" onClick={() => handleSave('completed')}>
            Complete
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            <svg className="size-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            PDF
          </Button>
        </div>
      </div>

      {/* ===== PRINT LAYOUT v3.0 — pixel-perfect replica of paper SERVICE JOB SHEET ===== */}
      <div className="hidden print:block" data-print-only id="js-print">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page { size: A4 portrait; margin: 10mm 12mm 8mm 12mm; }
            * { box-sizing: border-box; }
            #js-print {
              font-family: Arial, Helvetica, sans-serif;
              font-size: 9.5px;
              color: #000 !important;
              line-height: 1.25;
              width: 100%;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            #js-print table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            #js-print td { border: 0.7px solid #333; padding: 3px 5px; vertical-align: top; color: #000 !important; overflow: hidden; word-wrap: break-word; }
            #js-print .nb { border: none !important; }
            #js-print .bt0 { border-top: none !important; }
            #js-print .bb0 { border-bottom: none !important; }
            #js-print .bl0 { border-left: none !important; }
            #js-print .br0 { border-right: none !important; }
            #js-print .lbl { font-size: 9px; color: #000; white-space: nowrap; }
            #js-print .v { font-weight: bold; font-size: 9.5px; color: #1a3a8a !important; }
            #js-print .shd { background: #e0e3eb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            #js-print .shtl { font-weight: bold; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.3px; padding: 3px 5px; }
            #js-print .ck { width: 11px; height: 11px; border: 0.8px solid #000; display: inline-block; vertical-align: middle; margin-right: 3px; text-align: center; font-size: 9px; line-height: 11px; font-weight: bold; }
            #js-print .ck-on { background: #1a1a1a !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            #js-print .c { text-align: center; }
            #js-print .vm { vertical-align: middle; }
            /* Hide sidebar/nav in print & reset layout */
            [data-print-hide], nav, aside, header, [role="complementary"] { display: none !important; }
            body, body > *, main, main > *, main > * > *, [data-main-content] { margin: 0 !important; padding: 0 !important; max-width: 100% !important; width: 100% !important; }
            #js-print img { max-width: 100%; height: auto; }
          }
        `}} />

        {/* ── Logo — top right ── */}
        <div style={{ textAlign: 'right', marginBottom: 2 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/medexone-logo.png" alt="MedexOne Global" style={{ height: 40, display: 'inline-block' }} />
        </div>
        {/* ── Title — centered ── */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', letterSpacing: '2px' }}>SERVICE JOB SHEET</div>
        </div>

        {/* ── ROW 1: Clinic Stamp + Date/Time/Service/Program ── */}
        <table style={{ marginBottom: 0 }}>
          <colgroup>
            <col style={{ width: '35%' }} />
            <col style={{ width: '25%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>
          <tbody>
            <tr>
              <td rowSpan={5} style={{ verticalAlign: 'top' }}>
                <span className="lbl">Clinic Stamp</span>
                <div style={{ minHeight: 45, paddingTop: 2 }}>
                  <span className="v" style={{ fontSize: '10px' }}>{clinicName}</span><br/>
                  <span style={{ fontSize: '8px', color: '#1a3a8a' }}>{clinicCode}</span>
                </div>
              </td>
              <td className="lbl vm">Date</td>
              <td className="v vm">{serviceDate ? new Date(serviceDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}</td>
              <td className="lbl vm">JS No</td>
              <td className="v vm">{jsNumber}</td>
            </tr>
            <tr>
              <td className="lbl vm">Time Start</td>
              <td className="v vm">{timeStart}</td>
              <td className="lbl vm">Time End</td>
              <td className="v vm">{timeEnd}</td>
            </tr>
            <tr>
              <td className="lbl vm">Service by</td>
              <td colSpan={3} className="v vm">{serviceBy}</td>
            </tr>
            <tr>
              <td className="lbl vm">Medexone Program before update</td>
              <td colSpan={3} className="v vm">{programType}</td>
            </tr>
            <tr>
              <td className="lbl vm">Pro &amp; DB VER before update</td>
              <td colSpan={3} className="v vm">{versionBefore}{dbVersionBefore ? ` / ${dbVersionBefore}` : ''}</td>
            </tr>
          </tbody>
        </table>

        {/* ── ROW 2: Contact Info (left) + Type of Service (right) ── */}
        <table style={{ marginBottom: 0 }}>
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <tbody>
            <tr>
              <td className="lbl vm">Contact Person</td>
              <td className="v vm">{contactPerson}</td>
              <td colSpan={3} className="c vm shtl">Type of Service</td>
            </tr>
            <tr>
              <td className="lbl vm">Tel No</td>
              <td className="v vm">{contactTel}</td>
              <td className="vm"><span className={serviceTypes.includes('ISP1') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('ISP1') ? '\u2713' : ''}</span> ISP1</td>
              <td className="vm" style={{ fontWeight: 'bold' }}>Delivery</td>
              <td className="vm"><span className={serviceTypes.includes('Hardware') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('Hardware') ? '\u2713' : ''}</span> Hardware</td>
            </tr>
            <tr>
              <td className="lbl vm">Doctor Name</td>
              <td className="v vm">{doctorName}</td>
              <td className="vm"><span className={serviceTypes.includes('ISP2') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('ISP2') ? '\u2713' : ''}</span> ISP2</td>
              <td className="vm"></td>
              <td className="vm"><span className={serviceTypes.includes('Label') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('Label') ? '\u2713' : ''}</span> Label</td>
            </tr>
            <tr>
              <td className="lbl vm">Doctor H/P</td>
              <td className="v vm">{doctorPhone}</td>
              <td className="vm"><span className={serviceTypes.includes('ISP3') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('ISP3') ? '\u2713' : ''}</span> ISP3</td>
              <td className="vm"></td>
              <td className="vm"><span className={serviceTypes.includes('Others') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('Others') ? '\u2713' : ''}</span> Others{otherServiceText ? <span className="v"> — {otherServiceText}</span> : ''}</td>
            </tr>
            <tr>
              <td className="lbl vm">Email</td>
              <td className="v vm">{clinicEmail}</td>
              <td className="vm"><span className={serviceTypes.includes('MTN') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('MTN') ? '\u2713' : ''}</span> MTN</td>
              <td className="vm"></td>
              <td className="vm"></td>
            </tr>
            <tr>
              <td className="nb" colSpan={2}></td>
              <td className="vm"><span className={serviceTypes.includes('AD-HOC/KIOSK') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('AD-HOC/KIOSK') ? '\u2713' : ''}</span> AD-HOC</td>
              <td className="vm"></td>
              <td className="vm"></td>
            </tr>
            <tr>
              <td className="nb" colSpan={2}></td>
              <td className="vm"><span className={serviceTypes.includes('AD-HOC/KIOSK') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('AD-HOC/KIOSK') ? '\u2713' : ''}</span> KIOSK</td>
              <td className="vm"></td>
              <td className="vm"></td>
            </tr>
          </tbody>
        </table>

        {/* ── ROW 3: Issue ── */}
        <table style={{ marginBottom: 0 }}>
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <tbody>
            <tr><td colSpan={5} className="shd shtl">Issue</td></tr>
            <tr>
              <td className="lbl">Issue Detail</td>
              <td className="v" style={{ whiteSpace: 'pre-wrap' }}>{issueDetail}</td>
              <td className="c shtl">Issue</td>
              <td colSpan={2} className="c shtl">Other Issues (chargeable)</td>
            </tr>
            <tr>
              <td className="nb" colSpan={2} rowSpan={3}></td>
              <td className="vm"><span className={issueCategories.find(c => c.label.includes('Mdx1'))?.checked ? 'ck ck-on' : 'ck'}>{issueCategories.find(c => c.label.includes('Mdx1'))?.checked ? '\u2713' : ''}</span> Mdx1 Pro</td>
              <td className="vm"><span className={issueCategories.find(c => c.label.includes('Migrate'))?.checked ? 'ck ck-on' : 'ck'}>{issueCategories.find(c => c.label.includes('Migrate'))?.checked ? '\u2713' : ''}</span> Migrate server</td>
              <td className="vm"><span className={issueCategories.find(c => c.label.includes('Other'))?.checked ? 'ck ck-on' : 'ck'}>{issueCategories.find(c => c.label.includes('Other'))?.checked ? '\u2713' : ''}</span> Other{otherIssueText ? <span className="v"> — {otherIssueText}</span> : ''}</td>
            </tr>
            <tr>
              <td className="vm"><span className="ck"></span> Database</td>
              <td className="vm"><span className={issueCategories.find(c => c.label.includes('Network'))?.checked ? 'ck ck-on' : 'ck'}>{issueCategories.find(c => c.label.includes('Network'))?.checked ? '\u2713' : ''}</span> Network</td>
              <td className="nb"></td>
            </tr>
            <tr>
              <td className="vm"><span className="ck"></span> Gprinter / Mycard</td>
              <td className="vm"><span className="ck"></span> Internet</td>
              <td className="nb"></td>
            </tr>
          </tbody>
        </table>

        {/* ── ROW 4: Service Detail ── */}
        <table style={{ marginBottom: 0 }}>
          <colgroup><col style={{ width: '14%' }} /><col style={{ width: '86%' }} /></colgroup>
          <tbody>
            <tr>
              <td className="lbl" style={{ verticalAlign: 'top' }}>Service Detail</td>
              <td className="v" style={{ whiteSpace: 'pre-wrap', height: 40 }}>
                {backupStatus && <>- BACKUP STATUS ({backupStatus.toUpperCase()}) : OK{'\n'}</>}
                {serviceDone}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── ROW 5: Suggestion + Remark ── */}
        <table style={{ marginBottom: 0 }}>
          <colgroup><col style={{ width: '14%' }} /><col style={{ width: '36%' }} /><col style={{ width: '10%' }} /><col style={{ width: '40%' }} /></colgroup>
          <tbody>
            <tr>
              <td className="lbl" style={{ verticalAlign: 'top' }}>Suggestion</td>
              <td className="v" style={{ whiteSpace: 'pre-wrap', height: 30 }}>{suggestion}</td>
              <td className="lbl" style={{ verticalAlign: 'top' }}>Remark</td>
              <td className="v" style={{ whiteSpace: 'pre-wrap', height: 30 }}>{remark}</td>
            </tr>
          </tbody>
        </table>

        {/* ── ROW 6: Checklist (left) + Important Details + Charges (right) ── */}
        <table style={{ marginBottom: 0 }}>
          <colgroup><col style={{ width: '50%' }} /><col style={{ width: '50%' }} /></colgroup>
          <tbody>
            <tr>
              {/* LEFT: Checklist */}
              <td style={{ padding: 0, verticalAlign: 'top' }}>
                <table style={{ marginBottom: 0 }}>
                  <colgroup><col style={{ width: '70%' }} /><col style={{ width: '7%' }} /><col style={{ width: '23%' }} /></colgroup>
                  <tbody>
                    <tr><td colSpan={3} className="shd shtl">CHECKLIST</td></tr>
                    {checklist.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontSize: '8px', padding: '1.5px 4px' }}>{item.label} =</td>
                        <td className="c vm" style={{ padding: '1.5px 2px' }}>
                          <span className={item.checked ? 'ck ck-on' : 'ck'}>{item.checked ? '\u2713' : ''}</span>
                        </td>
                        <td className="v" style={{ fontSize: '8px', padding: '1.5px 4px' }}>{item.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
              {/* RIGHT: Important Details + Charges */}
              <td style={{ padding: 0, verticalAlign: 'top' }}>
                <table style={{ marginBottom: 0 }}>
                  <colgroup><col style={{ width: '55%' }} /><col style={{ width: '45%' }} /></colgroup>
                  <tbody>
                    <tr><td colSpan={2} className="shd shtl" style={{ fontSize: '7.5px' }}>IMPORTANT DETAILS: (MUST FILL IN WHEN ISP/MTN VISIT)</td></tr>
                    <tr><td style={{ fontSize: '8px' }}>Main PC =</td><td className="v" style={{ fontSize: '8px' }}>{importantDetails.main_pc_name}</td></tr>
                    <tr>
                      <td style={{ fontSize: '8px' }}>SPACE AVAILABLE</td>
                      <td style={{ fontSize: '8px' }}><strong>C (SSD/HDD):</strong> <span style={{ color: '#1a3a8a' }}>{importantDetails.space_c}</span></td>
                    </tr>
                    <tr><td className="nb"></td><td style={{ fontSize: '8px' }}><strong>D:</strong> <span style={{ color: '#1a3a8a' }}>{importantDetails.space_d}</span></td></tr>
                    <tr>
                      <td colSpan={2} style={{ fontSize: '8px' }}>
                        <span className={importantDetails.auto_backup_30days ? 'ck ck-on' : 'ck'}>{importantDetails.auto_backup_30days ? '\u2713' : ''}</span> Auto-Backup &ndash; 30days. Image?
                      </td>
                    </tr>
                    <tr><td style={{ fontSize: '8px' }}>Ext. HDD Backup: Y/N</td><td className="v" style={{ fontSize: '8px' }}>{importantDetails.ext_hdd_backup ? 'Y' : 'N'}</td></tr>
                    <tr><td colSpan={2} style={{ fontSize: '8px' }}>Service DB &ndash; backup &amp; restore. Size</td></tr>
                    <tr>
                      <td style={{ fontSize: '8px' }}>Before: <span className="v" style={{ fontSize: '8px' }}>{importantDetails.service_db_size_before}</span></td>
                      <td style={{ fontSize: '8px' }}>After: <span className="v" style={{ fontSize: '8px' }}>{importantDetails.service_db_size_after}</span></td>
                    </tr>
                    <tr>
                      <td style={{ fontSize: '8px' }}>Ultraviewer/Anydesk :</td>
                      <td style={{ fontSize: '8px' }}>PW- <span className="v" style={{ fontSize: '8px' }}>{importantDetails.ultraviewer_pw || importantDetails.anydesk_pw}</span></td>
                    </tr>
                    <tr><td colSpan={2} style={{ fontSize: '8px' }}><span className="ck"></span> RAM: <span className="v" style={{ fontSize: '8px' }}>{importantDetails.ram}</span></td></tr>
                    <tr><td colSpan={2} style={{ fontSize: '8px' }}><span className="ck"></span> PROCESSOR : <span className="v" style={{ fontSize: '8px' }}>{importantDetails.processor}</span></td></tr>
                    <tr>
                      <td style={{ fontSize: '8px' }}><span className={importantDetails.need_server ? 'ck ck-on' : 'ck'}>{importantDetails.need_server ? '\u2713' : ''}</span> Need SERVER?</td>
                      <td style={{ fontSize: '8px' }}><span className={importantDetails.brief_doctor ? 'ck ck-on' : 'ck'}>{importantDetails.brief_doctor ? '\u2713' : ''}</span> Brief Doctor?</td>
                    </tr>
                    {/* CHARGES — inside right column */}
                    <tr>
                      <td className="shd shtl vm">CHARGES:</td>
                      <td className="v vm">{chargeAmount ? `RM ${chargeAmount}` : 'RM'}</td>
                    </tr>
                    <tr>
                      <td colSpan={2} style={{ fontSize: '8px', lineHeight: 1.5 }}>
                        <span className={paymentMethod === 'COD' || paymentMethod === 'Cheque' || paymentMethod === 'Online Transfer' ? 'ck ck-on' : 'ck'}>{paymentMethod === 'COD' || paymentMethod === 'Cheque' || paymentMethod === 'Online Transfer' ? '\u2713' : ''}</span> COD, collect CHEQUE / ONLINE TRANSFER<br/>
                        <span className={paymentMethod === 'Credit Card' ? 'ck ck-on' : 'ck'}>{paymentMethod === 'Credit Card' ? '\u2713' : ''}</span> Credit Card Machine Payment<br/>
                        <span className={needReceipt ? 'ck ck-on' : 'ck'}>{needReceipt ? '\u2713' : ''}</span> Need Official Receipt (By accounts)<br/>
                        <span className={needInvoice ? 'ck ck-on' : 'ck'}>{needInvoice ? '\u2713' : ''}</span> Need Invoice
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── ROW 7: Sign-off ── */}
        <table style={{ marginBottom: 0 }}>
          <colgroup><col style={{ width: '50%' }} /><col style={{ width: '50%' }} /></colgroup>
          <tbody>
            <tr>
              <td className="vm" style={{ padding: '6px 8px' }}>
                <span className={jobOutcome === 'completed' ? 'ck ck-on' : 'ck'}>{jobOutcome === 'completed' ? '\u2713' : ''}</span> JOB COMPLETED
                &nbsp;&nbsp;&nbsp;
                <span className={jobOutcome === 'to_be_continued' ? 'ck ck-on' : 'ck'}>{jobOutcome === 'to_be_continued' ? '\u2713' : ''}</span> TO BE CONTINUED
              </td>
              <td className="vm" style={{ fontSize: '8.5px', padding: '6px 8px' }}>
                <span className={jobOutcome === 'completed' ? 'ck ck-on' : 'ck'}>{jobOutcome === 'completed' ? '\u2713' : ''}</span> THE WORK DETAILED ABOVE HAD BEEN CARRIED OUT TO MY SATISFACTION
              </td>
            </tr>
            <tr>
              <td style={{ height: 100, verticalAlign: 'bottom', textAlign: 'center', padding: '6px 8px 8px' }}>
                <div style={{ fontStyle: 'italic', fontWeight: 'bold', fontSize: '13px', color: '#1a3a8a', marginBottom: 5 }}>{serviceBy}</div>
                <div style={{ borderTop: '1.5px solid #000', display: 'inline-block', minWidth: 180, paddingTop: 3, fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>SERVICE PERFORMED BY</div>
              </td>
              <td style={{ height: 100, verticalAlign: 'bottom', textAlign: 'center', padding: '6px 8px 8px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1a3a8a', marginBottom: 5 }}>{customerRepName}</div>
                <div style={{ borderTop: '1.5px solid #000', display: 'inline-block', minWidth: 180, paddingTop: 3, fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>CUSTOMER&apos;S REPRESENTATIVE</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── FOOTER ── */}
        <div style={{ marginTop: 18, textAlign: 'left' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/footer.jpg" alt="MedexOne Global Footer" style={{ maxWidth: '70%', width: '70%', height: 'auto' }} />
        </div>
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
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {['ISP1', 'ISP2', 'ISP3', 'MTN', 'AD-HOC/KIOSK'].map(type => (
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
            <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 items-center text-xs text-text-tertiary font-medium pb-1 border-b border-border">
              <span className="w-5"></span>
              <span>Item</span>
              <span>Notes</span>
            </div>
            {checklist.map((item, idx) => (
              <div key={item.label} className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 items-center py-1.5 border-b border-border/50">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => updateChecklistItem(idx, 'checked', e.target.checked)}
                  className="rounded border-border text-accent focus:ring-accent/30 bg-surface-inset"
                />
                <span className={`text-sm ${item.checked ? 'text-text-primary' : 'text-text-tertiary'}`}>{item.label}</span>
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
              <Label>C Drive (SSD/HDD)</Label>
              <Input type="text" value={importantDetails.space_c} onChange={(e) => updateDetail('space_c', e.target.value)} placeholder="Space available" />
            </div>
            <div>
              <Label>D Drive</Label>
              <Input type="text" value={importantDetails.space_d} onChange={(e) => updateDetail('space_d', e.target.value)} placeholder="Space available" />
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
      </div>
    </div>
  )
}
