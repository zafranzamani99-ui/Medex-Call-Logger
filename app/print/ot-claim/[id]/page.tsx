'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import type { OTClaim, OTClaimEntry } from '@/lib/types'

function formatTime12h(time24: string): string {
  if (!time24) return ''
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

const CSS = `
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  #ot-print {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    color: #000;
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
  #ot-print table { width: 100%; border-collapse: collapse; }
  #ot-print .main-wrap { flex: 1; display: flex; flex-direction: column; }
  #ot-print .main { flex: 1; }
  #ot-print .logo-wrap { text-align: center; margin-bottom: 4px; }
  #ot-print .logo-wrap img { height: 44px; display: inline-block; }
  #ot-print .logo-sub { font-size: 7.5px; color: #444; line-height: 1.4; margin-top: 1px; }
  #ot-print .title { text-align: center; font-size: 15px; font-weight: bold; margin: 12px 0 8px; text-decoration: underline; letter-spacing: 1px; }
  #ot-print .info td { padding: 3px 6px; font-size: 9px; border: 1px solid #000; vertical-align: top; }
  #ot-print .info .lbl { font-weight: bold; }
  #ot-print .main th,
  #ot-print .main td { border: 1px solid #000; padding: 1.5px 3px; text-align: center; font-size: 8px; }
  #ot-print .main th { background: #e8e8e8; font-weight: bold; font-size: 7.5px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #ot-print .main td.nature { text-align: left; padding-left: 5px; }
  #ot-print .main .total-row td { font-weight: bold; font-size: 9px; }
  #ot-print .note { font-size: 7px; font-style: italic; margin: 6px 0 10px; line-height: 1.4; }
  #ot-print .sig td { border: 1px solid #000; padding: 6px 8px; vertical-align: top; width: 50%; font-size: 9px; height: 80px; }
  #ot-print .sig .sig-name { font-style: italic; font-size: 13px; font-family: 'Segoe Script', 'Dancing Script', cursive, serif; margin: 6px 0; }
  #ot-print .payroll-label { font-size: 8px; font-style: italic; font-weight: bold; margin: 8px 0 2px; }
  #ot-print .payroll { width: auto; border-collapse: collapse; font-size: 8px; }
  #ot-print .payroll th,
  #ot-print .payroll td { border: 1px solid #000; padding: 2px 10px; text-align: center; }
  #ot-print .payroll th { background: #e8e8e8; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media screen {
    body { background: #e5e7eb; margin: 0; }
    #ot-print { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; box-shadow: 0 2px 16px rgba(0,0,0,.15); }
    .print-actions { text-align: center; padding: 14px; background: #fff; border-bottom: 1px solid #ddd; position: sticky; top: 0; z-index: 10; }
    .print-actions button { padding: 8px 28px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; margin: 0 4px; }
    .print-actions .primary { background: #4f46e5; color: #fff; }
    .print-actions .primary:hover { background: #4338ca; }
    .print-actions .secondary { background: #6b7280; color: #fff; }
    .print-actions .secondary:hover { background: #4b5563; }
  }
  @media print {
    .print-actions { display: none !important; }
  }
`

export default function PrintOTClaimPage() {
  const supabase = createClient()
  const params = useParams()
  const id = params.id as string

  const [claim, setClaim] = useState<OTClaim | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const printTriggered = useRef(false)

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase.from('ot_claims').select('*').eq('id', id).single()
      if (err || !data) { setError('OT claim not found'); setLoading(false); return }
      setClaim(data as OTClaim)
      setLoading(false)
    }
    load()
  }, [id, supabase])

  useEffect(() => {
    if (loading || error || !claim || printTriggered.current) return
    printTriggered.current = true
    const monthLabel = format(new Date(claim.claim_month), 'MMMM yyyy')
    document.title = `OT CLAIM - ${claim.user_name.toUpperCase()} (${monthLabel})`
    const timer = setTimeout(() => window.print(), 600)
    return () => clearTimeout(timer)
  }, [loading, error, claim])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>Loading...</div>
  if (error || !claim) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial, sans-serif', color: 'red' }}>{error}</div>

  const monthDate = new Date(claim.claim_month)
  const monthLabel = format(monthDate, 'MMMM yyyy').toUpperCase()
  const monthNum = monthDate.getMonth() + 1

  const entryList: { row: number; entry: OTClaimEntry; dayLabel: string }[] = []
  let rowNum = 1
  for (const entry of claim.entries) {
    const d = new Date(entry.date)
    const dayLabel = `${d.getDate()}/${monthNum}`
    entryList.push({ row: rowNum++, entry, dayLabel })
  }

  const rows: { num: number; day: string; from: string; to: string; hours: string; nature: string }[] = []
  for (let i = 0; i < 31; i++) {
    if (i < entryList.length) {
      const { entry, dayLabel } = entryList[i]
      rows.push({
        num: i + 1,
        day: dayLabel,
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

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="print-actions">
        <button className="primary" onClick={() => window.print()}>Print / Save as PDF</button>
        <button className="secondary" onClick={() => window.history.back()}>Back</button>
      </div>

      <div id="ot-print">
        {/* Logo — same as job sheet */}
        <div className="logo-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/medexone-logo.png" alt="MedexOne Global" />
          <div className="logo-sub">
            <strong>MEDEXONE GLOBAL SDN. BHD.</strong> (564400-X)
          </div>
        </div>

        {/* Title */}
        <div className="title">OVERTIME CLAIM FORM</div>

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
