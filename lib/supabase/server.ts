import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// WHY: Server-side Supabase client for Server Components and Server Actions.
// Reads/writes auth cookies from the request. Each request gets a fresh client
// to prevent cross-request token leaks.
//
// CRITICAL: Uses a custom fetch with AbortController timeout (5s).
// Without this, any Supabase call from a Server Component (like the profile
// fetch in (app)/layout.tsx) can hang INDEFINITELY if the network is slow,
// which blocks the entire page render. Node.js fetch has no default timeout.
export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll is called from Server Component — ignore.
            // The middleware will handle cookie refresh.
          }
        },
      },
      global: {
        fetch: (url, options) => {
          // WHY: 5s timeout on every Supabase call from server components.
          // Prevents pages from hanging when Supabase is slow/unreachable.
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5000)
          return fetch(url, {
            ...options,
            signal: controller.signal,
          }).finally(() => clearTimeout(timeoutId))
        },
      },
    }
  )
}
