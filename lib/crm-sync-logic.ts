import { createClient } from '@supabase/supabase-js'
import { crmSupabase } from '@/lib/crmClient'
import {
  COLUMN_MAP,
  DATE_COLUMNS,
  CRM_BOOL_COLUMNS,
  fixDate,
  toStr,
  toBool,
  cleanStr,
  MIN_CLINICS_FOR_STALE_CLEANUP,
  type ClinicRow,
} from '@/lib/crm-import'

// ── Constants ────────────────────────────────────────────────────────────────

const PROTECTED_BOOL_COLUMNS = ['has_e_invoice', 'has_sst', 'has_whatsapp'] as const

const CRM_EXTRA_KEYS: Record<string, string> = {
  'Invoice No': 'invoice_no',
  'MTN Important Note (2)': 'mtn_important_note_2',
  'MTN Important Note_1': 'mtn_important_note_2',
}

const PAGE_SIZE = 1000
const BATCH_SIZE = 1000

// ── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = ReturnType<typeof createClient<any, any, any>>

export type SyncChange = {
  type: 'added' | 'updated' | 'removed'
  clinic_code: string
  clinic_name: string
  fields?: string[] // only for 'updated' type
}

export interface SyncResult {
  success: boolean
  totalContacts: number
  mapped: number
  skipped: number
  upserted: number
  errors: number
  staleCleanupRan: boolean
  changes: SyncChange[]
  timestamp: string
  duration_ms: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function adminClient(): LooseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ) as LooseClient
}

function mapContactToClinic(data: Record<string, unknown>): ClinicRow | null {
  const acctNo = cleanStr(data['ACCT NO'])
  const clinicName = cleanStr(data['CLINIC NAME'])
  if (!acctNo || !clinicName) return null
  if (acctNo.startsWith('__EMPTY')) return null

  const clinic: ClinicRow = {}

  // Map using COLUMN_MAP (primary — same Excel headers)
  for (const [jsonbKey, dbCol] of Object.entries(COLUMN_MAP)) {
    const raw = data[jsonbKey]
    if (raw === undefined) continue
    if (DATE_COLUMNS.has(dbCol)) {
      clinic[dbCol] = fixDate(raw)
    } else if (CRM_BOOL_COLUMNS.has(dbCol)) {
      clinic[dbCol] = toBool(raw)
    } else {
      clinic[dbCol] = toStr(raw)
    }
  }

  // Map CRM-specific keys that differ from our Excel headers
  for (const [jsonbKey, dbCol] of Object.entries(CRM_EXTRA_KEYS)) {
    if (clinic[dbCol] !== undefined && clinic[dbCol] !== null) continue
    const raw = data[jsonbKey]
    if (raw === undefined) continue
    if (DATE_COLUMNS.has(dbCol)) {
      clinic[dbCol] = fixDate(raw)
    } else if (CRM_BOOL_COLUMNS.has(dbCol)) {
      clinic[dbCol] = toBool(raw)
    } else {
      clinic[dbCol] = toStr(raw)
    }
  }

  // Homogenize NOT NULL boolean columns
  for (const col of PROTECTED_BOOL_COLUMNS) {
    if (clinic[col] === null || clinic[col] === undefined) clinic[col] = false
  }

  return clinic
}

// ── Data fetching ────────────────────────────────────────────────────────────

async function fetchAllCrmContacts(): Promise<{ id: number; data: Record<string, unknown> }[]> {
  // First, get total count
  const { count, error: countError } = await crmSupabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })

  if (countError) {
    throw new Error(`CRM count failed: ${countError.message}`)
  }
  if (!count || count === 0) return []

  // Fetch all pages in parallel
  const totalPages = Math.ceil(count / PAGE_SIZE)
  const pagePromises = Array.from({ length: totalPages }, (_, i) => {
    const start = i * PAGE_SIZE
    return crmSupabase
      .from('contacts')
      .select('id, data')
      .order('id', { ascending: true })
      .range(start, start + PAGE_SIZE - 1)
  })

  const results = await Promise.all(pagePromises)

  const allContacts: { id: number; data: Record<string, unknown> }[] = []
  for (const result of results) {
    if (result.error) {
      throw new Error(`CRM fetch failed: ${result.error.message}`)
    }
    if (result.data) {
      allContacts.push(...(result.data as { id: number; data: Record<string, unknown> }[]))
    }
  }

  return allContacts
}

