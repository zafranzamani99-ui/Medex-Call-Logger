#!/usr/bin/env node
/**
 * MEDEXCRM ↔ Call Logger clinic data audit.
 *
 * Compares two clinic exports by account number / clinic_code to find:
 *   1. Clinics in MEDEXCRM but NOT in call logger  → need to be migrated
 *   2. Clinics in call logger but NOT in MEDEXCRM  → review (new entries)
 *   3. Clinics in both with different field values → flagged for manual review
 *
 * Usage:
 *   node scripts/audit-crm-diff.mjs <medexcrm.xlsx|csv> <call-logger.xlsx|csv>
 *
 * How to get the two files:
 *   - MEDEXCRM:   open medexcrm.vercel.app → CRM Data tab → Export Selected (or select all + export)
 *   - Call Logger: open /crm → Columns menu → Export CSV button (or via /settings if different)
 *
 * Supports .xlsx, .xls, and .csv (via the xlsx library that's already a project dep).
 *
 * The report prints to stdout as Markdown — redirect to a file:
 *   node scripts/audit-crm-diff.mjs medexcrm.xlsx call-logger.csv > crm-audit.md
 */

import * as XLSX from 'xlsx'
import { readFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'

// ── Header normalization ────────────────────────────────────────────
//
// MEDEXCRM uses headers like "ACCT NO", "CLINIC NAME"; the call logger uses
// "Acct No", "Clinic Name" (or column IDs like "clinic_code").
// Normalize to lowercase-no-space so they compare cleanly.

const HEADER_ALIASES = {
  // acct_no canonical keys
  'acct_no': 'acct_no',
  'acctno': 'acct_no',
  'clinic_code': 'acct_no',
  'cliniccode': 'acct_no',
  'account_no': 'acct_no',
  'accountno': 'acct_no',

  'clinic_name': 'clinic_name',
  'clinicname': 'clinic_name',

  'clinic_phone': 'clinic_phone',
  'clinicphone': 'clinic_phone',
  'phone': 'clinic_phone',

  'state': 'state',
  'city': 'city',

  'mtn_start': 'mtn_start',
  'mtnstart': 'mtn_start',
  'cms_mhis_mtn_start_date': 'mtn_start',
  'mtn_expiry': 'mtn_expiry',
  'mtnexpiry': 'mtn_expiry',
  'mtnend': 'mtn_expiry',
  'cms_mhis_mtn_end_date': 'mtn_expiry',

  'renewal_status': 'renewal_status',
  'renewalstatus': 'renewal_status',
  'renewal_status_2': 'renewal_status',

  'product': 'product',
  'product_type': 'product_type',
  'producttype': 'product_type',

  'registered_contact': 'registered_contact',
  'registeredcontact': 'registered_contact',
  'contact_name': 'registered_contact',
  'contactname': 'registered_contact',

  'contact_tel': 'contact_tel',
  'contacttel': 'contact_tel',
  'contact_tel1': 'contact_tel',

  'email_main': 'email_main',
  'emailmain': 'email_main',
  'email_id_main': 'email_main',

  'email_secondary': 'email_secondary',
  'email_id_2': 'email_secondary',

  'company_name': 'company_name',
  'companyname': 'company_name',

  'company_reg': 'company_reg',
  'co_reg_brn': 'company_reg',
  'coregbrn': 'company_reg',
  'company_reg_brn': 'company_reg',

  'clinic_group': 'clinic_group',
  'group_name': 'clinic_group',
  'groupname': 'clinic_group',
  'group': 'clinic_group',

  'cloud_start': 'cloud_start',
  'cloudstart': 'cloud_start',
  'cloud_start_date': 'cloud_start',
  'cloud_end': 'cloud_end',
  'cloudend': 'cloud_end',
  'cloud_end_date': 'cloud_end',

  'm1g_dealer_case': 'm1g_dealer_case',
  'status_renewal': 'status_renewal',
  'remarks_followup': 'remarks_followup',
  'remarks_follow_up': 'remarks_followup',
}

// The subset of fields we compare for "drift" detection.
// (Don't include every column — some are auto-updated timestamps, notes, etc.)
const DRIFT_FIELDS = [
  'clinic_name',
  'clinic_phone',
  'state',
  'mtn_expiry',
  'renewal_status',
  'product_type',
  'product',
  'registered_contact',
  'contact_tel',
  'email_main',
  'company_name',
  'company_reg',
  'clinic_group',
  'cloud_end',
]

function normalizeHeader(h) {
  const key = String(h).toLowerCase().replace(/[\s_\-./]/g, '').replace(/[^a-z0-9]/g, '')
  return HEADER_ALIASES[key] || HEADER_ALIASES[String(h).toLowerCase().replace(/\s+/g, '_')] || null
}

// ── File reading ────────────────────────────────────────────────────

function readWorkbook(path) {
  if (!existsSync(path)) {
    console.error(`❌ File not found: ${path}`)
    process.exit(1)
  }
  const ext = path.toLowerCase().split('.').pop()
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    console.error(`❌ Unsupported file type: .${ext} (want .xlsx, .xls, or .csv)`)
    process.exit(1)
  }
  const buf = readFileSync(path)
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: false })
  // Prefer a sheet named "CRM" (MEDEXCRM format) — otherwise first sheet
  const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'crm') || wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
  if (rows.length < 2) {
    console.error(`❌ No data rows in ${path} (sheet "${sheetName}")`)
    process.exit(1)
  }
  return { rows, sheetName }
}

