// Shared print layout for SERVICE JOB SHEET — used by both the detail page (print mode)
// and the popup email page (screen mode). Renders a pixel-perfect A4 replica.

interface JobSheetPrintProps {
  jsNumber: string
  serviceDate: string
  timeStart: string
  timeEnd: string
  serviceBy: string
  clinicCode: string
  clinicName: string
  lkeyLines: string[]
  contactPerson: string
  contactTel: string
  doctorName: string
  doctorPhone: string
  clinicEmail: string
  programType: string
  versionBefore: string
  dbVersionBefore: string
  serviceTypes: string[]
  otherServiceText: string
  issueDetail: string
  issueCategories: { label: string; checked: boolean }[]
  otherIssueText: string
  backupStatus: string
  serviceDone: string
  suggestion: string
  remark: string
  checklist: { label: string; checked: boolean; notes: string }[]
  importantDetails: {
    main_pc_name: string
    space_c: string
    space_c_type: string
    space_d: string
    space_d_type: string
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
  chargeAmount: string
  paymentMethod: string
  needReceipt: boolean
  needInvoice: boolean
  jobOutcome: string
  customerRepName: string
  containerId?: string
  printMediaWrap?: boolean
}

export default function JobSheetPrintLayout({
  jsNumber, serviceDate, timeStart, timeEnd, serviceBy,
  clinicCode, clinicName, lkeyLines,
  contactPerson, contactTel, doctorName, doctorPhone, clinicEmail,
  programType, versionBefore, dbVersionBefore,
  serviceTypes, otherServiceText,
  issueDetail, issueCategories, otherIssueText,
  backupStatus, serviceDone, suggestion, remark,
  checklist, importantDetails,
  chargeAmount, paymentMethod, needReceipt, needInvoice,
  jobOutcome, customerRepName,
  containerId = 'js-print',
  printMediaWrap = false,
}: JobSheetPrintProps) {
  const id = containerId

  const rawCss = `
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    #${id} {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5px;
      color: #000 !important;
      line-height: 1.28;
      width: 100%;
      padding: 8mm 12mm 6mm 12mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    #${id} table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    #${id} td { border: 0.7px solid #333; padding: 3.5px 5px; vertical-align: top; color: #000 !important; background: #fff !important; overflow: hidden; word-wrap: break-word; }
    #${id} .nb { border: none !important; }
    #${id} .bt0 { border-top: none !important; }
    #${id} .bb0 { border-bottom: none !important; }
    #${id} .bl0 { border-left: none !important; }
    #${id} .br0 { border-right: none !important; }
    #${id} .lbl { font-size: 10px; color: #000; white-space: nowrap; }
    #${id} .v { font-weight: bold; font-size: 10.5px; color: #1a3a8a !important; }
    #${id} .shd { background: #e0e3eb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    #${id} .shtl { font-weight: bold; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.3px; padding: 3.5px 5px; }
    #${id} .ck { width: 12px; height: 12px; border: 0.8px solid #000; display: inline-block; vertical-align: middle; margin-right: 3px; text-align: center; font-size: 10px; line-height: 12px; font-weight: bold; }
    #${id} .ck-on { background: #1a1a1a !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    #${id} .c { text-align: center; }
    #${id} .vm { vertical-align: middle; }
    #${id} img { max-width: 100%; height: auto; }
  `

  const css = printMediaWrap ? `@media print { ${rawCss} }` : rawCss

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* Logo + Address */}
      <div style={{ textAlign: 'center', marginBottom: 2 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/medexone-logo.png" alt="MedexOne Global" style={{ height: 48, display: 'inline-block' }} />
        <div style={{ fontSize: '8px', color: '#444', lineHeight: 1.4, marginTop: 2 }}>
          <strong>MEDEXONE GLOBAL SDN. BHD.</strong> (564400-X)<br/>
          Unit 603, Block G, Level 6, Pusat Dagangan Phileo Damansara 1, No. 9, Jalan 16/11, 46350 Petaling Jaya, Selangor.<br/>
          Tel: 03-5888 7767 &nbsp; Fax: 03-7954 0240 &nbsp; Email: allsupport@medexoneglobal.com
        </div>
      </div>

      {/* Title */}
      <div style={{ textAlign: 'center', marginTop: 16, marginBottom: 8 }}>
        <div style={{ fontSize: '17px', fontWeight: 'bold', letterSpacing: '2px' }}>SERVICE JOB SHEET</div>
      </div>

      {/* ROW 1: Clinic Stamp + Date/Time/Service/Program */}
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
              <div style={{ minHeight: 50, paddingTop: 2 }}>
                {lkeyLines.length > 0 ? lkeyLines.map((line, i) => (
                  <div key={i} style={{ fontSize: i === 0 ? '11px' : '9px', fontWeight: i === 0 ? 'bold' : 'normal', color: '#1a3a8a', lineHeight: 1.4 }}>{line}</div>
                )) : (
                  <>
                    <span className="v" style={{ fontSize: '11px' }}>{clinicName}</span><br/>
                    <span style={{ fontSize: '9px', color: '#1a3a8a' }}>{clinicCode}</span>
                  </>
                )}
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

      {/* ROW 2: Contact Info (left) + Type of Service (right) */}
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
            <td className="vm"><span className={serviceTypes.includes('ISP1') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('ISP1') ? '✓' : ''}</span> ISP1</td>
            <td className="vm" style={{ fontWeight: 'bold' }}>Delivery</td>
            <td className="vm"><span className={serviceTypes.includes('Hardware') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('Hardware') ? '✓' : ''}</span> Hardware</td>
          </tr>
          <tr>
            <td className="lbl vm">Doctor Name</td>
            <td className="v vm">{doctorName}</td>
            <td className="vm"><span className={serviceTypes.includes('ISP2') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('ISP2') ? '✓' : ''}</span> ISP2</td>
            <td className="vm"></td>
            <td className="vm"><span className={serviceTypes.includes('Label') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('Label') ? '✓' : ''}</span> Label</td>
          </tr>
          <tr>
            <td className="lbl vm">Doctor H/P</td>
            <td className="v vm">{doctorPhone}</td>
            <td className="vm"><span className={serviceTypes.includes('ISP3') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('ISP3') ? '✓' : ''}</span> ISP3</td>
            <td className="vm"></td>
            <td className="vm"><span className={serviceTypes.includes('Others') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('Others') ? '✓' : ''}</span> Others{otherServiceText ? <span className="v"> — {otherServiceText}</span> : ''}</td>
          </tr>
          <tr>
            <td className="lbl vm">Email</td>
            <td className="v vm">{clinicEmail}</td>
            <td className="vm"><span className={serviceTypes.includes('MTN') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('MTN') ? '✓' : ''}</span> MTN</td>
            <td className="vm"></td>
            <td className="vm"></td>
          </tr>
          <tr>
            <td className="nb" colSpan={2}></td>
            <td className="vm"><span className={serviceTypes.includes('AD-HOC') || serviceTypes.includes('AD-HOC/KIOSK') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('AD-HOC') || serviceTypes.includes('AD-HOC/KIOSK') ? '✓' : ''}</span> AD-HOC</td>
            <td className="vm"></td>
            <td className="vm"></td>
          </tr>
          <tr>
            <td className="nb" colSpan={2}></td>
            <td className="vm"><span className={serviceTypes.includes('KIOSK') || serviceTypes.includes('AD-HOC/KIOSK') ? 'ck ck-on' : 'ck'}>{serviceTypes.includes('KIOSK') || serviceTypes.includes('AD-HOC/KIOSK') ? '✓' : ''}</span> KIOSK</td>
            <td className="vm"></td>
            <td className="vm"></td>
          </tr>
        </tbody>
      </table>

      {/* ROW 3: Issue */}
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
            <td className="lbl" style={{ verticalAlign: 'top' }}>Issue Detail</td>
            <td className="v" style={{ whiteSpace: 'pre-wrap', minHeight: 55 }}>{issueDetail}</td>
            <td className="c shtl">Issue</td>
            <td colSpan={2} className="c shtl">Other Issues (chargeable)</td>
          </tr>
          <tr>
            <td className="nb" colSpan={2} rowSpan={3}></td>
            <td className="vm"><span className={issueCategories.find(c => c.label.includes('Mdx1'))?.checked ? 'ck ck-on' : 'ck'}>{issueCategories.find(c => c.label.includes('Mdx1'))?.checked ? '✓' : ''}</span> Mdx1 Pro</td>
            <td className="vm"><span className={issueCategories.find(c => c.label.includes('Migrate'))?.checked ? 'ck ck-on' : 'ck'}>{issueCategories.find(c => c.label.includes('Migrate'))?.checked ? '✓' : ''}</span> Migrate server</td>
            <td className="vm"><span className={issueCategories.find(c => c.label.includes('Other'))?.checked ? 'ck ck-on' : 'ck'}>{issueCategories.find(c => c.label.includes('Other'))?.checked ? '✓' : ''}</span> Other{otherIssueText ? <span className="v"> — {otherIssueText}</span> : ''}</td>
          </tr>
          <tr>
            <td className="vm"><span className="ck"></span> Database</td>
            <td className="vm"><span className={issueCategories.find(c => c.label.includes('Windows') || c.label.includes('Network'))?.checked ? 'ck ck-on' : 'ck'}>{issueCategories.find(c => c.label.includes('Windows') || c.label.includes('Network'))?.checked ? '✓' : ''}</span> Windows</td>
            <td className="nb"></td>
          </tr>
          <tr>
            <td className="vm"><span className="ck"></span> Gprinter / Mycard</td>
            <td className="vm"><span className="ck"></span> Network</td>
            <td className="nb"></td>
          </tr>
        </tbody>
      </table>

      {/* ROW 4: Service Detail */}
      <table style={{ marginBottom: 0 }}>
        <colgroup><col style={{ width: '14%' }} /><col style={{ width: '86%' }} /></colgroup>
        <tbody>
          <tr>
            <td className="lbl" style={{ verticalAlign: 'top' }}>Service Detail</td>
            <td className="v" style={{ whiteSpace: 'pre-wrap', minHeight: 60 }}>
              {backupStatus && <>- BACKUP STATUS ({backupStatus.toUpperCase()}) : OK{'\n'}</>}
              {serviceDone}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ROW 5: Suggestion + Remark */}
      <table style={{ marginBottom: 0 }}>
        <colgroup><col style={{ width: '14%' }} /><col style={{ width: '36%' }} /><col style={{ width: '10%' }} /><col style={{ width: '40%' }} /></colgroup>
        <tbody>
          <tr>
            <td className="lbl" style={{ verticalAlign: 'top' }}>Suggestion</td>
            <td className="v" style={{ whiteSpace: 'pre-wrap', height: 32 }}>{suggestion}</td>
            <td className="lbl" style={{ verticalAlign: 'top' }}>Remark</td>
            <td className="v" style={{ whiteSpace: 'pre-wrap', height: 32 }}>{remark}</td>
          </tr>
        </tbody>
      </table>

      {/* ROW 6: Checklist (left) + Important Details + Charges (right) */}
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
                      <td style={{ fontSize: '9px', padding: '2px 4px' }}>{item.label} =</td>
                      <td className="c vm" style={{ padding: '2px 3px' }}>
                        <span className={item.checked ? 'ck ck-on' : 'ck'}>{item.checked ? '✓' : ''}</span>
                      </td>
                      <td className="v" style={{ fontSize: '9px', padding: '2px 4px' }}>{item.notes}</td>
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
                  <tr><td colSpan={2} className="shd shtl" style={{ fontSize: '9px' }}>IMPORTANT DETAILS: (MUST FILL IN WHEN ISP/MTN VISIT)</td></tr>
                  <tr><td style={{ fontSize: '9px' }}>Main PC =</td><td className="v" style={{ fontSize: '9px' }}>{importantDetails.main_pc_name}</td></tr>
                  <tr>
                    <td style={{ fontSize: '9px' }}>SPACE AVAILABLE</td>
                    <td style={{ fontSize: '9px' }}><strong>C ({importantDetails.space_c_type || 'SSD/HDD'}):</strong> <span className="v" style={{ fontSize: '9px' }}>{importantDetails.space_c}</span></td>
                  </tr>
                  <tr><td className="nb"></td><td style={{ fontSize: '9px' }}><strong>D:</strong> <span className="v" style={{ fontSize: '9px' }}>{importantDetails.space_d}</span></td></tr>
                  <tr>
                    <td colSpan={2} style={{ fontSize: '9px' }}>
                      <span className={importantDetails.auto_backup_30days ? 'ck ck-on' : 'ck'}>{importantDetails.auto_backup_30days ? '✓' : ''}</span> Auto-Backup &ndash; 30days. Image?
                    </td>
                  </tr>
                  <tr><td style={{ fontSize: '9px' }}>Ext. HDD Backup: Y/N</td><td className="v" style={{ fontSize: '9px' }}>{importantDetails.ext_hdd_backup ? 'Y' : 'N'}</td></tr>
                  <tr><td colSpan={2} style={{ fontSize: '9px' }}>Service DB &ndash; backup &amp; restore. Size</td></tr>
                  <tr>
                    <td style={{ fontSize: '9px' }}>Before: <span className="v" style={{ fontSize: '9px' }}>{importantDetails.service_db_size_before}</span></td>
                    <td style={{ fontSize: '9px' }}>After: <span className="v" style={{ fontSize: '9px' }}>{importantDetails.service_db_size_after}</span></td>
                  </tr>
                  <tr>
                    <td style={{ fontSize: '9px' }}>Ultraviewer/Anydesk :</td>
                    <td style={{ fontSize: '9px' }}>PW- <span className="v" style={{ fontSize: '9px' }}>{importantDetails.ultraviewer_pw || importantDetails.anydesk_pw}</span></td>
                  </tr>
                  <tr><td colSpan={2} style={{ fontSize: '9px' }}><span className="ck"></span> RAM: <span className="v" style={{ fontSize: '9px' }}>{importantDetails.ram}</span></td></tr>
                  <tr><td colSpan={2} style={{ fontSize: '9px' }}><span className="ck"></span> PROCESSOR : <span className="v" style={{ fontSize: '9px' }}>{importantDetails.processor}</span></td></tr>
                  <tr>
                    <td style={{ fontSize: '9px' }}><span className={importantDetails.need_server ? 'ck ck-on' : 'ck'}>{importantDetails.need_server ? '✓' : ''}</span> Need SERVER?</td>
                    <td style={{ fontSize: '9px' }}><span className={importantDetails.brief_doctor ? 'ck ck-on' : 'ck'}>{importantDetails.brief_doctor ? '✓' : ''}</span> Brief Doctor?</td>
                  </tr>
                  {/* CHARGES */}
                  <tr>
                    <td className="shd shtl vm">CHARGES:</td>
                    <td className="v vm">{chargeAmount ? `RM ${chargeAmount}` : 'RM'}</td>
                  </tr>
                  <tr>
                    <td colSpan={2} style={{ fontSize: '9px', lineHeight: 1.5 }}>
                      <span className={paymentMethod === 'COD' || paymentMethod === 'Cheque' || paymentMethod === 'Online Transfer' ? 'ck ck-on' : 'ck'}>{paymentMethod === 'COD' || paymentMethod === 'Cheque' || paymentMethod === 'Online Transfer' ? '✓' : ''}</span> COD, collect CHEQUE / ONLINE TRANSFER<br/>
                      <span className={paymentMethod === 'Credit Card' ? 'ck ck-on' : 'ck'}>{paymentMethod === 'Credit Card' ? '✓' : ''}</span> Credit Card Machine Payment<br/>
                      <span className={needReceipt ? 'ck ck-on' : 'ck'}>{needReceipt ? '✓' : ''}</span> Need Official Receipt (By accounts)<br/>
                      <span className={needInvoice ? 'ck ck-on' : 'ck'}>{needInvoice ? '✓' : ''}</span> Need Invoice
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ROW 7: Sign-off */}
      <table style={{ marginBottom: 0 }}>
        <colgroup><col style={{ width: '50%' }} /><col style={{ width: '50%' }} /></colgroup>
        <tbody>
          <tr>
            <td className="vm" style={{ padding: '6px 8px' }}>
              <span className={jobOutcome === 'completed' ? 'ck ck-on' : 'ck'}>{jobOutcome === 'completed' ? '✓' : ''}</span> JOB COMPLETED
              &nbsp;&nbsp;&nbsp;
              <span className={jobOutcome === 'to_be_continued' ? 'ck ck-on' : 'ck'}>{jobOutcome === 'to_be_continued' ? '✓' : ''}</span> TO BE CONTINUED
            </td>
            <td className="vm" style={{ fontSize: '9.5px', padding: '6px 8px' }}>
              <span className={jobOutcome === 'completed' ? 'ck ck-on' : 'ck'}>{jobOutcome === 'completed' ? '✓' : ''}</span> THE WORK DETAILED ABOVE HAD BEEN CARRIED OUT TO MY SATISFACTION
            </td>
          </tr>
          <tr>
            <td style={{ height: 90, verticalAlign: 'bottom', textAlign: 'center', padding: '6px 8px 8px' }}>
              <div style={{ fontStyle: 'italic', fontWeight: 'bold', fontSize: '14px', color: '#1a3a8a', marginBottom: 5 }}>{serviceBy}</div>
              <div style={{ borderTop: '1.5px solid #000', display: 'inline-block', minWidth: 190, paddingTop: 3, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>SERVICE PERFORMED BY</div>
            </td>
            <td style={{ height: 90, verticalAlign: 'bottom', textAlign: 'center', padding: '6px 8px 8px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a3a8a', marginBottom: 5 }}>{customerRepName}</div>
              <div style={{ borderTop: '1.5px solid #000', display: 'inline-block', minWidth: 190, paddingTop: 3, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>CUSTOMER&apos;S REPRESENTATIVE</div>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  )
}
