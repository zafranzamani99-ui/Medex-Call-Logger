import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// WHY: Server-side CRM upload route — spec Section 5.7 (UC-19).
// Uses service role key to bypass RLS (needed for bulk delete).
//
// MY ADDITION: Supports BOTH .xlsx and .csv files.
// WHY: The actual CRM file is an Excel workbook (CRM 2026.xlsx), not a CSV.
// The original spec assumed CSV, but forcing agents to manually export to CSV
// is an unnecessary extra step. Now they can upload the .xlsx directly.
//
// For .xlsx: reads the "CRM" sheet (or first sheet if not found).
// For .csv: parses with PapaParse as before.

// Required columns from spec Section 3
const REQUIRED_COLUMNS = ['ACCT NO', 'CLINIC NAME']

// Column mapping: Excel column name → database field name (spec Section 3)
const COLUMN_MAP: Record<string, string> = {
  'ACCT NO': 'clinic_code',
  'CLINIC NAME': 'clinic_name',
  'PHONE': 'clinic_phone',
  'CMS/MHIS MTN START DATE': 'mtn_start',
  'CMS/MHIS MTN END DATE': 'mtn_expiry',
  'RENEWAL STATUS 2': 'renewal_status',
  'PRODUCT TYPE': 'product_type',
  'Address2': 'city',
  'State': 'state',
  'Contact Name': 'registered_contact',
  'Support Name': 'support_name',
  'CUSTOMER STATUS 2': 'customer_status',
  'EMAIL ID MAIN': 'email_main',
  'EMAIL ID 2': 'email_secondary',  // Bug fix: xlsx header has a space, old map had "EMAIL ID2"
  'LKEY Line 1': 'lkey_line1',
  'LKEY Line 2': 'lkey_line2',
  'LKEY Line 3': 'lkey_line3',
  'LKEY Line 4': 'lkey_line4',
  'LKEY Line 5': 'lkey_line5',
  // Extended CRM columns (26 — full Excel file)
  'CLOUD START DATE': 'cloud_start',
  'CLOUD END DATE': 'cloud_end',
  'M1G/ DEALER CASE': 'm1g_dealer_case',
  'PASS TO DEALER/M1G': 'pass_to_dealer',
  'PRODUCT': 'product',
  'Signed-up': 'signed_up',
  'CMS RUNNING NO. QUOTATION/PO': 'cms_running_no',
  'GROUP': 'clinic_group',
  'COMPANY NAME': 'company_name',
  'CO. REG & BRN': 'company_reg',
  'Remark (rate for additional pc)': 'remark_additional_pc',
  'Customer ID- Certificate No.': 'customer_cert_no',
  'CMS INSTALL DATE/LIVE DATE': 'cms_install_date',
  'Address1': 'address1',
  'Address3': 'address3',
  'Address4': 'address4',
  'Contact Tel1': 'contact_tel',
  'RACE': 'race',
  'InvoiceNo-CMS/MTN/CLD (key in by Celine)': 'invoice_no',
  'Billing Address / AAMS ACC NO': 'billing_address',
  'Account Manager': 'account_manager',
  'Info': 'info',
  'Type': 'clinic_type',
  'Reason not using E-INV': 'einv_no_reason',
  'STATUS RENEWAL': 'status_renewal',
  'REMARKS - FOLLOW UP': 'remarks_followup',
  // CRM-sheet columns added for 1:1 xlsx parity (migration 067)
  'HYB LIVE DATE': 'hyb_live_date',
  'E-INV LIVE DATE': 'einv_live_date',
  'EINV PO RCVD DATE': 'einv_po_rcvd_date',
  'KIOSK PO DATE': 'kiosk_po_date',
  'KIOSK SURVEY FORM': 'kiosk_survey_form',
  'PC TOTAL': 'pc_total',
  'DB VERSION': 'db_version',
  'PRODUCT VERSION': 'product_version',
  // Final columns for 1:1 xlsx parity (migration 068)
  'WSPP LIVE DATE': 'wspp_live_date',
  'MTN Important Note': 'mtn_important_note',
  // Duplicate-header handling: the CRM sheet has TWO "MTN Important Note" columns
  // at positions 45 and 46 with different data. Our xlsx reader dedupes by
  // appending "_2" to subsequent occurrences — see readSheetWithDedupedHeaders.
  'MTN Important Note_2': 'mtn_important_note_2',
  'MN/CLD/EINV RENEWAL RATE': 'mn_cld_einv_renewal_rate',
}

