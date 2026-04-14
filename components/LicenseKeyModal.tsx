'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import type { Clinic } from '@/lib/types'

// WHY: License Key Request Form generator — produces rich HTML table matching the Excel form exactly.
// Copies as HTML so it pastes into Outlook with full formatting (borders, colors, headers).

interface LicenseKeyModalProps {
  clinic: Clinic
  agentName: string
  onClose: () => void
}

const ACTION_PRESETS = [
  'ADD WS', 'ADD SST', 'ADD E-INV', 'NEW WS API + E-INV + SST LIVE',
  'NEW CLIENT', 'REM MTN', 'REM CHANGE ADDRESS', 'RENEWAL', 'Others',
]

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

function formatSubjectDate(): string {
  const now = new Date()
  return `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return format(d, 'd/M/yyyy')
  } catch {
    return dateStr
  }
}

export default function LicenseKeyModal({ clinic, agentName, onClose }: LicenseKeyModalProps) {
  const supabase = createClient()
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<'form' | 'preview'>('form')

  // === License Key Information ===
  const [programType, setProgramType] = useState(clinic.product_type || '')
  const [mtnStart, setMtnStart] = useState(formatDate(clinic.mtn_start))
  const [mtnEnd, setMtnEnd] = useState(formatDate(clinic.mtn_expiry))
  const [clinicName, setClinicName] = useState(clinic.lkey_line1 || clinic.clinic_name || '')
  const [clientCode, setClientCode] = useState(clinic.clinic_code || '')
  const [address1, setAddress1] = useState(clinic.lkey_line2 || '')
  const [address2, setAddress2] = useState(
    clinic.lkey_line3 || [clinic.city, clinic.state].filter(Boolean).join(', ').toUpperCase()
  )
  const [address3, setAddress3] = useState(clinic.lkey_line4 || '')
  const [tel, setTel] = useState(clinic.lkey_line5 || clinic.clinic_phone || '')
  const [registrationNo, setRegistrationNo] = useState('')
  const [startDate, setStartDate] = useState('')
  const [submission, setSubmission] = useState('')
  const [frequency, setFrequency] = useState('')

  // === Additional Customer Information ===
  const [hqClinicName, setHqClinicName] = useState('')
  const [hqClientCode, setHqClientCode] = useState('')
  const [isNewClient, setIsNewClient] = useState('')
  const [branchDocId, setBranchDocId] = useState('')

  // === Contact Information ===
  const [picName, setPicName] = useState(clinic.registered_contact || '')
  const [picPhone, setPicPhone] = useState('')
  const [picEmail, setPicEmail] = useState(clinic.email_main || '')
  const [ownerName, setOwnerName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [billingPicName, setBillingPicName] = useState('')
  const [billingPicPhone, setBillingPicPhone] = useState('')
  const [billingPicEmail, setBillingPicEmail] = useState('')

  // === System Environment ===
  const [environment, setEnvironment] = useState('LIVE')
  const [internalUse, setInternalUse] = useState('No')
  const [serverName, setServerName] = useState(clinic.main_pc_name || 'SERVER')
  const [deviceId, setDeviceId] = useState('')

  // === Activations ===
  const [eInvoice, setEInvoice] = useState('No')
  const [eInvoicePort, setEInvoicePort] = useState('')
  const [waActive, setWaActive] = useState('No')
  const [waAccountNo, setWaAccountNo] = useState('')
  const [waApiKey, setWaApiKey] = useState('')
  const [emailActive, setEmailActive] = useState('No')
  const [emailType, setEmailType] = useState('')
  const [emailAddress, setEmailAddress] = useState('')
  const [emailPassword, setEmailPassword] = useState('')

  // === Subject Line ===
  const [selectedActions, setSelectedActions] = useState<string[]>([])
  const [customAction, setCustomAction] = useState('')
  const [subjectEdited, setSubjectEdited] = useState(false)
  const [subjectOverride, setSubjectOverride] = useState('')
  const [subjectCopied, setSubjectCopied] = useState(false)

  const generatedSubject = useMemo(() => {
    const actions = selectedActions.filter(a => a !== 'Others')
    if (selectedActions.includes('Others') && customAction.trim()) {
      actions.push(customAction.trim())
    }
    const actionPart = actions.join(' + ')
    const datePart = formatSubjectDate()
    const base = `License Key for ${clinic.clinic_name} (${clinic.clinic_code}) by ${agentName.toUpperCase()} on ${datePart}`
    return actionPart ? `${actionPart} : ${base}` : base
  }, [selectedActions, customAction, clinic.clinic_name, clinic.clinic_code, agentName])

  const currentSubject = subjectEdited ? subjectOverride : generatedSubject

  const toggleAction = (action: string) => {
    setSubjectEdited(false)
    setSelectedActions(prev =>
      prev.includes(action) ? prev.filter(a => a !== action) : [...prev, action]
    )
  }

  const handleSubjectEdit = (val: string) => {
    setSubjectEdited(true)
    setSubjectOverride(val)
  }

  const handleCopySubject = async () => {
    await navigator.clipboard.writeText(currentSubject)
    setSubjectCopied(true)
    setTimeout(() => setSubjectCopied(false), 2000)
  }

  // === Email Header & Footer (persisted in Supabase profiles.email_settings) ===
  const [emailHeader, setEmailHeader] = useState('Dear [Name],\nKindly create this for the clinic above. Thanks.')
  const [emailFooter, setEmailFooter] = useState('')
  const headerRef = useRef(emailHeader)
  const footerRef = useRef(emailFooter)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load from Supabase (localStorage as instant fallback)
  useEffect(() => {
    // Instant: show localStorage values while Supabase loads
    const localHeader = localStorage.getItem('lk_email_header')
    const localFooter = localStorage.getItem('lk_email_footer')
    if (localHeader !== null) { setEmailHeader(localHeader); headerRef.current = localHeader }
    if (localFooter !== null) { setEmailFooter(localFooter); footerRef.current = localFooter }

    // Then fetch from Supabase (source of truth)
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) return
      const { data } = await supabase.from('profiles').select('email_settings').eq('id', session.user.id).single()
      const s = (data?.email_settings || {}) as Record<string, string>
      if (s.lk_header !== undefined) { setEmailHeader(s.lk_header); headerRef.current = s.lk_header; localStorage.setItem('lk_email_header', s.lk_header) }
      if (s.lk_footer !== undefined) { setEmailFooter(s.lk_footer); footerRef.current = s.lk_footer; localStorage.setItem('lk_email_footer', s.lk_footer) }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced save to Supabase (1.5s after last keystroke)
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) return
      const { data } = await supabase.from('profiles').select('email_settings').eq('id', session.user.id).single()
      const existing = (data?.email_settings || {}) as Record<string, string>
      await supabase.from('profiles').update({
        email_settings: { ...existing, lk_header: headerRef.current, lk_footer: footerRef.current }
      }).eq('id', session.user.id)
    }, 1500)
  }, [supabase])

  const handleHeaderChange = (val: string) => {
    setEmailHeader(val)
    headerRef.current = val
    localStorage.setItem('lk_email_header', val)
    scheduleSave()
  }

  const handleFooterChange = (val: string) => {
    setEmailFooter(val)
    footerRef.current = val
    localStorage.setItem('lk_email_footer', val)
    scheduleSave()
  }

  // WHY: Outlook uses Word's HTML engine which is extremely picky.
  // Nuclear approach: bgcolor attribute + background-color CSS + mso-highlight on EVERY cell.
  // Wrapped in Office XML namespace document so Outlook treats it like Excel output.
  // Copy via DOM selection (not ClipboardItem API) so browser sends rendered format.

  const generateHTML = () => {
    // Cell style helpers — BOTH bgcolor attr AND background-color CSS for maximum compatibility
    const cell = (bg: string, extra = '') =>
      `bgcolor="${bg}" style="border:1px solid #000;background-color:${bg};mso-highlight:${bg};font-family:Calibri,Arial,sans-serif;font-size:11pt;padding:3px 6px;${extra}"`

    const nc = (bg: string) => cell(bg, 'text-align:center;width:25px;')   // num cell
    const lc = (bg: string) => cell(bg, 'width:200px;')                     // label cell
    const vc = (bg: string) => cell(bg)                                      // value cell

    // Regular row — white bg
    const r = (num: string, label: string, value: string) =>
      `<tr><td ${nc('#FFFFFF')}><font color="#000000">${num}</font></td><td ${lc('#FFFFFF')}><font color="#000000">${label}</font></td><td ${vc('#FFFFFF')}><font color="#000000">${value}</font></td></tr>`

    // Section header — merged across all 3 columns
    const hdr = (text: string) =>
      `<tr><td colspan="3" ${cell('#404040', 'width:100%;')}><b><font color="#FFFFFF">${text}</font></b></td></tr>`

    // Activation header — first 2 cols merged (dark), value col also dark
    const actHdr = (text: string, val: string, extra = '') =>
      `<tr><td colspan="2" ${cell('#404040', 'width:225px;')}><b><font color="#FFFFFF">${text}</font></b></td><td ${cell('#404040', 'text-align:center;')}><b><font color="#FFFFFF">${val}</font></b>${extra}</td></tr>`

    const red = (text: string) => `<font color="#FF0000"><b>${text}</b></font>`

    const tableHTML = `<table border="1" cellpadding="3" cellspacing="0" width="950" style="border-collapse:collapse;width:950px;font-family:Calibri,Arial,sans-serif;font-size:11pt;">
<tr><td colspan="3" ${cell('#0563C1', 'width:100%;')}><b><font color="#FFFFFF" size="3">Medex License Key Request Form</font></b></td></tr>
${hdr('License Key Information')}
${r('1', 'Program Type', programType)}
${r('2', 'MTN Start Date', mtnStart)}
${r('3', 'MTN End Date', mtnEnd)}
${r('3', 'Clinic Name', clinicName)}
<tr><td ${nc('#FFFFFF')}><font color="#000000">&nbsp;</font></td><td ${lc('#FFFFFF')}><font color="#000000"><i>Clinic Name Remark</i></font></td><td ${vc('#FFFFFF')}>${red('For Internal Testing key: Clinic Name must be Klink + Tester Name')}</td></tr>
${r('4', 'Clinic Client Code', clientCode)}
<tr><td ${nc('#FFFFFF')}><font color="#000000">&nbsp;</font></td><td ${lc('#FFFFFF')}><font color="#000000"><i>Client Code Remark</i></font></td><td ${vc('#FFFFFF')}>${red('For Internal Testing Client Code must start with:')}<br>${red('S - for support')}<br>${red('R - for RnD')}</td></tr>
${r('5', 'Info 1 (Address 1)', address1)}
${r('6', 'Info 2 (Address 2)', address2)}
${r('7', 'Info 3 (Address 3)', address3)}
${r('8', 'Tel: (TEL &amp; FAX)', tel)}
${r('', 'Registration No', registrationNo)}
${r('', 'Start Date', startDate)}
${r('', 'Submission', submission)}
${r('', 'Frequency (1 or 2 months)', frequency)}
${hdr('Additional Customer Information (New Client only)')}
${r('9', 'HQ Clinic Name', hqClinicName)}
${r('10', 'HQ Cliient Code', hqClientCode)}
${r('', 'Is New Client', isNewClient)}
${r('11', 'Assigned 2 character Branch Doc ID (Code must be uniqued within Group  Clinic)', branchDocId)}
<tr><td ${nc('#FFFFFF')}><font color="#000000">&nbsp;</font></td><td ${lc('#FFFFFF')}><font color="#000000">&nbsp;</font></td><td ${vc('#FFFFFF')}>${red('For Medex staff, please get your assigned branch code from Internal Test Key tab, we use 1 character for now, will revise this in future')}</td></tr>
${r('12', 'PIC Name', picName)}
${r('13', 'PIC HP No', picPhone)}
${r('14', 'PIC Email Address', picEmail)}
${r('15', 'Clinic Owner Name', ownerName)}
${r('16', 'Clinic Onwer HP No', ownerPhone)}
${r('17', 'Clinic Owner Email Address', ownerEmail)}
${r('18', 'Billing / Account PIC Name', billingPicName)}
${r('19', 'Billing / Account PIC HP No', billingPicPhone)}
${r('20', 'Billing / Account PIC Email Address', billingPicEmail)}
${hdr('System Environment Information')}
${r('21', 'Environment  (TEST / LIVE)', environment)}
${r('22', 'For Internal Use *', internalUse)}
${r('23', 'Server Name', serverName)}
${r('24', 'Device ID', deviceId)}
${actHdr('e-Invoice Activation', eInvoice)}
${r('25', 'clinvoiceClientAPI Port No', eInvoicePort)}
${actHdr('Medex Communication API : Whatsapp Activation', waActive)}
<tr><td ${nc('#FFFFFF')}><font color="#000000">&nbsp;</font></td><td ${lc('#FFFFFF')}><font color="#000000">&nbsp;</font></td><td ${vc('#FFFFFF')}>${red('* Only 1 Whatsapp account will be used to sending message. Other Whatsapp account register will used for backup')}</td></tr>
${r('24', 'Whatsapp Account Number**', waAccountNo)}
${r('25', 'Whatsapp API Key', waApiKey)}
${actHdr('Medex Communicaion API: Email Activation', emailActive, emailActive === 'No' ? ' <font size="1" color="#FFFFFF">---&gt; Right now Email still not ready yet (just leave it blank)</font>' : '')}
${r('26', 'Email Type', emailType)}
${r('27', 'Email Address (suggest use Google email)', emailAddress)}
${r('28', 'Email Password', emailPassword)}
</table>`

    // Convert newlines to <br> for header/footer
    const headerHTML = emailHeader ? `<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000;">${emailHeader.replace(/\n/g, '<br>')}</p>` : ''
    const footerHTML = emailFooter ? `<p style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000;white-space:pre-wrap;">${emailFooter.replace(/\n/g, '<br>')}</p>` : ''

    return `${headerHTML}<br>${tableHTML}${footerHTML}`
  }

  // Copy approach: ClipboardItem API with both text/html and text/plain.
  // Include bgcolor + background-color + mso-highlight on every cell.
  // User must paste with "Keep Source Formatting" in Outlook (Ctrl+Shift+V or paste options).
  const handleCopy = async () => {
    const html = generateHTML()
    try {
      const htmlBlob = new Blob([html], { type: 'text/html' })
      const textBlob = new Blob([html], { type: 'text/plain' })
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        })
      ])
    } catch {
      // Fallback: render in DOM, select, copy
      const container = document.createElement('div')
      container.style.position = 'fixed'
      container.style.left = '0'
      container.style.top = '0'
      container.style.background = '#fff'
      container.style.opacity = '0.01'
      container.innerHTML = html
      document.body.appendChild(container)
      const range = document.createRange()
      range.selectNodeContents(container)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      document.execCommand('copy')
      sel?.removeAllRanges()
      document.body.removeChild(container)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)

    // Save to database (fire and forget — don't block the copy)
    if (!saved) {
      supabase.from('license_key_requests').insert({
        clinic_code: clinic.clinic_code,
        clinic_name: clinic.clinic_name,
        created_by: agentName,
        subject: currentSubject,
      }).then(() => setSaved(true))
    }
  }

  const inputClass = 'w-full px-2 py-1.5 bg-background border border-border rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50'
  const labelClass = 'text-[11px] text-text-tertiary mb-0.5'
  const selectClass = 'w-full px-2 py-1.5 bg-background border border-border rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50'
  const sh = 'text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h3 className="font-semibold text-white text-sm">Create License Key Request</h3>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors p-2 -mr-2" aria-label="Close">
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          <button onClick={() => setActiveTab('form')} className={`flex-1 py-2 text-xs font-medium transition-colors ${activeTab === 'form' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-text-tertiary hover:text-text-secondary'}`}>
            Edit Form
          </button>
          <button onClick={() => setActiveTab('preview')} className={`flex-1 py-2 text-xs font-medium transition-colors ${activeTab === 'preview' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-text-tertiary hover:text-text-secondary'}`}>
            Preview
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'form' ? (
            <div className="p-4 space-y-4">
              {/* Action / Reason + Subject */}
              <div className="space-y-3 bg-surface-raised border border-border rounded-lg p-3">
                <div>
                  <div className={labelClass}>Action / Reason</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {ACTION_PRESETS.map(action => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => toggleAction(action)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors border ${
                          selectedActions.includes(action)
                            ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                            : 'bg-white/[0.03] text-zinc-400 border-border hover:border-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                  {selectedActions.includes('Others') && (
                    <input
                      value={customAction}
                      onChange={(e) => { setCustomAction(e.target.value); setSubjectEdited(false) }}
                      className={inputClass + ' mt-2'}
                      placeholder="Type custom action..."
                      autoFocus
                    />
                  )}
                </div>
                <div>
                  <div className={labelClass}>Email Subject</div>
                  <div className="flex gap-1.5 mt-1">
                    <input
                      value={currentSubject}
                      onChange={(e) => handleSubjectEdit(e.target.value)}
                      className={inputClass + ' flex-1 !text-[11px]'}
                    />
                    <button
                      type="button"
                      onClick={handleCopySubject}
                      className={`px-3 rounded-md text-xs font-medium transition-colors shrink-0 ${
                        subjectCopied
                          ? 'bg-green-600 text-white'
                          : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                      }`}
                    >
                      {subjectCopied ? 'Copied!' : 'Copy Subject'}
                    </button>
                  </div>
                  <p className="text-[10px] text-text-muted mt-1.5">Step 1: Copy Subject &rarr; Step 2: Copy Body</p>
                </div>
              </div>

              {/* Email Header */}
              <div>
                <h4 className={sh}>Email Header</h4>
                <div className="space-y-2">
                  <div>
                    <div className={labelClass}>Greeting / Message (above table)</div>
                    <textarea value={emailHeader} onChange={(e) => handleHeaderChange(e.target.value)} className={inputClass + ' min-h-[50px] resize-y'} rows={2} placeholder="Dear [Name],&#10;Kindly create this for the clinic above. Thanks." />
                  </div>
                </div>
              </div>

              {/* License Key Information */}
              <div>
                <h4 className={sh}>License Key Information</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className={labelClass}>1. Program Type</div>
                    <input value={programType} onChange={(e) => setProgramType(e.target.value)} className={inputClass} placeholder="e.g. GP" />
                  </div>
                  <div>
                    <div className={labelClass}>4. Clinic Client Code</div>
                    <input value={clientCode} onChange={(e) => setClientCode(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className={labelClass}>2. MTN Start Date</div>
                    <input value={mtnStart} onChange={(e) => setMtnStart(e.target.value)} className={inputClass} placeholder="D/M/YYYY" />
                  </div>
                  <div>
                    <div className={labelClass}>3. MTN End Date</div>
                    <input value={mtnEnd} onChange={(e) => setMtnEnd(e.target.value)} className={inputClass} placeholder="D/M/YYYY" />
                  </div>
                  <div className="col-span-2">
                    <div className={labelClass}>3. Clinic Name</div>
                    <input value={clinicName} onChange={(e) => setClinicName(e.target.value)} className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    <div className={labelClass}>5. Info 1 (Address 1)</div>
                    <input value={address1} onChange={(e) => setAddress1(e.target.value)} className={inputClass} placeholder="Street address" />
                  </div>
                  <div className="col-span-2">
                    <div className={labelClass}>6. Info 2 (Address 2)</div>
                    <input value={address2} onChange={(e) => setAddress2(e.target.value)} className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    <div className={labelClass}>7. Info 3 (Address 3)</div>
                    <input value={address3} onChange={(e) => setAddress3(e.target.value)} className={inputClass} placeholder="TEL: / FAX:" />
                  </div>
                  <div className="col-span-2">
                    <div className={labelClass}>8. Tel: (TEL & FAX)</div>
                    <input value={tel} onChange={(e) => setTel(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className={labelClass}>Registration No</div>
                    <input value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className={labelClass}>Start Date</div>
                    <input value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className={labelClass}>Submission</div>
                    <input value={submission} onChange={(e) => setSubmission(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className={labelClass}>Frequency (1 or 2 months)</div>
                    <input value={frequency} onChange={(e) => setFrequency(e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>

              {/* Additional Customer Information */}
              <div>
                <h4 className={sh}>Additional Customer Information (New Client only)</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <div className={labelClass}>9. HQ Clinic Name</div>
                    <input value={hqClinicName} onChange={(e) => setHqClinicName(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className={labelClass}>10. HQ Client Code</div>
                    <input value={hqClientCode} onChange={(e) => setHqClientCode(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className={labelClass}>Is New Client</div>
                    <input value={isNewClient} onChange={(e) => setIsNewClient(e.target.value)} className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    <div className={labelClass}>11. Branch Doc ID (2 chars)</div>
                    <input value={branchDocId} onChange={(e) => setBranchDocId(e.target.value.toUpperCase().slice(0, 2))} className={inputClass} placeholder="e.g. BH" maxLength={2} />
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div>
                <h4 className={sh}>Contact Information</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className={labelClass}>12. PIC Name</div>
                    <input value={picName} onChange={(e) => setPicName(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className={labelClass}>13. PIC HP No</div>
                    <input value={picPhone} onChange={(e) => setPicPhone(e.target.value)} className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    <div className={labelClass}>14. PIC Email Address</div>
                    <input value={picEmail} onChange={(e) => setPicEmail(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className={labelClass}>15. Clinic Owner Name</div>
                    <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className={labelClass}>16. Clinic Owner HP No</div>
                    <input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    <div className={labelClass}>17. Clinic Owner Email Address</div>
                    <input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className={labelClass}>18. Billing / Account PIC Name</div>
                    <input value={billingPicName} onChange={(e) => setBillingPicName(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className={labelClass}>19. Billing / Account PIC HP No</div>
                    <input value={billingPicPhone} onChange={(e) => setBillingPicPhone(e.target.value)} className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    <div className={labelClass}>20. Billing / Account PIC Email Address</div>
                    <input value={billingPicEmail} onChange={(e) => setBillingPicEmail(e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>

              {/* System Environment */}
              <div>
                <h4 className={sh}>System Environment Information</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className={labelClass}>21. Environment (TEST / LIVE)</div>
                    <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className={selectClass}>
                      <option value="LIVE">LIVE</option>
                      <option value="TEST">TEST</option>
                    </select>
                  </div>
                  <div>
                    <div className={labelClass}>22. For Internal Use</div>
                    <select value={internalUse} onChange={(e) => setInternalUse(e.target.value)} className={selectClass}>
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </div>
                  <div>
                    <div className={labelClass}>23. Server Name</div>
                    <input value={serverName} onChange={(e) => setServerName(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className={labelClass}>24. Device ID</div>
                    <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className={inputClass} placeholder="e.g. BFEBFBFF..." />
                  </div>
                </div>
              </div>

              {/* e-Invoice */}
              <div>
                <h4 className={sh}>e-Invoice Activation</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className={labelClass}>e-Invoice (Yes / No)</div>
                    <select value={eInvoice} onChange={(e) => setEInvoice(e.target.value)} className={selectClass}>
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </div>
                  <div>
                    <div className={labelClass}>25. clinvoiceClientAPI Port No</div>
                    <input value={eInvoicePort} onChange={(e) => setEInvoicePort(e.target.value)} className={inputClass} placeholder="e.g. 60001" />
                  </div>
                </div>
              </div>

              {/* WhatsApp */}
              <div>
                <h4 className={sh}>WhatsApp Activation</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className={labelClass}>WhatsApp API (Yes / No)</div>
                    <select value={waActive} onChange={(e) => setWaActive(e.target.value)} className={selectClass}>
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </div>
                  <div>
                    <div className={labelClass}>24. Whatsapp Account Number</div>
                    <input value={waAccountNo} onChange={(e) => setWaAccountNo(e.target.value)} className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    <div className={labelClass}>25. Whatsapp API Key</div>
                    <input value={waApiKey} onChange={(e) => setWaApiKey(e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>

              {/* Email */}
              <div>
                <h4 className={sh}>Email Activation</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className={labelClass}>Email API (Yes / No)</div>
                    <select value={emailActive} onChange={(e) => setEmailActive(e.target.value)} className={selectClass}>
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </div>
                  <div>
                    <div className={labelClass}>26. Email Type</div>
                    <input value={emailType} onChange={(e) => setEmailType(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className={labelClass}>27. Email Address (Google email)</div>
                    <input value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <div className={labelClass}>28. Email Password</div>
                    <input value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} className={inputClass} />
                  </div>
                </div>
              </div>

              {/* Email Footer / Signature */}
              <div>
                <h4 className={sh}>Email Signature (saved for next time)</h4>
                <div>
                  <div className={labelClass}>Your signature block (below table)</div>
                  <textarea value={emailFooter} onChange={(e) => handleFooterChange(e.target.value)} className={inputClass + ' min-h-[120px] resize-y'} rows={6} placeholder={"Thanks & Regards,\n\nYOUR NAME\nIT Professional Services Consultant\n..."} />
                </div>
              </div>
            </div>
          ) : (
            /* Preview — renders the actual HTML table */
            <div className="p-4 overflow-x-auto rounded m-3" style={{ background: '#fff', color: '#000' }}>
              <div ref={previewRef} dangerouslySetInnerHTML={{ __html: generateHTML() }} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex gap-2 shrink-0">
          <button
            onClick={() => setActiveTab(activeTab === 'form' ? 'preview' : 'form')}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-zinc-400 hover:text-white transition-colors"
          >
            {activeTab === 'preview' ? 'Edit Form' : 'Preview'}
          </button>
          <button
            onClick={handleCopy}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              copied
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {copied ? 'Copied! — Paste with "Keep Source Formatting" in Outlook' : 'Copy to Clipboard'}
          </button>
        </div>
      </div>
    </div>
  )
}
