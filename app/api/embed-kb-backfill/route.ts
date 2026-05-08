import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { embedTextDetailed, vectorLiteral } from '@/lib/embeddings'

// WHY: One-shot admin endpoint to populate `knowledge_base.embedding` for every
// existing row. Runs after migration 075 ships. New rows get embedded inline by
// /api/generate-kb, so this only needs to run once (and re-run if you wipe the
// embedding column or change the model dim).
//
// Auth: cookie-based — the user must be signed in AND profile.role = 'admin'.
// Idempotent: skips rows that already have an embedding.
//
// Chunked: each call processes up to BATCH_SIZE rows so we don't blow the
// serverless timeout. The client (Settings button) calls in a loop until
// `remaining === 0`.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const BATCH_SIZE = 25                      // rows processed per request
const PARALLELISM = 5                      // concurrent Gemini embed calls

export async function POST() {
  // Auth via session cookie
  const userClient = createServerClient()
  const { data: userRes } = await userClient.auth.getUser()
  if (!userRes?.user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }
  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', userRes.user.id)
    .single()
  if (profile?.role !== 'admin' && profile?.role !== 'administrator') {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
  }

  // Service-role client for the actual work (bypasses RLS, no 5s timeout)
  const admin = createServiceClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Total + remaining counts (for client progress)
  const { count: total } = await admin
    .from('knowledge_base')
    .select('id', { count: 'exact', head: true })
  const { count: missingBefore } = await admin
    .from('knowledge_base')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null)

  // Pull up to BATCH_SIZE rows that still need an embedding
  const { data: rows, error: fetchErr } = await admin
    .from('knowledge_base')
    .select('id, issue, fix')
    .is('embedding', null)
    .order('created_at', { ascending: false })
    .limit(BATCH_SIZE)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  let processed = 0
  let failed = 0
  const sampleErrors: string[] = []

  // Process in mini-batches with bounded parallelism
  for (let i = 0; i < (rows?.length || 0); i += PARALLELISM) {
    const slice = (rows || []).slice(i, i + PARALLELISM)
    const results = await Promise.all(slice.map(async (row) => {
      const text = `${row.issue}\n\n${row.fix}`.slice(0, 8000)
      const r = await embedTextDetailed(text)
      if (!r.ok) return { ok: false, id: row.id, error: r.error }
      const { error: updErr } = await admin
        .from('knowledge_base')
        .update({ embedding: vectorLiteral(r.values) })
        .eq('id', row.id)
      if (updErr) {
        console.error('[embed-kb-backfill] update failed', row.id, updErr.message)
        return { ok: false, id: row.id, error: `DB: ${updErr.message}` }
      }
      return { ok: true, id: row.id }
    }))
    for (const r of results) {
      if (r.ok) processed++
      else {
        failed++
        if (sampleErrors.length < 3 && 'error' in r && r.error) sampleErrors.push(r.error)
      }
    }
  }

  // Recount remaining for the client to know whether to call again
  const { count: missingAfter } = await admin
    .from('knowledge_base')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null)

  return NextResponse.json({
    total: total || 0,
    missing_before: missingBefore || 0,
    processed,
    failed,
    remaining: missingAfter || 0,
    sample_errors: sampleErrors,
  })
}
