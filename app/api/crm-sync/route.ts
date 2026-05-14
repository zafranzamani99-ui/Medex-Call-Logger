import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { performCrmSync } from '@/lib/crm-sync-logic'

export const maxDuration = 120

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

export async function POST() {
  if (!process.env.CRM_SUPABASE_URL || !process.env.CRM_SUPABASE_KEY) {
    return NextResponse.json({ error: 'CRM credentials not configured' }, { status: 500 })
  }

  const authErr = await requireAdmin()
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