function parseRows({ rows, sheetName }, sourceLabel) {
  const rawHeaders = rows[0]
  const colMap = {}  // canonical key → column index
  rawHeaders.forEach((h, i) => {
    const key = normalizeHeader(h)
    if (key && !(key in colMap)) colMap[key] = i
  })

  if (!('acct_no' in colMap)) {
    console.error(`❌ ${sourceLabel}: no "Acct No" / "clinic_code" column found in sheet "${sheetName}".`)
    console.error(`   Headers seen: ${rawHeaders.slice(0, 20).join(', ')}...`)
    process.exit(1)
  }
  if (!('clinic_name' in colMap)) {
    console.error(`❌ ${sourceLabel}: no "Clinic Name" column found.`)
    process.exit(1)
  }

  const byAcct = new Map()
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const acct = String(row[colMap.acct_no] || '').trim().toUpperCase()
    if (!acct) continue
    const record = { _row: r + 1, _acct: acct }
    for (const [key, idx] of Object.entries(colMap)) {
      const val = row[idx]
      record[key] = val === null || val === undefined ? '' : String(val).trim()
    }
    if (byAcct.has(acct)) {
      record._duplicate = true
    }
    byAcct.set(acct, record)
  }
  return { byAcct, fieldsPresent: Object.keys(colMap) }
}

// ── Field comparison ────────────────────────────────────────────────

