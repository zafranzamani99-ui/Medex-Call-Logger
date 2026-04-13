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
// Fetches user profile + notification counts on every page load.
// If no user, redirects to /login.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()

  // WHY: getSession() reads from cookies locally — no network call, never hangs.
  const sessionResult = await withTimeout(supabase.auth.getSession(), 3000)

  const session = sessionResult?.data?.session ?? null

  if (!session?.user) {
    redirect('/login')
  }

  const user = session.user

  // Fetch display_name + navbar counts in parallel
  // WHY: 2s timeout each — all are non-critical, fall back to defaults if slow.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  const [profileResult, todayCallsResult, openTicketsResult, kbDraftsResult] = await Promise.all([
    withTimeout(
      supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single(),
      2000
    ),
    withTimeout(
      supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayISO),
      2000
    ),
    withTimeout(
      supabase
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'Resolved'),
      2000
    ),
    withTimeout(
      supabase
        .from('knowledge_base')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft'),
      2000
    ),
  ])

  const displayName = profileResult?.data?.display_name || user.email || 'Agent'
  const todayCalls = todayCallsResult?.count ?? 0
  const openTickets = openTicketsResult?.count ?? 0
  const kbDrafts = kbDraftsResult?.count ?? 0

  return (
    <div className="min-h-dvh flex flex-col md:flex-row">
      <NavBar
        displayName={displayName}
        todayCalls={todayCalls}
        openTickets={openTickets}
        kbDrafts={kbDrafts}
      />
      <main className="flex-1 md:pl-[var(--sidebar-width)] w-full transition-[padding-left] duration-200">
        <div className="relative mx-auto max-w-[1440px] px-4 py-6 pb-24 sm:px-6 md:px-10 md:py-8">
          <ThemeToggle />
          <ToastProvider>
            {children}
          </ToastProvider>
        </div>
      </main>
    </div>
  )
}
