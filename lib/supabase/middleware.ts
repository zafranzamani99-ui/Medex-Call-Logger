import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// WHY: Middleware runs on every request. Must be FAST — no hanging network calls.
// Uses getSession() which reads from cookies locally (no network request).
// The actual user verification happens server-side in the (app) layout.
//
// CRITICAL: getSession() CAN trigger a network call if the access token is expired
// and a refresh token exists in cookies — it will attempt a token refresh.
// We race against a 2s timeout to prevent hanging when Supabase is unreachable.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // WHY: 2s timeout prevents middleware from hanging if Supabase is slow/unreachable.
  // getSession() USUALLY reads from cookies (fast), but CAN make a network call
  // to refresh an expired token. If that call hangs, the entire request hangs.
  let user = null
  try {
    const sessionResult = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ])
    if (sessionResult) {
      user = sessionResult.data?.session?.user ?? null
    }
  } catch {
    // Session check failed — let request through, layout will handle auth
    return supabaseResponse
  }

  const isAuthPage =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/register')

  // No valid user + not on auth page → redirect to login
  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Valid user + on auth page → redirect to dashboard
  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
