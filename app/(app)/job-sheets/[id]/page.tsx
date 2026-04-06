'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { JobSheet, JobSheetChecklistItem, JobSheetIssueCategory, JobSheetImportantDetails, BackupStatus, JobOutcome, PaymentMethod } from '@/lib/types'
import { JOB_SHEET_SERVICE_TYPES, JOB_SHEET_CHECKLIST_LABELS, JOB_SHEET_ISSUE_CATEGORIES, JOB_SHEET_STATUS_COLORS, DEFAULT_IMPORTANT_DETAILS } from '@/lib/constants'
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
  const [issueDetail, setIssueDetail] = useState('')
  const [issueCategories, setIssueCategories] = useState<JobSheetIssueCategory[]>([])
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
    setServiceBy(js.service_by)
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
    setServiceTypes(js.service_types || [])
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
    issue_detail: issueDetail || null,
    issue_categories: issueCategories,
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
  }, [serviceDate, timeStart, timeEnd, contactPerson, contactTel, doctorName, doctorPhone, clinicEmail, programType, versionBefore, dbVersionBefore, serviceTypes, issueDetail, issueCategories, backupStatus, serviceDone, suggestion, remark, checklist, importantDetails, chargeAmount, paymentMethod, needReceipt, needInvoice, jobOutcome, customerRepName])

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

      {/* ===== PRINT LAYOUT — hidden on screen, shown when printing ===== */}
      <div className="hidden print:block" data-print-only id="print-layout">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            #print-layout { font-family: Arial, sans-serif; font-size: 10px; color: #000 !important; }
            #print-layout table { width: 100%; border-collapse: collapse; }
            #print-layout td, #print-layout th { border: 1px solid #000; padding: 3px 5px; vertical-align: top; color: #000 !important; }
            #print-layout .no-border td, #print-layout .no-border th { border: none; }
            #print-layout .section-title { background: #e8eaf0; font-weight: bold; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 6px; }
            #print-layout .label { font-weight: normal; color: #333; white-space: nowrap; width: 1%; }
            #print-layout .val { font-weight: bold; }
            #print-layout .cb { width: 12px; height: 12px; border: 1px solid #000; display: inline-block; vertical-align: middle; margin-right: 4px; text-align: center; font-size: 10px; line-height: 12px; }
            #print-layout .cb-checked { background: #000; color: #fff; }
            #print-layout .sig-line { border-bottom: 1px solid #000; min-width: 180px; height: 50px; display: inline-block; }
            #print-layout h1 { font-size: 18px; font-weight: bold; text-align: center; margin: 0; }
            #print-layout .company-sub { font-size: 8px; color: #555; text-align: center; margin-top: 2px; }
          }
        `}} />

        {/* Title */}
        <table style={{ border: 'none', marginBottom: '8px' }}>
          <tbody className="no-border">
            <tr>
              <td style={{ border: 'none', textAlign: 'center', paddingBottom: '6px' }}>
                <h1>SERVICE JOB SHEET</h1>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Top section: Clinic Stamp + Header info */}
        <table style={{ marginBottom: '0' }}>
          <tbody>
            <tr>
              <td rowSpan={6} style={{ width: '40%', verticalAlign: 'top' }}>
                <span className="label">Clinic Stamp</span>
                <div style={{ minHeight: '80px', paddingTop: '4px' }}>
                  <span className="val">{clinicName}</span><br/>
                  <span style={{ fontSize: '9px' }}>{clinicCode}</span>
                </div>
              </td>
              <td className="label">Date</td>
              <td className="val">{serviceDate ? new Date(serviceDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}</td>
              <td className="label">JS No</td>
              <td className="val">{jsNumber}</td>
            </tr>
            <tr>
              <td className="label">Time Start</td>
              <td className="val">{timeStart}</td>
              <td className="label">Time End</td>
              <td className="val">{timeEnd}</td>
            </tr>
            <tr>
              <td className="label">Service by</td>
              <td colSpan={3} className="val">{serviceBy}</td>
            </tr>
            <tr>
              <td className="label">Medex1Program before update</td>
              <td colSpan={3} className="val">{programType}</td>
            </tr>
            <tr>
              <td className="label">Pro & DB VER before update</td>
              <td colSpan={3} className="val">{versionBefore}{dbVersionBefore ? ` / ${dbVersionBefore}` : ''}</td>
            </tr>
          </tbody>
        </table>

        {/* Contact Info + Type of Service */}
        <table style={{ marginBottom: '0' }}>
          <tbody>
            <tr>
              <td className="label" style={{ width: '15%' }}>Contact Person</td>
              <td className="val" style={{ width: '35%' }}>{contactPerson}</td>
              <td colSpan={4} rowSpan={1} style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '9px' }}>Type of Service</td>
            </tr>
            <tr>
              <td className="label">Tel No</td>
              <td className="val">{contactTel}</td>
              {/* Service types as checkbox grid */}
              <td style={{ textAlign: 'center' }}>
                <span className={serviceTypes.includes('ISP1') ? 'cb cb-checked' : 'cb'}>{serviceTypes.includes('ISP1') ? '\u2713' : ''}</span> ISP1
              </td>
              <td style={{ textAlign: 'center' }} colSpan={2}>
                <span className={serviceTypes.includes('Delivery') ? 'cb cb-checked' : 'cb'}>{serviceTypes.includes('Delivery') ? '\u2713' : ''}</span> Delivery
              </td>
            </tr>
            <tr>
              <td className="label">Doctor Name</td>
              <td className="val">{doctorName}</td>
              <td style={{ textAlign: 'center' }}>
                <span className={serviceTypes.includes('ISP2') ? 'cb cb-checked' : 'cb'}>{serviceTypes.includes('ISP2') ? '\u2713' : ''}</span> ISP2
              </td>
              <td style={{ textAlign: 'center' }}>
                <span className={serviceTypes.includes('Hardware') ? 'cb cb-checked' : 'cb'}>{serviceTypes.includes('Hardware') ? '\u2713' : ''}</span> Hardware
              </td>
            </tr>
            <tr>
              <td className="label">Doctor H/P #</td>
              <td className="val">{doctorPhone}</td>
              <td style={{ textAlign: 'center' }}>
                <span className={serviceTypes.includes('ISP3') ? 'cb cb-checked' : 'cb'}>{serviceTypes.includes('ISP3') ? '\u2713' : ''}</span> ISP3
              </td>
              <td style={{ textAlign: 'center' }}>
                <span className={serviceTypes.includes('Label') ? 'cb cb-checked' : 'cb'}>{serviceTypes.includes('Label') ? '\u2713' : ''}</span> Label
              </td>
            </tr>
            <tr>
              <td className="label">Email</td>
              <td className="val">{clinicEmail}</td>
              <td style={{ textAlign: 'center' }}>
                <span className={serviceTypes.includes('MTN') ? 'cb cb-checked' : 'cb'}>{serviceTypes.includes('MTN') ? '\u2713' : ''}</span> MTN
              </td>
              <td style={{ textAlign: 'center' }}>
                <span className={serviceTypes.includes('Others') ? 'cb cb-checked' : 'cb'}>{serviceTypes.includes('Others') ? '\u2713' : ''}</span> Others
              </td>
            </tr>
            <tr>
              <td colSpan={2} style={{ border: 'none' }}></td>
              <td style={{ textAlign: 'center' }}>
                <span className={serviceTypes.includes('AD-HOC/KIOSK') ? 'cb cb-checked' : 'cb'}>{serviceTypes.includes('AD-HOC/KIOSK') ? '\u2713' : ''}</span> AD-HOC/KIOSK
              </td>
              <td style={{ border: 'none' }}></td>
            </tr>
          </tbody>
        </table>

        {/* Issue section */}
        <table style={{ marginBottom: '0' }}>
          <tbody>
            <tr>
              <td colSpan={5} className="section-title">Issue</td>
            </tr>
            <tr>
              <td className="label" style={{ width: '12%' }}>Issue Detail</td>
              <td className="val" style={{ width: '38%', minHeight: '40px', whiteSpace: 'pre-wrap' }}>{issueDetail}</td>
              <td style={{ width: '15%', fontSize: '9px', fontWeight: 'bold', textAlign: 'center' }}>Issue</td>
              <td colSpan={2} style={{ fontSize: '9px', fontWeight: 'bold', textAlign: 'center' }}>Other Issues (chargeable)</td>
            </tr>
            <tr>
              <td colSpan={2} rowSpan={4} style={{ border: 'none' }}></td>
              <td>
                <span className={issueCategories.find(c => c.label.includes('Mdx1'))?.checked ? 'cb cb-checked' : 'cb'}>{issueCategories.find(c => c.label.includes('Mdx1'))?.checked ? '\u2713' : ''}</span> Mdx1 Pro / Database / Gprinter / Mycard
              </td>
              <td colSpan={2}>
                <span className={issueCategories.find(c => c.label.includes('Migrate'))?.checked ? 'cb cb-checked' : 'cb'}>{issueCategories.find(c => c.label.includes('Migrate'))?.checked ? '\u2713' : ''}</span> Migrate server
              </td>
            </tr>
            <tr>
              <td></td>
              <td colSpan={2}>
                <span className={issueCategories.find(c => c.label.includes('Network'))?.checked ? 'cb cb-checked' : 'cb'}>{issueCategories.find(c => c.label.includes('Network'))?.checked ? '\u2713' : ''}</span> Network / Internet
              </td>
            </tr>
            <tr>
              <td></td>
              <td colSpan={2}>
                <span className={issueCategories.find(c => c.label.includes('chargeable'))?.checked ? 'cb cb-checked' : 'cb'}>{issueCategories.find(c => c.label.includes('chargeable'))?.checked ? '\u2713' : ''}</span> Other chargeable
              </td>
            </tr>
          </tbody>
        </table>

        {/* Service Detail */}
        <table style={{ marginBottom: '0' }}>
          <tbody>
            <tr>
              <td className="label" style={{ width: '15%' }}>Service Detail</td>
              <td className="val" style={{ minHeight: '50px', whiteSpace: 'pre-wrap' }}>
                {backupStatus && <>- BACKUP STATUS ({backupStatus.toUpperCase()}) : OK<br/></>}
                {serviceDone}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Suggestion / Remark */}
        <table style={{ marginBottom: '0' }}>
          <tbody>
            <tr>
              <td className="label" style={{ width: '15%' }}>Suggestion</td>
              <td style={{ width: '35%', whiteSpace: 'pre-wrap' }} className="val">{suggestion}</td>
              <td className="label" style={{ width: '10%' }}>Remark</td>
              <td style={{ whiteSpace: 'pre-wrap' }} className="val">{remark}</td>
            </tr>
          </tbody>
        </table>

        {/* Checklist + Important Details — side by side */}
        <table style={{ marginBottom: '0' }}>
          <tbody>
            <tr>
              {/* LEFT: Checklist */}
              <td style={{ width: '50%', verticalAlign: 'top', padding: 0 }}>
                <table style={{ width: '100%', marginBottom: 0 }}>
                  <tbody>
                    <tr><td colSpan={3} className="section-title">CHECKLIST</td></tr>
                    {checklist.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ width: '70%' }}>
                          {item.label} =
                        </td>
                        <td style={{ textAlign: 'center', width: '10%' }}>
                          <span className={item.checked ? 'cb cb-checked' : 'cb'}>{item.checked ? '\u2713' : ''}</span>
                        </td>
                        <td className="val">{item.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
              {/* RIGHT: Important Details */}
              <td style={{ width: '50%', verticalAlign: 'top', padding: 0 }}>
                <table style={{ width: '100%', marginBottom: 0 }}>
                  <tbody>
                    <tr><td colSpan={2} className="section-title">IMPORTANT DETAILS: (MUST FILL IN WHEN ISP/MTN VISIT)</td></tr>
                    <tr><td className="label">Main PC =</td><td className="val">{importantDetails.main_pc_name}</td></tr>
                    <tr>
                      <td className="label">SPACE AVAILABLE</td>
                      <td>
                        <strong>C (SSD/HDD):</strong> {importantDetails.space_c}&nbsp;&nbsp;&nbsp;
                        <strong>D:</strong> {importantDetails.space_d}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2}>
                        <span className={importantDetails.auto_backup_30days ? 'cb cb-checked' : 'cb'}>{importantDetails.auto_backup_30days ? '\u2713' : ''}</span> Auto-Backup - 30days. Image?
                      </td>
                    </tr>
                    <tr><td className="label">Ext. HDD Backup: Y/N</td><td className="val">{importantDetails.ext_hdd_backup ? 'Y' : 'N'}</td></tr>
                    <tr>
                      <td colSpan={2}>
                        Service DB - backup & restore. Size&nbsp;&nbsp;
                        <strong>Before:</strong> {importantDetails.service_db_size_before}&nbsp;&nbsp;
                        <strong>After:</strong> {importantDetails.service_db_size_after}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2}>
                        Ultraviewer/Anydesk:&nbsp;&nbsp;
                        <strong>ID:</strong> {importantDetails.ultraviewer_id || importantDetails.anydesk_id}&nbsp;&nbsp;
                        <strong>PW:</strong> {importantDetails.ultraviewer_pw || importantDetails.anydesk_pw}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2}>
                        <span className="cb"></span> RAM: <strong>{importantDetails.ram}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2}>
                        <span className="cb"></span> PROCESSOR: <strong>{importantDetails.processor}</strong>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <span className={importantDetails.need_server ? 'cb cb-checked' : 'cb'}>{importantDetails.need_server ? '\u2713' : ''}</span> Need SERVER?
                      </td>
                      <td>
                        <span className={importantDetails.brief_doctor ? 'cb cb-checked' : 'cb'}>{importantDetails.brief_doctor ? '\u2713' : ''}</span> Brief Doctor?
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Charges */}
        <table style={{ marginBottom: '0' }}>
          <tbody>
            <tr>
              <td className="section-title" style={{ width: '12%' }}>CHARGES:</td>
              <td className="val" style={{ width: '15%' }}>{chargeAmount ? `RM ${chargeAmount}` : ''}</td>
              <td colSpan={2}>
                <span className={paymentMethod === 'COD' ? 'cb cb-checked' : 'cb'}>{paymentMethod === 'COD' ? '\u2713' : ''}</span> COD, collect CHEQUE / ONLINE TRANSFER<br/>
                <span className={paymentMethod === 'Credit Card' ? 'cb cb-checked' : 'cb'}>{paymentMethod === 'Credit Card' ? '\u2713' : ''}</span> Credit Card Machine Payment<br/>
                <span className={needReceipt ? 'cb cb-checked' : 'cb'}>{needReceipt ? '\u2713' : ''}</span> Need Official Receipt (by accounts)<br/>
                <span className={needInvoice ? 'cb cb-checked' : 'cb'}>{needInvoice ? '\u2713' : ''}</span> Need Invoice
              </td>
            </tr>
          </tbody>
        </table>

        {/* Sign-off */}
        <table style={{ marginBottom: '4px' }}>
          <tbody>
            <tr>
              <td style={{ width: '50%' }}>
                <span className={jobOutcome === 'completed' ? 'cb cb-checked' : 'cb'}>{jobOutcome === 'completed' ? '\u2713' : ''}</span> JOB COMPLETED
                &nbsp;&nbsp;&nbsp;
                <span className={jobOutcome === 'to_be_continued' ? 'cb cb-checked' : 'cb'}>{jobOutcome === 'to_be_continued' ? '\u2713' : ''}</span> TO BE CONTINUED
              </td>
              <td style={{ width: '50%', fontSize: '9px' }}>
                <span className={jobOutcome === 'completed' ? 'cb cb-checked' : 'cb'}>{jobOutcome === 'completed' ? '\u2713' : ''}</span> THE WORK DETAILED ABOVE HAD BEEN CARRIED OUT TO MY SATISFACTION
              </td>
            </tr>
            <tr>
              <td style={{ height: '60px', verticalAlign: 'bottom', textAlign: 'center' }}>
                <div style={{ borderTop: '1px solid #000', display: 'inline-block', minWidth: '200px', paddingTop: '4px' }}>
                  <strong style={{ fontStyle: 'italic' }}>{serviceBy}</strong><br/>
                  <span style={{ fontSize: '8px' }}>SERVICE PERFORMED BY</span>
                </div>
              </td>
              <td style={{ height: '60px', verticalAlign: 'bottom', textAlign: 'center' }}>
                <div style={{ borderTop: '1px solid #000', display: 'inline-block', minWidth: '200px', paddingTop: '4px' }}>
                  <strong>{customerRepName}</strong><br/>
                  <span style={{ fontSize: '8px' }}>CUSTOMER&apos;S REPRESENTATIVE</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: '7px', color: '#666', marginTop: '8px', borderTop: '1px solid #ccc', paddingTop: '4px' }}>
          <strong>MEDEXONE GLOBAL SDN. BHD.</strong> (Company No:201301042612 (1064130-X))<br/>
          Unit, Block G, Level 6, Pusat Dagangan Phileo Damansara 1, No. 9 Jalan 16/11, 46350 Petaling Jaya, Selangor, Malaysia.
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
              <Label>Doctor H/P #</Label>
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
            <Label>Medex1 Program</Label>
            <div className="flex gap-2 mt-1">
              <Pill label="GP" active={programType === 'GP'} onClick={() => { setProgramType(programType === 'GP' ? '' : 'GP'); scheduleAutoSave() }} />
              <Pill label="Specialist" active={programType === 'Specialist'} onClick={() => { setProgramType(programType === 'Specialist' ? '' : 'Specialist'); scheduleAutoSave() }} />
            </div>
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
            {JOB_SHEET_SERVICE_TYPES.map(type => (
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
