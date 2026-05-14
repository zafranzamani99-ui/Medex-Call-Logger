import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
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

export const maxDuration = 120

// The manager's CRM contacts.data JSONB keys are mostly the same as our Excel
// headers (same source). These overrides handle keys that differ between the
// manager's import and ours (e.g. deduped header variants).
const PROTECTED_BOOL_COLUMNS = ['has_e_invoice', 'has_sst', 'has_whatsapp'] as const

const CRM_EXTRA_KEYS: Record<string, string> = {
  'Invoice No': 'invoice_no',
  'MTN Important Note (2)': 'mtn_important_note_2',
  'MTN Important Note_1': 'mtn_important_note_2',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = ReturnType<typeof createClient<any, any, any>>

function adminClient(): LooseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ) as LooseClient
}

async function requireAdmin(): Promise<NextResponse | null> {
  const userClient = createServerClient()
  const { data: userRes } = await userClient.auth.getUser()
  if (!userRes?.user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', userRes.user.id)
    .single()
  if (profile?.role !== 'admin' && profile?.role !== 'administrator') {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
  }
  return null
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
  for (const col of ['has_e_invoice', 'has_sst', 'has_whatsapp'] as const) {
    if (clinic[col] === null || clinic[col] === undefined) clinic[col] = false
  }

  return clinic
}

export async function POST() {
  if (!process.env.CRM_SUPABASE_URL || !process.env.CRM_SUPABASE_KEY) {
    return NextResponse.json({ error: 'CRM credentials not configured' }, { status: 500 })
  }

  const authErr = await requireAdmin()
  if (authErr) return authErr

  try {
    // Fetch all contacts from manager's CRM (paginated — PostgREST max 1000)
    const PAGE_SIZE = 1000
    const allContacts: { id: number; data: Record<string, unknown> }[] = []
    let offset = 0

    while (true) {
      const { data, error } = await crmSupabase
        .from('contacts')
        .select('id, data')
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) {
        return NextResponse.json({ error: `CRM fetch failed: ${error.message}` }, { status: 502 })
      }
      if (!data || data.length === 0) break
      allContacts.push(...(data as typeof allContacts))
      if (data.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    if (allContacts.length === 0) {
      return NextResponse.json({ error: 'No contacts found in CRM' }, { status: 404 })
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
      return NextResponse.json({ error: 'No valid clinic records after mapping' }, { status: 400 })
    }

    // Upsert into our clinics table
    const supabase = adminClient()
    const syncStart = new Date().toISOString()
    const BATCH_SIZE = 500
    let upserted = 0
    let errors = 0

    // Fetch existing boolean values so we don't reset agent-set flags
    const { data: existingRows } = await (supabase as LooseClient)
      .from('clinics')
      .select('clinic_code, has_e_invoice, has_sst, has_whatsapp')
    const existingMap = new Map<string, Record<string, unknown>>()
    for (const row of (existingRows ?? []) as Record<string, unknown>[]) {
      existingMap.set(row.clinic_code as string, row)
    }

    for (let i = 0; i < clinics.length; i += BATCH_SIZE) {
      const batch = clinics.slice(i, i + BATCH_SIZE)
      for (const c of batch) {
        c.updated_at = syncStart
        const existing = existingMap.get(c.clinic_code as string)
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

    // Stale cleanup — remove clinics not in the CRM (same logic as Excel upload)
    let staleCleanupRan = false
    if (clinics.length >= MIN_CLINICS_FOR_STALE_CLEANUP) {
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

    return NextResponse.json({
      success: true,
      totalContacts: allContacts.length,
      mapped: clinics.length,
      skipped,
      upserted,
      errors,
      staleCleanupRan,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[crm-sync] Error:', err)
    return NextResponse.json(
      { error: 'Sync failed: ' + (err as Error).message },
      { status: 500 },
    )
  }
}
