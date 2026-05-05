// WHY: Shared CRM import parsing logic. Used by:
//   - /api/crm-upload (legacy small-file path: server parses xlsx from FormData)
//   - app/(app)/settings/page.tsx (new path: browser parses xlsx, sends JSON batches
//     to bypass Vercel's 4.5 MB body limit on serverless functions)
// Keeping the parser here means there's one source of truth for column mapping,
// date/bool coercion, EINV merging, and homogenization of NOT NULL booleans.

import * as XLSX from 'xlsx'

// Required columns from spec Section 3
export const REQUIRED_COLUMNS = ['ACCT NO', 'CLINIC NAME']

// Column mapping: Excel column name → database field name (spec Section 3)
export const COLUMN_MAP: Record<string, string> = {
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
  'EMAIL ID 2': 'email_secondary',
  'LKEY Line 1': 'lkey_line1',
  'LKEY Line 2': 'lkey_line2',
  'LKEY Line 3': 'lkey_line3',
  'LKEY Line 4': 'lkey_line4',
  'LKEY Line 5': 'lkey_line5',
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
  'HYB LIVE DATE': 'hyb_live_date',
  'E-INV LIVE DATE': 'einv_live_date',
  'EINV PO RCVD DATE': 'einv_po_rcvd_date',
  'KIOSK PO DATE': 'kiosk_po_date',
  'KIOSK SURVEY FORM': 'kiosk_survey_form',
  'PC TOTAL': 'pc_total',
  'DB VERSION': 'db_version',
  'PRODUCT VERSION': 'product_version',
  'WSPP LIVE DATE': 'wspp_live_date',
  'MTN Important Note': 'mtn_important_note',
  'MTN Important Note_2': 'mtn_important_note_2',
  'MN/CLD/EINV RENEWAL RATE': 'mn_cld_einv_renewal_rate',
}

export const DATE_COLUMNS = new Set([
  'mtn_expiry', 'mtn_start', 'cloud_start', 'cloud_end', 'cms_install_date',
  'hyb_live_date', 'einv_live_date', 'einv_po_rcvd_date', 'kiosk_po_date',
  'wspp_live_date',
])

export const CRM_BOOL_COLUMNS = new Set(['kiosk_survey_form'])

// Excel dates can be DD/MM/YYYY, serial numbers, or JS Date objects.
// PostgreSQL needs YYYY-MM-DD.
export function fixDate(val: unknown): string | null {
  if (val == null || val === '') return null
  if (val instanceof Date) {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
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
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  return null
}

export function toStr(val: unknown): string | null {
  if (val == null || val === '') return null
  return String(val).trim() || null
}

export function toBool(val: unknown): boolean | null {
  if (val == null || val === '') return null
  if (typeof val === 'boolean') return val
  const s = String(val).trim().toLowerCase()
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false
  return null
}

export function cleanStr(val: unknown): string | null {
  const s = toStr(val)
  if (!s) return null
  if (['#REF!', '#N/A', '#VALUE!', '#NAME?', '#DIV/0!'].includes(s)) return null
  return s
}

// Excel headers can contain line breaks (e.g. "CMS   RUNNING NO.\nQUOTATION/PO").
// Normalize to single-line, single-space for reliable COLUMN_MAP matching.
export function normalizeHeaders(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(row => {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      const norm = key.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
      out[norm] = value
    }
    return out
  })
}

