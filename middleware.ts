import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'

// WHY: Next.js middleware runs on EVERY matched request before the page loads.
// This is the auth guard — unauthenticated users get redirected to /login.
// Also silently refreshes JWT tokens so agents never get logged out mid-shift.
//
// CRITICAL: The middleware must NEVER hang. We have three layers of protection:
// 1. Matcher excludes non-page routes (API, _next, static files)
// 2. updateSession() has a 2s timeout on the Supabase call
// 3. Try/catch here lets requests through if anything throws
export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request)
  } catch {
    // If middleware fails (e.g. stale token, network error), let the request through.
    // Auth is also enforced in the (app) layout as a second check.
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    // WHY: Exclude API routes, _next internals, and static files from middleware.
    // Previously, the broad matcher caused middleware to run on EVERY request
    // including _next/data RSC prefetches, API calls, etc. — multiplying
    // the number of Supabase calls and increasing chance of hanging.
    '/((?!api|_next/static|_next/image|_next/data|_next/webpack-hmr|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf)$).*)',
  ],
}
