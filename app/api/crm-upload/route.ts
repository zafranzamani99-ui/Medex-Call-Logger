import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import {
  parseCrmWorkbook,
  parseCrmCsvRows,
  MIN_CLINICS_FOR_STALE_CLEANUP,
  type ClinicRow,
} from '@/lib/crm-import'

// supabase-js v2's `createClient` return type narrows to `never` for table
// arguments when used without a generated Database type. Casting to a loose
// SupabaseClient gives the helpers a usable shape without dragging in codegen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = SupabaseClient<any, any, any>

// WHY: CRM upload — spec Section 5.7 (UC-19).
//
// Two paths supported:
//
// 1) FORMDATA (legacy, small files only): client POSTs the raw .xlsx/.csv as
//    multipart/form-data. Server parses, upserts, runs stale cleanup. Works only
//    for files ≤ 4.5 MB on Vercel Hobby/Pro (platform body limit).
//
// 2) JSON BATCH (new, any size): client parses the workbook in the browser with
//    the same lib/crm-import helpers, then POSTs JSON batches of pre-parsed
//    clinic rows. Each batch is small (<<1 MB) so the body limit is irrelevant,
//    and the user gets a real progress UI. Stale cleanup runs on the final
//    batch (isLast=true).
//
// All paths use service-role to bypass RLS on the bulk operations. The JSON path
// adds a cookie-session admin check before doing anything destructive.

export const maxDuration = 60

interface JsonBatchBody {
  mode: 'batch'
  uploadStart: string          // ISO timestamp — same value for every batch in one upload
  clinics: ClinicRow[]         // already mapped to db column names
  isLast?: boolean             // when true, run stale cleanup if eligible
  totalCount?: number          // number of rows the client intends to send (for safety floor)
  einvSheetFound?: boolean
  einvRowsMerged?: number
}

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
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
  }
  return null
}

async function upsertBatch(
  supabase: LooseClient,
  batch: ClinicRow[],
  uploadStart: string,
): Promise<string | null> {
  // clinics has no auto-update trigger on updated_at — stamping every upsert
  // with uploadStart gives the stale-cleanup DELETE a clean "touched this run"
  // marker. (See migration 003 for tickets' trigger.)
  for (const c of batch) c.updated_at = uploadStart
  const { error } = await supabase.from('clinics').upsert(batch, { onConflict: 'clinic_code' })
  return error ? error.message : null
}

async function runStaleCleanup(
  supabase: LooseClient,
  uploadStart: string,
): Promise<string | null> {
  const { error } = await supabase.from('clinics').delete().lt('updated_at', uploadStart)
  return error ? error.message : null
}

// ============================================================================
// Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
    }

    const contentType = request.headers.get('content-type') || ''

    // --- Path 2: JSON batch upload (the new one) ---
    if (contentType.includes('application/json')) {
      const authErr = await requireAdmin()
      if (authErr) return authErr

      let body: JsonBatchBody
      try {
        body = await request.json()
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
      }

      if (body.mode !== 'batch') {
        return NextResponse.json({ error: 'Unknown mode' }, { status: 400 })
      }
      if (!body.uploadStart || !Array.isArray(body.clinics)) {
        return NextResponse.json({ error: 'uploadStart and clinics[] required' }, { status: 400 })
      }

      const supabase = adminClient()

      // Upsert this batch
      if (body.clinics.length > 0) {
        const upsertErr = await upsertBatch(supabase, body.clinics, body.uploadStart)
        if (upsertErr) {
          return NextResponse.json({ error: `Upsert failed: ${upsertErr}` }, { status: 500 })
        }
      }

      // Last batch: run stale cleanup if the file is large enough to be trusted
      let staleCleanupRan = false
      if (body.isLast) {
        const total = body.totalCount ?? 0
        if (total >= MIN_CLINICS_FOR_STALE_CLEANUP) {
          const cleanupErr = await runStaleCleanup(supabase, body.uploadStart)
          if (cleanupErr) {
            return NextResponse.json(
              { error: `Stale cleanup failed: ${cleanupErr}` },
              { status: 500 },
            )
          }
          staleCleanupRan = true
        }
      }

      return NextResponse.json({
        success: true,
        upserted: body.clinics.length,
        isLast: !!body.isLast,
        staleCleanupRan,
        timestamp: new Date().toISOString(),
        einvSheetFound: body.einvSheetFound ?? false,
        einvRowsMerged: body.einvRowsMerged ?? 0,
      })
    }

    // --- Path 1: legacy FormData (small files only) ---
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const fileName = file.name.toLowerCase()
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')

    let parsed: ReturnType<typeof parseCrmWorkbook> | ReturnType<typeof parseCrmCsvRows>
    if (isExcel) {
      const buffer = await file.arrayBuffer()
      parsed = parseCrmWorkbook(buffer)
    } else {
      const csvText = await file.text()
      const result = Papa.parse<Record<string, unknown>>(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim(),
      })
      if (result.errors.length > 0) {
        return NextResponse.json(
          { error: 'CSV parsing error: ' + result.errors[0].message },
          { status: 400 },
        )
      }
      parsed = parseCrmCsvRows(result.data)
    }

    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const supabase = adminClient()
    const uploadStart = new Date().toISOString()
    const BATCH_SIZE = 500
    let upsertedCount = 0

    for (let i = 0; i < parsed.clinics.length; i += BATCH_SIZE) {
      const batch = parsed.clinics.slice(i, i + BATCH_SIZE)
      const upsertErr = await upsertBatch(supabase, batch, uploadStart)
      if (upsertErr) {
        return NextResponse.json(
          {
            error: `Upsert failed at batch ${Math.floor(i / BATCH_SIZE) + 1}: ${upsertErr}`,
            processedSoFar: upsertedCount,
          },
          { status: 500 },
        )
      }
      upsertedCount += batch.length
    }

    let staleCleanupRan = false
    if (parsed.clinics.length >= MIN_CLINICS_FOR_STALE_CLEANUP) {
      const cleanupErr = await runStaleCleanup(supabase, uploadStart)
      if (cleanupErr) {
        return NextResponse.json({ error: `Stale cleanup failed: ${cleanupErr}` }, { status: 500 })
      }
      staleCleanupRan = true
    }

    return NextResponse.json({
      success: true,
      count: upsertedCount,
      einvSheetFound: parsed.einvSheetFound,
      einvRowsMerged: parsed.einvRowsMerged,
      staleCleanupRan,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Unexpected error: ' + (err as Error).message },
      { status: 500 },
    )
  }
}