// The CRM sheet has duplicate header names (e.g. "MTN Important Note" at columns
// 45 AND 46 with different data per row). xlsx.sheet_to_json drops one on key
// collision. This reader dedupes by appending _2, _3... so every column survives.
export function readSheetWithDedupedHeaders(
  sheet: XLSX.WorkSheet,
  opts: { headerRow?: number } = {},
): Record<string, unknown>[] {
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

// EINV & WSPP (SST) sheet — second ingestion source on the same workbook.
export const EINV_SHEET_NAME = 'EINV & WSPP (SST)' // compare with .trim()
export const EINV_JOIN_KEY = 'ACC NO'

type EinvParser = 'str' | 'bool' | 'date'
export const EINV_COLUMN_MAP: Record<string, { dbCol: string; parser: EinvParser }> = {
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

export type EinvPayload = Record<string, string | boolean | null>

export function parseEinvRows(rows: Record<string, unknown>[]): Map<string, EinvPayload> {
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

    const v1 = payload.einv_v1_signed
    const v2 = payload.einv_v2_signed
    if (v1 === true || v2 === true) payload.has_e_invoice = true
    else if (v1 === false && v2 === false) payload.has_e_invoice = false

    payload.has_sst = payload.sst_registration_no != null

    byCode.set(code, payload)
  }

  return byCode
}

export type ClinicRow = Record<string, string | boolean | null>

export function parseRows(
  rows: Record<string, unknown>[],
  einvData: Map<string, EinvPayload>,
): ClinicRow[] {
  const normalized = normalizeHeaders(rows)
  return normalized
    .filter((row) => toStr(row['ACCT NO']))
    .map((row) => {
      const clinic: ClinicRow = {}
      for (const [csvCol, dbCol] of Object.entries(COLUMN_MAP)) {
        if (DATE_COLUMNS.has(dbCol)) {
          clinic[dbCol] = fixDate(row[csvCol])
        } else if (CRM_BOOL_COLUMNS.has(dbCol)) {
          clinic[dbCol] = toBool(row[csvCol])
        } else {
          clinic[dbCol] = toStr(row[csvCol])
        }
      }
      const code = clinic.clinic_code as string | null
      if (code && einvData.has(code)) {
        const einv = einvData.get(code)!
        for (const [k, v] of Object.entries(einv)) {
          if (v === undefined || v === null) continue
          clinic[k] = v
        }
      }
      // Homogenize NOT NULL boolean columns. supabase-js bulk upsert builds a
      // single INSERT from the UNION of all keys across the batch; rows missing
      // any column get NULL, which fails NOT NULL constraints.
      for (const col of ['has_e_invoice', 'has_sst', 'has_whatsapp'] as const) {
        if (clinic[col] === null || clinic[col] === undefined) clinic[col] = false
      }
      return clinic
    })
}

export interface ParsedWorkbook {
  ok: true
  clinics: ClinicRow[]
  einvSheetFound: boolean
  einvRowsMerged: number
}
export interface ParseError {
  ok: false
  error: string
}

// Parse a CRM xlsx workbook (ArrayBuffer) into the same shape the upload expects.
// Browser-safe: no NextRequest / no supabase / no fs.
export function parseCrmWorkbook(buffer: ArrayBuffer): ParsedWorkbook | ParseError {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'array' })
  } catch (err) {
    return { ok: false, error: 'Could not read xlsx: ' + (err as Error).message }
  }

  // Prefer 'CRM' sheet, fall back to first
  const sheetName = workbook.SheetNames.includes('CRM') ? 'CRM' : workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return { ok: false, error: 'No worksheet found in workbook' }

  const rows = readSheetWithDedupedHeaders(sheet, { headerRow: 0 })
  if (rows.length === 0) return { ok: false, error: 'No data rows found in CRM sheet' }

  const headers = Object.keys(rows[0] || {})
  const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col))
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Required column(s) missing: ${missing.join(', ')}. Found columns: ${headers.slice(0, 10).join(', ')}...`,
    }
  }

  let einvRows: Record<string, unknown>[] = []
  let einvSheetFound = false
  const einvSheetName = workbook.SheetNames.find((n) => n.trim() === EINV_SHEET_NAME)
  if (einvSheetName) {
    einvSheetFound = true
    const einvSheet = workbook.Sheets[einvSheetName]
    einvRows = readSheetWithDedupedHeaders(einvSheet, { headerRow: 1 })
  }

  const einvData = parseEinvRows(einvRows)
  const clinics = parseRows(rows, einvData)

  if (clinics.length === 0) return { ok: false, error: 'No valid clinic records found' }

  return { ok: true, clinics, einvSheetFound, einvRowsMerged: einvData.size }
}

// CSV parse path for callers that don't have the xlsx — same output shape.
// Uses a structural-typed parser argument so this module doesn't import papaparse.
export function parseCrmCsvRows(rows: Record<string, unknown>[]): ParsedWorkbook | ParseError {
  if (rows.length === 0) return { ok: false, error: 'No data rows in CSV' }
  const headers = Object.keys(rows[0] || {})
  const missing = REQUIRED_COLUMNS.filter((col) => !headers.includes(col))
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Required column(s) missing: ${missing.join(', ')}. Found columns: ${headers.slice(0, 10).join(', ')}...`,
    }
  }
  const clinics = parseRows(rows, new Map())
  if (clinics.length === 0) return { ok: false, error: 'No valid clinic records found' }
  return { ok: true, clinics, einvSheetFound: false, einvRowsMerged: 0 }
}

// Shared safety floor — stale-cleanup is skipped below this row count so a
// half-uploaded or test file can't nuke production data.
export const MIN_CLINICS_FOR_STALE_CLEANUP = 1000