// WHY: Excel dates can be DD/MM/YYYY, serial numbers, or JS Date objects.
// PostgreSQL needs YYYY-MM-DD.
function fixDate(val: unknown): string | null {
  if (val == null || val === '') return null

  // JS Date object (when xlsx cellDates is true, or raw Date)
  if (val instanceof Date) {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // Excel serial number — a plain number like 40454 (days since 1899-12-30)
  if (typeof val === 'number' && val > 1000 && val < 100000) {
    // Excel epoch is 1899-12-30 (with the 1900 leap year bug)
    const excelEpoch = new Date(1899, 11, 30)
    const date = new Date(excelEpoch.getTime() + val * 86400000)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const str = String(val).trim()
  if (!str) return null
  // Already ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)
  // DD/MM/YYYY or D/M/YYYY
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  return null // unparseable → null (don't crash the whole upload)
}

// WHY: xlsx returns numbers, dates, booleans — not just strings.
// Must convert everything to string before .trim(), or it crashes.
function toStr(val: unknown): string | null {
  if (val == null || val === '') return null
  return String(val).trim() || null
}

// WHY: Excel headers can contain line breaks (e.g. "CMS   RUNNING NO.\nQUOTATION/PO").
// Normalize to single-line, single-space for reliable COLUMN_MAP matching.
function normalizeHeaders(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(row => {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      const norm = key.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
      out[norm] = value
    }
    return out
  })
}

// WHY: The CRM sheet has duplicate header names (e.g. "MTN Important Note" at
// columns 45 AND 46 with different data per row). xlsx.sheet_to_json drops one
// on key collision. This helper reads the sheet by index, dedupes headers by
// appending _2, _3... to subsequent occurrences, and rebuilds row objects so
// every xlsx column survives.
function readSheetWithDedupedHeaders(sheet: XLSX.WorkSheet, opts: { headerRow?: number } = {}): Record<string, unknown>[] {
  const headerRow = opts.headerRow ?? 0
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false })
  if (!matrix.length || headerRow >= matrix.length) return []

  const rawHeaders = matrix[headerRow]
  const seen = new Map<string, number>()
  const headers: (string | null)[] = rawHeaders.map((h) => {
    if (h == null || h === '') return null
    const norm = String(h).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (!norm) return null
    const count = seen.get(norm) ?? 0
    seen.set(norm, count + 1)
    return count === 0 ? norm : `${norm}_${count + 1}`
  })

  const rows: Record<string, unknown>[] = []
  for (let i = headerRow + 1; i < matrix.length; i++) {
    const row = matrix[i]
    const obj: Record<string, unknown> = {}
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c]
      if (!key) continue
      obj[key] = row[c]
    }
    rows.push(obj)
  }
  return rows
}

const DATE_COLUMNS = new Set([
  'mtn_expiry', 'mtn_start', 'cloud_start', 'cloud_end', 'cms_install_date',
  // migration 067
  'hyb_live_date', 'einv_live_date', 'einv_po_rcvd_date', 'kiosk_po_date',
  // migration 068
  'wspp_live_date',
])

// CRM-sheet columns that are boolean checkboxes in Excel, not text
const CRM_BOOL_COLUMNS = new Set(['kiosk_survey_form'])

