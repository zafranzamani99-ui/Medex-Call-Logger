import { createBrowserClient } from '@supabase/ssr'

// WHY: SINGLETON browser Supabase client.
// Without singleton, every component creates its own client instance.
// Multiple instances fight over the auth token lock → "lock stolen" error.
// Singleton ensures one client, one lock, no conflicts.
let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (client) return client

  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  return client
}
