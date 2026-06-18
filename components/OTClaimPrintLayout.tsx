import { format } from 'date-fns'
import type { OTClaim } from '@/lib/types'

function formatTime12h(time24: string): string {
  if (!time24) return ''
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

interface Props {
  claim: OTClaim
  containerId?: string
  printMediaWrap?: boolean
}

export default function OTClaimPrintLayout({ claim, containerId = 'ot-print', printMediaWrap = false }: Props) {
  const id = containerId
  const monthDate = new Date(claim.claim_month)
  const monthLabel = format(monthDate, 'MMMM yyyy').toUpperCase()
  const monthNum = monthDate.getMonth() + 1

  const rows: { num: number; day: string; from: string; to: string; hours: string; nature: string }[] = []
  for (let i = 0; i < 31; i++) {
    if (i < claim.entries.length) {
      const entry = claim.entries[i]
      const d = new Date(entry.date)
      rows.push({
        num: i + 1,
        day: `${d.getDate()}/${monthNum}`,
        from: formatTime12h(entry.from),
        to: formatTime12h(entry.to),
        hours: entry.hours.toString(),
        nature: entry.nature,
      })
    } else {
      rows.push({ num: i + 1, day: '', from: '', to: '', hours: '', nature: '' })
    }
  }

  const submittedDate = claim.submitted_at
    ? format(new Date(claim.submitted_at), 'dd/M/yyyy')
    : format(new Date(), 'dd/M/yyyy')

  const rawCss = `
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    #${id} {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10px;
      color: #000 !important;
      line-height: 1.3;
      width: 100%;
      min-height: 297mm;
      padding: 8mm 12mm 6mm 12mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    }
    #${id} table { width: 100%; border-collapse: collapse; }
    #${id} .main-wrap { flex: 1; display: flex; flex-direction: column; }
    #${id} .main { flex: 1; }
    #${id} .logo-wrap { text-align: center; margin-bottom: 4px; }
    #${id} .logo-wrap img { height: 44px; display: inline-block; }
    #${id} .logo-sub { font-size: 7.5px; color: #444; line-height: 1.4; margin-top: 1px; }
    #${id} .ot-title { text-align: center; font-size: 15px; font-weight: bold; margin: 12px 0 8px; text-decoration: underline; letter-spacing: 1px; }
    #${id} .info td { padding: 3px 6px; font-size: 9px; border: 1px solid #000; vertical-align: top; color: #000 !important; background: #fff !important; }
    #${id} .info .lbl { font-weight: bold; }
    #${id} .main th,
    #${id} .main td { border: 1px solid #000; padding: 1.5px 3px; text-align: center; font-size: 8px; color: #000 !important; background: #fff !important; }
    #${id} .main th { background: #e8e8e8 !important; font-weight: bold; font-size: 7.5px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    #${id} .main td.nature { text-align: left; padding-left: 5px; }
    #${id} .main .total-row td { font-weight: bold; font-size: 9px; }
    #${id} .note { font-size: 7px; font-style: italic; margin: 6px 0 10px; line-height: 1.4; color: #000 !important; }
    #${id} .sig td { border: 1px solid #000; padding: 6px 8px; vertical-align: top; width: 50%; font-size: 9px; height: 80px; color: #000 !important; background: #fff !important; }
    #${id} .sig .sig-name { font-style: italic; font-size: 13px; font-family: 'Segoe Script', 'Dancing Script', cursive, serif; margin: 6px 0; }
    #${id} .payroll-label { font-size: 8px; font-style: italic; font-weight: bold; margin: 8px 0 2px; color: #000 !important; }
    #${id} .payroll { width: auto; border-collapse: collapse; font-size: 8px; }
    #${id} .payroll th,
    #${id} .payroll td { border: 1px solid #000; padding: 2px 10px; text-align: center; color: #000 !important; background: #fff !important; }
    #${id} .payroll th { background: #e8e8e8 !important; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  `

  const css = printMediaWrap ? `@media print { ${rawCss} }` : rawCss

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div id={id}>
        {/* Logo — same as job sheet */}
        <div className="logo-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/medexone-logo.png" alt="MedexOne Global" />
          <div className="logo-sub">
            <strong>MEDEXONE GLOBAL SDN. BHD.</strong> (564400-X)
          </div>
        </div>

        {/* Title */}
        <div className="ot-title">OVERTIME CLAIM FORM</div>

        {/* Info Section */}
        <table className="info" style={{ marginBottom: 6 }}>
          <tbody>
            <tr>
              <td><span className="lbl">NAME : </span>{claim.user_name.toUpperCase()}</td>
              <td><span className="lbl">COMPANY : </span>MEDEXONE GLOBAL SDN. BHD.</td>
            </tr>
            <tr>
              <td><span className="lbl">DESIGNATION : </span>{claim.designation}</td>
              <td><span className="lbl">DEPT./DIVISION : </span>{claim.department}</td>
            </tr>
            <tr>
              <td><span className="lbl">MONTH : </span>{monthLabel}</td>
              <td><span className="lbl">REPORTING MANAGER / HOD: </span>{claim.reporting_manager}</td>
            </tr>
          </tbody>
        </table>

        {/* Main OT Table */}
        <div className="main-wrap">
        <table className="main">
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: 28 }}>Date</th>
              <th rowSpan={2} style={{ width: 42 }}>DAY</th>
              <th colSpan={2}>OVERTIME</th>
              <th rowSpan={2} style={{ width: 42 }}>TOTAL<br/>HOURS</th>
              <th rowSpan={2}>NATURE OF WORK PERFORMED</th>
              <th rowSpan={2} style={{ width: 80 }}>REQUESTED/<br/>APPROVED BY</th>
            </tr>
            <tr>
              <th style={{ width: 60 }}>FROM</th>
              <th style={{ width: 60 }}>TO</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.num}>
                <td>{r.num}</td>
                <td>{r.day}</td>
                <td>{r.from}</td>
                <td>{r.to}</td>
                <td>{r.hours}</td>
                <td className="nature">{r.nature}</td>
                <td></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td colSpan={4} style={{ textAlign: 'right', paddingRight: 6 }}>TOTAL</td>
              <td>{claim.total_hours}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>

        </div>{/* end main-wrap */}

        {/* Note */}
        <p className="note">
          Note: Completed OT claim forms should be submitted and email to the Payroll Department by 5th of each month.<br />
          For late submission of OT claim form, payment will be made the following month
        </p>

        {/* Signature Section */}
        <table className="sig">
          <tbody>
            <tr>
              <td>
                <div><strong>CLAIMANT&apos;S SIGNATURE</strong></div>
                <div className="sig-name">{claim.user_name.split(' ')[0]?.toUpperCase()}</div>
                <div><strong>NAME : </strong>{claim.user_name.toUpperCase()}</div>
                <div><strong>DATE: </strong>{submittedDate}</div>
              </td>
              <td>
                <div><strong>APPROVED BY (HOD) :</strong></div>
                <div style={{ marginTop: 28 }}></div>
                <div><strong>NAME: </strong>{claim.status === 'approved' && claim.approved_by_name ? claim.approved_by_name.toUpperCase() : ''}</div>
                <div><strong>DATE : </strong>{claim.status === 'approved' && claim.approved_at ? format(new Date(claim.approved_at), 'dd/M/yyyy') : ''}</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Payroll Section */}
        <div className="payroll-label">For Payroll use:</div>
        <table className="payroll">
          <thead>
            <tr>
              <th style={{ width: 60 }}>RATE</th>
              <th style={{ width: 80 }}>TOTAL HOURS</th>
              <th style={{ width: 100 }}>AMOUNT (RM)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>1.5</td><td></td><td></td></tr>
            <tr><td>2.0</td><td></td><td></td></tr>
            <tr><td>3.0</td><td></td><td></td></tr>
            <tr><td><strong>Total</strong></td><td></td><td></td></tr>
          </tbody>
        </table>
      </div>
    </>
  )
}