// ============================================================================
// EINV & WSPP (SST) sheet — second ingestion source
// ============================================================================
// WHY: The xlsx has a second tab with E-Invoice V1/V2 signup, WhatsApp setup,
// SST registration/period, fee/payment status, and portal credentials. These
// have never been imported — this merge is additive.
//
// Data quirks handled:
// - Sheet name has trailing space: 'EINV & WSPP (SST) ' — match via .trim()
// - Headers are on row 2 (not row 1) — use { range: 1 } in sheet_to_json
// - Headers have embedded \n (e.g. 'E-INV V1\n(RM699-setup)') which
//   normalizeHeaders collapses to single spaces — mapping keys use that form
// - Cells contain #REF!/#N/A errors — filtered to null

const EINV_SHEET_NAME = 'EINV & WSPP (SST)' // compare with .trim()
const EINV_JOIN_KEY = 'ACC NO' // differs from CRM sheet's 'ACCT NO'

// xlsx normalized header → (db column, parser type)
type EinvParser = 'str' | 'bool' | 'date'
const EINV_COLUMN_MAP: Record<string, { dbCol: string; parser: EinvParser }> = {
  'SST Registered no': { dbCol: 'sst_registration_no', parser: 'str' },
  'Tarikh Kuatkuasa Pendaftaran': { dbCol: 'sst_start_date', parser: 'date' },
  'Tempoh bercukai (1 or 2mnth)': { dbCol: 'sst_frequency', parser: 'str' },
  'Tempoh Bercukai Beikutnya (1 or 2mnth)': { dbCol: 'sst_period_next', parser: 'str' },
  'E-INV V1 (RM699-setup)': { dbCol: 'einv_v1_signed', parser: 'bool' },
  'E-INV V2 (RM500-Yearly Hosting)': { dbCol: 'einv_v2_signed', parser: 'bool' },
  'WHATSAPP SETUP (RM500-Yearly Hosting)': { dbCol: 'has_whatsapp', parser: 'bool' },
  'STATUS INSTALLATION': { dbCol: 'einv_install_status', parser: 'str' },
  'Username PSW: Medexone@603 / Medex@603': { dbCol: 'einv_portal_credentials', parser: 'str' },
  'INSTALL DATE (E-INV V2)': { dbCol: 'einv_install_date', parser: 'date' },
  'Set up fee RM699': { dbCol: 'einv_setup_fee_status', parser: 'str' },
  'Hosting fee status RM500': { dbCol: 'einv_hosting_fee_status', parser: 'str' },
  'Payment Date (only Hosting)': { dbCol: 'einv_payment_date', parser: 'date' },
}

function toBool(val: unknown): boolean | null {
  if (val == null || val === '') return null
  if (typeof val === 'boolean') return val
  const s = String(val).trim().toLowerCase()
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false
  return null
}

function cleanStr(val: unknown): string | null {
  const s = toStr(val)
  if (!s) return null
  // Filter Excel error sentinels
  if (['#REF!', '#N/A', '#VALUE!', '#NAME?', '#DIV/0!'].includes(s)) return null
  return s
}

type EinvPayload = Record<string, string | boolean | null>

function parseEinvRows(rows: Record<string, unknown>[]): Map<string, EinvPayload> {
  const normalized = normalizeHeaders(rows)
  const byCode = new Map<string, EinvPayload>()

  for (const row of normalized) {
    const code = cleanStr(row[EINV_JOIN_KEY])
    if (!code) continue

    const payload: EinvPayload = {}
    for (const [xlsxHeader, { dbCol, parser }] of Object.entries(EINV_COLUMN_MAP)) {
      const raw = row[xlsxHeader]
      if (parser === 'bool') payload[dbCol] = toBool(raw)
      else if (parser === 'date') payload[dbCol] = fixDate(raw)
      else payload[dbCol] = cleanStr(raw)
    }

    // Derived flags. NULL semantics: only set when we have positive signal.
    const v1 = payload.einv_v1_signed
    const v2 = payload.einv_v2_signed
    if (v1 === true || v2 === true) payload.has_e_invoice = true
    else if (v1 === false && v2 === false) payload.has_e_invoice = false
    // else leave undefined → not included in payload → Supabase won't touch it

    payload.has_sst = payload.sst_registration_no != null

    byCode.set(code, payload)
  }

  return byCode
}

