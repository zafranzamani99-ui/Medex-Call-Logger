import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { performCrmSync } from '@/lib/crm-sync-logic'

export const maxDuration = 120

// CRM sync is available to all signed-in staff (support, admin, administrator).
async function requireAuth(): Promise<NextResponse | null> {
  const userClient = createServerClient()
  const { data: userRes } = await userClient.auth.getUser()
  if (!userRes?.user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  return null
}

export async function POST() {
  if (!process.env.CRM_SUPABASE_URL || !process.env.CRM_SUPABASE_KEY) {
    return NextResponse.json({ error: 'CRM credentials not configured' }, { status: 500 })
  }

  const authErr = await requireAuth()
  if (authErr) return authErr

  try {
    const result = await performCrmSync('manual')
    return NextResponse.json(result)
  } catch (err) {
    console.error('[crm-sync] Error:', err)
    return NextResponse.json(
      { error: 'Sync failed: ' + (err as Error).message },
      { status: 500 },
    )
  }
}
