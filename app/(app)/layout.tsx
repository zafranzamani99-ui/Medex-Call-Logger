import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NavBar from '@/components/NavBar'
import ThemeToggle from '@/components/ThemeToggle'
import { ToastProvider } from '@/components/ui/Toast'

// WHY: Races any thenable/promise against a timeout.
// Prevents server component from hanging forever if Supabase is slow/unreachable.
// Returns null on timeout — callers must handle the null case.
function withTimeout<T>(thenable: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(thenable),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

// WHY: Protected layout — wraps all authenticated pages.
// Fetches user profile on every page load. If no user, redirects to /login.
// Nav bar shows: Dashboard | Log Call | History | KB | Settings | user name | Logout
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()

  // WHY: getSession() reads from cookies locally — no network call, never hangs.
  // getUser() was causing pages to hang with stale/invalid tokens.
  // Added 3s timeout as safety net — if cookies are somehow broken, don't hang forever.
  const sessionResult = await withTimeout(supabase.auth.getSession(), 3000)

  const session = sessionResult?.data?.session ?? null

  if (!session?.user) {
    redirect('/login')
  }

  const user = session.user

  // Fetch display_name from profiles table
  // WHY: 2s timeout — display name is non-critical, fall back to email if slow.
  let displayName = user.email || 'Agent'
  try {
    const profileResult = await withTimeout(
      supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single(),
      2000
    )
    if (profileResult?.data?.display_name) displayName = profileResult.data.display_name
  } catch {
    // Profile fetch failed — use email as fallback
  }

  return (
    <div className="min-h-dvh flex flex-col md:flex-row">
      <NavBar displayName={displayName} />
      <main className="flex-1 px-4 py-6 pb-24 md:pb-6 md:pl-[calc(var(--sidebar-width)+1.5rem)] md:pr-6 w-full relative transition-[padding-left] duration-200 will-change-[padding-left]">
        <ThemeToggle />
        <ToastProvider>
          {children}
        </ToastProvider>
      </main>
    </div>
  )
}