function valuesEqual(a, b) {
  const na = String(a ?? '').trim().toLowerCase()
  const nb = String(b ?? '').trim().toLowerCase()
  if (na === nb) return true
  // Treat various blank-like values as equal to each other
  const isBlank = (v) => v === '' || v === '—' || v === 'null' || v === 'n/a' || v === '-'
  if (isBlank(na) && isBlank(nb)) return true
  // Date normalization: 2024-12-31 vs 31/12/2024 vs 31-12-2024
  const datePattern = /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/
  if (datePattern.test(na) && datePattern.test(nb)) {
    const toDate = (s) => {
      const parts = s.split(/[-/]/)
      if (parts[0].length === 4) return parts.join('-')  // already ISO
      return [parts[2], parts[1], parts[0]].join('-')    // DD/MM/YYYY → YYYY-MM-DD
    }
    return toDate(na) === toDate(nb)
  }
  return false
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  const [, , medexPath, callLogPath] = process.argv
  if (!medexPath || !callLogPath) {
    console.error('Usage: node scripts/audit-crm-diff.mjs <medexcrm.xlsx|csv> <call-logger.xlsx|csv>')
    process.exit(1)
  }

  const medex = parseRows(readWorkbook(medexPath), 'MEDEXCRM')
  const callLog = parseRows(readWorkbook(callLogPath), 'Call Logger')

  const onlyInMedex = []     // need to import
  const onlyInCallLog = []   // new in call logger
  const driftedRows = []     // in both but fields differ
  const duplicates = []      // same acct_no appears twice in one source

  for (const record of medex.byAcct.values()) {
    if (record._duplicate) duplicates.push({ source: 'MEDEXCRM', ...record })
    const match = callLog.byAcct.get(record._acct)
    if (!match) {
      onlyInMedex.push(record)
    } else {
      const fieldDiffs = []
      for (const field of DRIFT_FIELDS) {
        if (!(field in record) || !(field in match)) continue
        if (!valuesEqual(record[field], match[field])) {
          fieldDiffs.push({ field, medex: record[field], callLog: match[field] })
        }
      }
      if (fieldDiffs.length > 0) {
        driftedRows.push({ acct: record._acct, name: record.clinic_name, diffs: fieldDiffs })
      }
    }
  }

  for (const record of callLog.byAcct.values()) {
    if (record._duplicate) duplicates.push({ source: 'Call Logger', ...record })
    if (!medex.byAcct.has(record._acct)) {
      onlyInCallLog.push(record)
    }
  }

  // ── Report (Markdown to stdout) ───────────────────────────────────
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const out = []
  out.push(`# CRM Audit Report`)
  out.push(`_Generated ${now}_`)
  out.push('')
  out.push(`- **MEDEXCRM source:** \`${basename(medexPath)}\` (${medex.byAcct.size.toLocaleString()} unique clinics)`)
  out.push(`- **Call Logger source:** \`${basename(callLogPath)}\` (${callLog.byAcct.size.toLocaleString()} unique clinics)`)
  out.push('')
  out.push(`## Summary`)
  out.push('')
  out.push(`| Category | Count | Action |`)
  out.push(`|---|---|---|`)
  out.push(`| In MEDEXCRM but NOT in Call Logger | **${onlyInMedex.length}** | Migrate — use "+ New Clinic" or CSV upload |`)
  out.push(`| In Call Logger but NOT in MEDEXCRM | ${onlyInCallLog.length} | Review — newer or test entries |`)
  out.push(`| In both, with drifted field values | **${driftedRows.length}** | Review drift — decide which is authoritative |`)
  out.push(`| Duplicate \`acct_no\` within a single source | ${duplicates.length} | Fix at source |`)
  out.push('')

  // Missing clinics (the big one)
  if (onlyInMedex.length > 0) {
    out.push(`## 🔴 Clinics in MEDEXCRM but NOT in Call Logger`)
    out.push(`These need to be manually added or re-imported via CSV before retiring MEDEXCRM.`)
    out.push('')
    out.push(`| Acct No | Clinic Name | State | Product | MTN Expiry |`)
    out.push(`|---|---|---|---|---|`)
    for (const r of onlyInMedex.slice(0, 500)) {
      out.push(`| \`${r.acct_no}\` | ${r.clinic_name || '—'} | ${r.state || '—'} | ${r.product_type || r.product || '—'} | ${r.mtn_expiry || '—'} |`)
    }
    if (onlyInMedex.length > 500) out.push(`\n_...and ${onlyInMedex.length - 500} more. Full list in CSV — see "Next step" below._`)
    out.push('')
  }

  // Extras
  if (onlyInCallLog.length > 0) {
    out.push(`## 🟡 Clinics in Call Logger but NOT in MEDEXCRM`)
    out.push(`Probably new entries made directly in the Call Logger. No action needed unless you expected them in MEDEXCRM.`)
    out.push('')
    out.push(`| Acct No | Clinic Name | State |`)
    out.push(`|---|---|---|`)
    for (const r of onlyInCallLog.slice(0, 200)) {
      out.push(`| \`${r.acct_no}\` | ${r.clinic_name || '—'} | ${r.state || '—'} |`)
    }
    if (onlyInCallLog.length > 200) out.push(`\n_...and ${onlyInCallLog.length - 200} more._`)
    out.push('')
  }

  // Drift
  if (driftedRows.length > 0) {
    out.push(`## 🟠 Field Drift (same clinic, different values)`)
    out.push(`For each drifted clinic, the **MEDEXCRM** value is on the left, the **Call Logger** value on the right. Decide which source is authoritative and update the other.`)
    out.push('')
    for (const row of driftedRows.slice(0, 300)) {
      out.push(`### \`${row.acct}\` — ${row.name}`)
      out.push(`| Field | MEDEXCRM | Call Logger |`)
      out.push(`|---|---|---|`)
      for (const d of row.diffs) {
        out.push(`| ${d.field} | ${d.medex || '—'} | ${d.callLog || '—'} |`)
      }
      out.push('')
    }
    if (driftedRows.length > 300) out.push(`\n_...and ${driftedRows.length - 300} more drifted clinics._`)
    out.push('')
  }

  // Duplicates
  if (duplicates.length > 0) {
    out.push(`## ⚠️ Duplicate Account Numbers`)
    out.push(`Same \`acct_no\` appears more than once in a single source. These should be deduped at the source.`)
    out.push('')
    out.push(`| Source | Acct No | Clinic Name |`)
    out.push(`|---|---|---|`)
    for (const d of duplicates) {
      out.push(`| ${d.source} | \`${d.acct_no}\` | ${d.clinic_name || '—'} |`)
    }
    out.push('')
  }

  out.push(`## Next step`)
  out.push('')
  if (onlyInMedex.length > 0) {
    out.push(`1. Export the **"in MEDEXCRM only"** list above into a CSV that matches your Call Logger's CRM upload format (headers: \`ACCT NO\`, \`CLINIC NAME\`, \`STATE\`, etc.).`)
    out.push(`2. Upload via **Settings → CRM Data Upload** — it'll insert the missing clinics without touching existing ones (upsert by \`clinic_code\`).`)
    out.push(`3. Re-run this audit to confirm the list is empty.`)
  } else {
    out.push(`✅ No missing clinics. MEDEXCRM can be retired after any drifted-field review is resolved.`)
  }

  process.stdout.write(out.join('\n') + '\n')
}

main()