function parseRows(
  rows: Record<string, unknown>[],
  einvData: Map<string, EinvPayload>,
): Record<string, string | boolean | null>[] {
  const normalized = normalizeHeaders(rows)
  return normalized
    .filter((row) => toStr(row['ACCT NO']))
    .map((row) => {
      const clinic: Record<string, string | boolean | null> = {}
      for (const [csvCol, dbCol] of Object.entries(COLUMN_MAP)) {
        if (DATE_COLUMNS.has(dbCol)) {
          clinic[dbCol] = fixDate(row[csvCol])
        } else if (CRM_BOOL_COLUMNS.has(dbCol)) {
          clinic[dbCol] = toBool(row[csvCol])
        } else {
          clinic[dbCol] = toStr(row[csvCol])
        }
      }
      // Merge EINV fields for clinics that appear in the EINV sheet.
      // Skip undefined AND null — blank xlsx cells mean "no signal", preserve existing.
      const code = clinic.clinic_code as string | null
      if (code && einvData.has(code)) {
        const einv = einvData.get(code)!
        for (const [k, v] of Object.entries(einv)) {
          if (v === undefined || v === null) continue
          clinic[k] = v
        }
      }
      // Homogenize NOT NULL boolean columns across every row in the batch.
      // WHY: supabase-js bulk upsert builds a single INSERT from the UNION of
      // all keys across the batch. Rows missing any column get NULL for that
      // column — which fails NOT NULL constraints on has_e_invoice/has_sst/
      // has_whatsapp (migration 041). Explicitly defaulting them to false
      // on every row gives supabase-js a homogeneous schema and lets INSERTs
      // for new clinics succeed. xlsx is the source of truth, so false when
      // the EINV sheet has no data is the correct semantics.
      for (const col of ['has_e_invoice', 'has_sst', 'has_whatsapp'] as const) {
        if (clinic[col] === null || clinic[col] === undefined) clinic[col] = false
      }
      return clinic
    })
}

