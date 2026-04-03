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
  'EMAIL ID2': 'email_secondary',
  'LKEY Line 1': 'lkey_line1',
  'LKEY Line 2': 'lkey_line2',
  'LKEY Line 3': 'lkey_line3',
  'LKEY Line 4': 'lkey_line4',
  'LKEY Line 5': 'lkey_line5',
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

function parseRows(rows: Record<string, unknown>[]): Record<string, string | null>[] {
  return rows
    .filter((row) => toStr(row['ACCT NO']))
    .map((row) => {
      const clinic: Record<string, string | null> = {}
      for (const [csvCol, dbCol] of Object.entries(COLUMN_MAP)) {
        // Date columns need raw value (could be Excel serial number)
        if (dbCol === 'mtn_expiry' || dbCol === 'mtn_start') {
          clinic[dbCol] = fixDate(row[csvCol])
        } else {
          clinic[dbCol] = toStr(row[csvCol])
        }
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
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
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

    // Map rows to clinic records
    const clinics = parseRows(rows)

    if (clinics.length === 0) {
      return NextResponse.json(
        { error: 'No valid clinic records found' },
        { status: 400 }
      )
    }

    // WHY: Upsert instead of delete+insert. The old approach (delete all → insert)
    // was risky: if insert failed mid-batch, the clinics table was left empty/partial.
    // Upsert: existing clinic_code → update, new clinic_code → insert. Safe on failure.
    const uploadStart = new Date().toISOString()
    const BATCH_SIZE = 500
    let upsertedCount = 0

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
    await supabase.from('clinics').delete().lt('updated_at', uploadStart)

    const insertedCount = upsertedCount

    return NextResponse.json({
      success: true,
      count: insertedCount,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Unexpected error: ' + (err as Error).message },
      { status: 500 }
    )
  }
}