async function fetchAllExisting(supabase: LooseClient): Promise<Record<string, unknown>[]> {
  const PAGE = 1000
  const all: Record<string, unknown>[] = []
  let offset = 0
  while (true) {
    const { data } = await supabase
      .from('clinics')
      .select('*')
      .order('clinic_code')
      .range(offset, offset + PAGE - 1)
    if (!data || data.length === 0) break
    all.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}

// ── Change detection ─────────────────────────────────────────────────────────

/** Treat null, undefined, and '' as equivalent "empty". */
function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

function detectChanges(
  incomingClinics: ClinicRow[],
  existingRows: Record<string, unknown>[],
  staleCleanupWillRun: boolean,
): SyncChange[] {
  const changes: SyncChange[] = []

  // Build maps
  const existingMap = new Map<string, Record<string, unknown>>()
  for (const row of existingRows) {
    existingMap.set(row.clinic_code as string, row)
  }

  const incomingMap = new Map<string, ClinicRow>()
  for (const clinic of incomingClinics) {
    incomingMap.set(clinic.clinic_code as string, clinic)
  }

  // Fields to exclude from comparison
  const excludeFields = new Set(['updated_at', ...PROTECTED_BOOL_COLUMNS])

  // Check incoming against existing
  for (const clinic of incomingClinics) {
    const code = clinic.clinic_code as string
    const name = (clinic.clinic_name as string) || ''
    const existing = existingMap.get(code)

    if (!existing) {
      changes.push({ type: 'added', clinic_code: code, clinic_name: name })
    } else {
      // Compare fields
      const changedFields: string[] = []
      for (const field of Object.keys(clinic)) {
        if (excludeFields.has(field)) continue
        const inVal = clinic[field]
        const exVal = existing[field]
        // Both empty → equal
        if (isEmpty(inVal) && isEmpty(exVal)) continue
        // One empty, other not → changed
        if (isEmpty(inVal) !== isEmpty(exVal)) {
          changedFields.push(field)
          continue
        }
        // Both non-empty — compare as same types
        if (String(inVal) !== String(exVal)) {
          changedFields.push(field)
        }
      }
      if (changedFields.length > 0) {
        changes.push({
          type: 'updated',
          clinic_code: code,
          clinic_name: name,
          fields: changedFields,
        })
      }
    }
  }

  // Check for removals (only if stale cleanup will run)
  if (staleCleanupWillRun) {
    existingMap.forEach((row, code) => {
      if (!incomingMap.has(code)) {
        changes.push({
          type: 'removed',
          clinic_code: code,
          clinic_name: (row.clinic_name as string) || '',
        })
      }
    })
  }

  return changes
}

// ── Main sync function ───────────────────────────────────────────────────────

export async function performCrmSync(trigger: 'manual' | 'cron'): Promise<SyncResult> {
  const startTime = Date.now()

  // Fetch CRM contacts and existing clinics in parallel
  const supabase = adminClient()
  const [allContacts, existingRows] = await Promise.all([
    fetchAllCrmContacts(),
    fetchAllExisting(supabase),
  ])

  if (allContacts.length === 0) {
    throw new Error('No contacts found in CRM')
  }

  // Deduplicate by ACCT NO — keep the latest (highest id) per code
  const byAcctNo = new Map<string, ClinicRow>()
  let skipped = 0

  for (const contact of allContacts) {
    if (!contact.data || typeof contact.data !== 'object') { skipped++; continue }
    const clinic = mapContactToClinic(contact.data as Record<string, unknown>)
    if (!clinic || !clinic.clinic_code) { skipped++; continue }
    const code = clinic.clinic_code as string
    byAcctNo.set(code, clinic)
  }

  const clinics = Array.from(byAcctNo.values())
  if (clinics.length === 0) {
    throw new Error('No valid clinic records after mapping')
  }

  // Detect changes before upserting
  const staleCleanupWillRun = clinics.length >= MIN_CLINICS_FOR_STALE_CLEANUP
  const detectedChanges = detectChanges(clinics, existingRows, staleCleanupWillRun)

  // Build existing map for protected boolean preservation
  const existingBoolMap = new Map<string, Record<string, unknown>>()
  for (const row of existingRows) {
    existingBoolMap.set(row.clinic_code as string, row)
  }

  // Upsert into our clinics table
  const syncStart = new Date().toISOString()
  let upserted = 0
  let errors = 0

  for (let i = 0; i < clinics.length; i += BATCH_SIZE) {
    const batch = clinics.slice(i, i + BATCH_SIZE)
    for (const c of batch) {
      c.updated_at = syncStart
      const existing = existingBoolMap.get(c.clinic_code as string)
      if (!existing) continue
      for (const col of PROTECTED_BOOL_COLUMNS) {
        if (existing[col] !== null && existing[col] !== undefined) {
          c[col] = existing[col] as boolean
        }
      }
    }
    const { error } = await (supabase as LooseClient)
      .from('clinics')
      .upsert(batch, { onConflict: 'clinic_code' })
    if (error) {
      console.error(`[crm-sync] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message)
      errors++
    } else {
      upserted += batch.length
    }
  }

  // Stale cleanup — remove clinics not in the CRM
  let staleCleanupRan = false
  if (staleCleanupWillRun) {
    const { error: cleanupErr } = await (supabase as LooseClient)
      .from('clinics')
      .delete()
      .lt('updated_at', syncStart)
    if (cleanupErr) {
      console.error('[crm-sync] Stale cleanup failed:', cleanupErr.message)
    } else {
      staleCleanupRan = true
    }
  }

  // Save sync log
  const durationMs = Date.now() - startTime
  await (supabase as LooseClient).from('sync_logs').insert({
    trigger,
    duration_ms: durationMs,
    total_contacts: allContacts.length,
    mapped: clinics.length,
    upserted,
    skipped,
    errors,
    changes: detectedChanges,
    stale_cleanup: staleCleanupRan,
  })

  // Clean up old logs (older than 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  await (supabase as LooseClient).from('sync_logs').delete().lt('synced_at', sevenDaysAgo)

  return {
    success: true,
    totalContacts: allContacts.length,
    mapped: clinics.length,
    skipped,
    upserted,
    errors,
    staleCleanupRan,
    changes: detectedChanges,
    timestamp: new Date().toISOString(),
    duration_ms: durationMs,
  }
}
