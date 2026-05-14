import { NextRequest, NextResponse } from 'next/server'
import { performCrmSync } from '@/lib/crm-sync-logic'

export const maxDuration = 120

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.CRM_SUPABASE_URL || !process.env.CRM_SUPABASE_KEY) {
    return NextResponse.json({ error: 'CRM credentials not configured' }, { status: 500 })
  }

  try {
    const result = await performCrmSync('cron')
    return NextResponse.json(result)
  } catch (err) {
    console.error('[cron/crm-sync] Error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
