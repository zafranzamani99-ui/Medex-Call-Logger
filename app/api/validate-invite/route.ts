import { NextRequest, NextResponse } from 'next/server'

// WHY: Server-side invite code validation — env var never exposed to client.
// If INVITE_CODE is not set, registration is closed entirely (fail-closed).
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json()
    const validCode = process.env.INVITE_CODE

    if (!validCode) {
      return NextResponse.json(
        { valid: false, error: 'Registration is currently closed' },
        { status: 403 }
      )
    }

    if (code !== validCode) {
      return NextResponse.json(
        { valid: false, error: 'Invalid invite code. Contact your admin.' },
        { status: 403 }
      )
    }

    return NextResponse.json({ valid: true })
  } catch {
    return NextResponse.json(
      { valid: false, error: 'Invalid request' },
      { status: 400 }
    )
  }
}