export async function POST(request: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Service role key not configured' },
        { status: 500 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    )

    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const fileName = file.name.toLowerCase()
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
    let rows: Record<string, unknown>[] = []
    let einvRows: Record<string, unknown>[] = []
    let einvSheetFound = false

    if (isExcel) {
      // Parse Excel file
      // WHY: Read as ArrayBuffer, then use xlsx to parse the workbook.
      // Prefer the "CRM" sheet since that's where clinic data lives in the actual file.
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })

      // Try to find the "CRM" sheet, fall back to first sheet
      const sheetName = workbook.SheetNames.includes('CRM')
        ? 'CRM'
        : workbook.SheetNames[0]

      const sheet = workbook.Sheets[sheetName]
      // WHY: readSheetWithDedupedHeaders handles the duplicate "MTN Important Note"
      // headers at columns 45/46 by appending "_2" to the second one.
      rows = readSheetWithDedupedHeaders(sheet, { headerRow: 0 })

      // EINV & WSPP (SST) sheet — match trimmed (the real sheet name has a trailing space).
      // Headers are on row 2 (not row 1) → use headerRow: 1 (0-indexed).
      const einvSheetName = workbook.SheetNames.find(
        (n) => n.trim() === EINV_SHEET_NAME,
      )
      if (einvSheetName) {
        einvSheetFound = true
        const einvSheet = workbook.Sheets[einvSheetName]
        einvRows = readSheetWithDedupedHeaders(einvSheet, { headerRow: 1 })
      }
    } else {
      // Parse CSV
      const csvText = await file.text()
      const result = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim(),
      })

      if (result.errors.length > 0) {
        return NextResponse.json(
          { error: 'CSV parsing error: ' + result.errors[0].message },
          { status: 400 }
        )
      }
      rows = result.data as Record<string, unknown>[]
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No data found in file' },
        { status: 400 }
      )
    }

    // Validate required columns
    const headers = Object.keys(rows[0] || {})
    const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col))
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Required column(s) missing: ${missing.join(', ')}. Found columns: ${headers.slice(0, 10).join(', ')}...` },
        { status: 400 }
      )
    }

    // Build EINV merge map (empty if sheet not present — CSV path or older xlsx).
    const einvData = parseEinvRows(einvRows)

    // Map rows to clinic records (merges EINV fields inline for matched clinic_codes).
    const clinics = parseRows(rows, einvData)

    if (clinics.length === 0) {
      return NextResponse.json(
        { error: 'No valid clinic records found' },
        { status: 400 }
      )
    }

    // SAFETY: abort before stale cleanup if CRM sheet looks suspiciously small.
    // WHY: the existing flow deletes every clinic with updated_at < uploadStart after upsert.
    // A partial CSV/xlsx (e.g. test file with 10 rows) would nuke the other ~3,900 clinics.
    // 1000 is a generous floor — the production file has ~3,900.
    const MIN_CLINICS_FOR_STALE_CLEANUP = 1000
    const willRunStaleCleanup = clinics.length >= MIN_CLINICS_FOR_STALE_CLEANUP

    // WHY: Upsert instead of delete+insert. The old approach (delete all → insert)
    // was risky: if insert failed mid-batch, the clinics table was left empty/partial.
    // Upsert: existing clinic_code → update, new clinic_code → insert. Safe on failure.
    //
    // IMPORTANT: Operational fields (workstation_count, ultraviewer_id, ram, etc.)
    // are NOT included in the upsert payload — they only contain CRM-imported columns.
    // Supabase upsert only touches specified columns, so agent-managed operational data
    // is preserved across uploads. See sql/041_clinic_operational_fields.sql.
    const uploadStart = new Date().toISOString()
    const BATCH_SIZE = 500
    let upsertedCount = 0

    // WHY: clinics has no trigger to auto-update `updated_at` on UPDATE (unlike
    // tickets — see migration 003). Without explicit assignment, UPSERT's UPDATE
    // path leaves the column at its old value, and the stale-cleanup DELETE below
    // wipes rows we just upserted in this same request if their prior updated_at
    // happens to be older than uploadStart. Stamping every upsert payload with
    // uploadStart gives stale-cleanup a clean "touched this run" marker (uploadStart
    // == updated_at so "updated_at < uploadStart" is false for upserted rows).
    for (const c of clinics) {
      c.updated_at = uploadStart
    }

    for (let i = 0; i < clinics.length; i += BATCH_SIZE) {
      const batch = clinics.slice(i, i + BATCH_SIZE)
      const { error: upsertError } = await supabase
        .from('clinics')
        .upsert(batch, { onConflict: 'clinic_code' })

      if (upsertError) {
        return NextResponse.json(
          {
            error: `Upsert failed at batch ${Math.floor(i / BATCH_SIZE) + 1}: ${upsertError.message}`,
            processedSoFar: upsertedCount,
          },
          { status: 500 }
        )
      }
      upsertedCount += batch.length
    }

    // Remove clinics not touched by this upload (no longer in CRM)
    // WHY: Upserted rows have updated_at >= uploadStart. Stale rows are older.
    // NOTE: This deletes clinics removed from the external CRM, including their
    // operational data (UV/AD IDs, workstation count, etc.). This is by design —
    // if a clinic is no longer a customer, remove it. The audit_log preserves
    // the last known state for recovery if needed.
    // SAFETY: skipped for small files (see MIN_CLINICS_FOR_STALE_CLEANUP).
    if (willRunStaleCleanup) {
      await supabase.from('clinics').delete().lt('updated_at', uploadStart)
    }

    const insertedCount = upsertedCount

    return NextResponse.json({
      success: true,
      count: insertedCount,
      einvSheetFound,
      einvRowsMerged: einvData.size,
      staleCleanupRan: willRunStaleCleanup,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Unexpected error: ' + (err as Error).message },
      { status: 500 }
    )
  }
}
