'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toProperCase } from '@/lib/constants'
import { JOB_SHEET_CHECKLIST_LABELS, JOB_SHEET_ISSUE_CATEGORIES, DEFAULT_IMPORTANT_DETAILS } from '@/lib/constants'
import JobSheetPrintLayout from '@/components/JobSheetPrintLayout'
import type { JobSheet, JobSheetImportantDetails } from '@/lib/types'

// Popup print page for job sheet email flow.
// Opens in a small window, renders the print layout, triggers Save-as-PDF,
// then opens mailto and closes itself.

export default function PrintJobSheetPage() {
  const supabase = createClient()
  const params = useParams()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const printTriggered = useRef(false)

  // Job sheet data
  const [jsNumber, setJsNumber] = useState('')
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
  const [issueCategories, setIssueCategories] = useState<{ label: string; checked: boolean }[]>([])
  const [otherIssueText, setOtherIssueText] = useState('')
  const [backupStatus, setBackupStatus] = useState('')
  const [serviceDone, setServiceDone] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [remark, setRemark] = useState('')
  const [checklist, setChecklist] = useState<{ label: string; checked: boolean; notes: string }[]>([])
  const [importantDetails, setImportantDetails] = useState<JobSheetImportantDetails>(DEFAULT_IMPORTANT_DETAILS)
  const [chargeAmount, setChargeAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [needReceipt, setNeedReceipt] = useState(false)
  const [needInvoice, setNeedInvoice] = useState(false)
  const [jobOutcome, setJobOutcome] = useState('')
  const [customerRepName, setCustomerRepName] = useState('')

  // Email settings
  const [emailHeader, setEmailHeader] = useState('')
  const [emailFooter, setEmailFooter] = useState('')

  useEffect(() => {
    async function load() {
      // Fetch job sheet
      const { data: jsData, error: jsErr } = await supabase
        .from('job_sheets').select('*').eq('id', id).single()

      if (jsErr || !jsData) {
        setError('Job sheet not found')
        setLoading(false)
        return
      }

      const js = jsData as JobSheet
      setJsNumber(js.js_number)
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
      setBackupStatus(js.backup_status || '')
      setServiceDone(js.service_done || '')
      setSuggestion(js.suggestion || '')
      setRemark(js.remark || '')
      setChargeAmount(js.charge_amount != null ? String(js.charge_amount) : '')
      setPaymentMethod(js.payment_method || '')
      setNeedReceipt(js.need_receipt)
      setNeedInvoice(js.need_invoice)
      setJobOutcome(js.job_outcome)
      setCustomerRepName(js.customer_rep_name || '')

      // Checklist
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
      setImportantDetails(
        js.important_details && typeof js.important_details === 'object' && 'main_pc_name' in js.important_details
          ? js.important_details
          : DEFAULT_IMPORTANT_DETAILS
      )

      // Fetch LKEY lines
      if (js.clinic_code) {
        const { data: clinic } = await supabase
          .from('clinics')
          .select('lkey_line1, lkey_line2, lkey_line3, lkey_line4, lkey_line5')
          .eq('clinic_code', js.clinic_code)
          .single()
        if (clinic) {
          setLkeyLines(
            [clinic.lkey_line1, clinic.lkey_line2, clinic.lkey_line3, clinic.lkey_line4, clinic.lkey_line5]
              .filter(Boolean) as string[]
          )
        }
      }

      // Fetch email settings from profile
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        const { data: profile } = await supabase
          .from('profiles').select('email_settings').eq('id', session.user.id).single()
        const s = (profile?.email_settings || {}) as Record<string, string>
        const defaultHeader = 'Dear Dr/PIC,\n\nKindly print out the attachment for job sheet done for {{SERVICE_TYPE}} {{YEAR}}.\nPlease sign and chop the job sheet form and email back the form.'
        setEmailHeader(s.js_header ?? defaultHeader)
        setEmailFooter(s.js_footer || s.lk_footer || '')
      }

      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Auto-trigger print after render
  useEffect(() => {
    if (loading || error || printTriggered.current) return
    printTriggered.current = true

    // Set document title for PDF filename
    const svcType = serviceTypes.length > 0 ? serviceTypes.join('/') : 'MTN'
    document.title = `JOBSHEET ${svcType.toUpperCase()} - ${clinicName} (${clinicCode})`

    const timer = setTimeout(() => {
      window.print()
    }, 600)

    const handleAfterPrint = () => {
      // Open mailto
      const year = new Date().getFullYear()
      const to = clinicEmail || ''
      const cc = 'allsupport@medexoneglobal.com; celine.gan@medexoneglobal.com'
      const subject = `JOBSHEET ${svcType.toUpperCase()} for ${clinicName} (${clinicCode})`
      const header = emailHeader
        .replace('{{SERVICE_TYPE}}', svcType.toUpperCase())
        .replace('{{YEAR}}', String(year))
      const body = `${header}\n\n${emailFooter}`
      const a = document.createElement('a')
      a.href = `mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      a.click()

      // Close popup after a short delay
      setTimeout(() => window.close(), 500)
    }

    window.addEventListener('afterprint', handleAfterPrint)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [loading, error, serviceTypes, clinicName, clinicCode, clinicEmail, emailHeader, emailFooter])

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial, sans-serif', color: '#666' }}>
        <p>{error}</p>
        <button onClick={() => window.close()} style={{ marginTop: 16, padding: '6px 16px', background: '#eee', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}>
          Close
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial, sans-serif', color: '#999' }}>
        Loading job sheet...
      </div>
    )
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: A4 portrait; margin: 0; }
        body { margin: 0; padding: 0; background: #fff; }
        * { box-sizing: border-box; }
        @media print {
          .no-print { display: none !important; }
        }
      `}} />

      <button
        className="no-print"
        onClick={() => window.close()}
        style={{ position: 'fixed', top: 8, right: 8, padding: '4px 12px', background: '#eee', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontSize: 12, zIndex: 100 }}
      >
        Close
      </button>

      <div id="js-print">
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
          printMediaWrap={false}
        />
      </div>
    </>
  )
}
