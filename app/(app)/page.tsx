'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, subDays, startOfDay } from 'date-fns'
import type { Ticket, DashboardStats, Schedule } from '@/lib/types'
import { isStale } from '@/lib/staleDetection'
import dynamic from 'next/dynamic'
import StatsBar from '@/components/StatsBar'
import Button from '@/components/ui/Button'
import { SCHEDULE_TYPE_COLORS } from '@/lib/constants'

// WHY: Recharts is ~120KB. Dynamic import loads it only when dashboard renders,
// not in the initial JS bundle for every page. ssr:false because charts need window.
const DashboardCharts = dynamic(() => import('@/components/DashboardCharts'), {
  ssr: false,
  loading: () => <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6"><div className="h-48 skeleton" /><div className="h-48 skeleton" /></div>,
})
import EmptyState, { EmptyIcons } from '@/components/ui/EmptyState'
import StatusBadge from '@/components/StatusBadge'
import RecordTypeBadge from '@/components/RecordTypeBadge'
import { NeedsAttentionBadge, StaleBadge, IssueTypeBadge } from '@/components/FlagBadge'
import { getDurationLabel } from '@/lib/constants'
import { DashboardSkeleton } from '@/components/Skeleton'

// WHY: Dashboard — spec Section 7. Landing page after login.
// Shows live stats, open ticket list, and charts.
// Uses Supabase real-time subscriptions so all 4 agents see updates instantly.

// Group tickets into time blocks for Today's Activity
function groupByTimeBlock(tickets: Ticket[]) {
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000)

  const groups: { label: string; tickets: Ticket[] }[] = [
    { label: 'Last hour', tickets: [] },
    { label: 'Last 3 hours', tickets: [] },
    { label: 'Earlier today', tickets: [] },
  ]

  tickets.forEach((t) => {
    const created = new Date(t.created_at)
    if (created >= oneHourAgo) groups[0].tickets.push(t)
    else if (created >= threeHoursAgo) groups[1].tickets.push(t)
    else groups[2].tickets.push(t)
  })

  return groups.filter((g) => g.tickets.length > 0)
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [stats, setStats] = useState<DashboardStats>({
    callsToday: 0,
    openTickets: 0,
    needsAttention: 0,
    stale: 0,
    resolvedToday: 0,
  })
  const [yesterdayStats, setYesterdayStats] = useState<DashboardStats>({
    callsToday: 0,
    openTickets: 0,
    needsAttention: 0,
    stale: 0,
    resolvedToday: 0,
  })
  const [chartData, setChartData] = useState({
    dailyCalls: [] as { date: string; count: number }[],
    issueBreakdown: [] as { name: string; count: number }[],
  })
  const [loading, setLoading] = useState(true)
  const [upcomingSchedules, setUpcomingSchedules] = useState<Schedule[]>([])

  // Refs for scroll-to-section
  const activityRef = useRef<HTMLDivElement>(null)
  const openTicketsRef = useRef<HTMLDivElement>(null)

  // Fetch all tickets and compute stats
  const fetchData = async () => {
    const { data: rawTickets } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false })

    if (!rawTickets) return

    const allTickets = rawTickets as Ticket[]
    setTickets(allTickets)

    // Compute stats (spec Section 7.1)
    const today = startOfDay(new Date())
    const todayStr = format(today, 'yyyy-MM-dd')
    const yesterday = subDays(today, 1)
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd')

    const callsToday = allTickets.filter((t) => t.created_at.startsWith(todayStr)).length
    const openTicketsCount = allTickets.filter((t) => t.record_type === 'ticket' && t.status !== 'Resolved').length
    const needsAttention = allTickets.filter((t) => t.need_team_check && (t.record_type === 'call' || t.status !== 'Resolved')).length
    const staleCount = allTickets.filter((t) => isStale(t)).length
    const resolvedToday = allTickets.filter((t) => t.status === 'Resolved' && t.updated_at.startsWith(todayStr)).length

    setStats({ callsToday, openTickets: openTicketsCount, needsAttention, stale: staleCount, resolvedToday })

    // Yesterday stats for trend comparison
    const callsYesterday = allTickets.filter((t) => t.created_at.startsWith(yesterdayStr)).length
    const resolvedYesterday = allTickets.filter((t) => t.status === 'Resolved' && t.updated_at.startsWith(yesterdayStr)).length
    setYesterdayStats({
      callsToday: callsYesterday,
      openTickets: openTicketsCount, // same — it's a running total
      needsAttention,
      stale: staleCount,
      resolvedToday: resolvedYesterday,
    })

    // Chart data: calls per day last 14 days
    const dailyCalls: { date: string; count: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = subDays(new Date(), i)
      const dateStr = format(d, 'yyyy-MM-dd')
      const label = format(d, 'dd/MM')
      const count = allTickets.filter((t) => t.created_at.startsWith(dateStr)).length
      dailyCalls.push({ date: label, count })
    }

    // Chart data: issue type breakdown
    const issueCounts: Record<string, number> = {}
    allTickets.forEach((t) => {
      issueCounts[t.issue_type] = (issueCounts[t.issue_type] || 0) + 1
    })
    const issueBreakdown = Object.entries(issueCounts).map(([name, count]) => ({ name, count }))

    setChartData({ dailyCalls, issueBreakdown })
    setLoading(false)
  }

  // Fetch current user's upcoming schedules
  const fetchUpcomingSchedules = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('schedules')
      .select('*')
      .eq('agent_id', session.user.id)
      .eq('status', 'scheduled')
      .gte('schedule_date', todayStr)
      .order('schedule_date')
      .order('schedule_time')
      .limit(5)

    setUpcomingSchedules(data || [])
  }

  useEffect(() => {
    fetchData()
    fetchUpcomingSchedules()
  }, [])

  // WHY: Debounce realtime updates to prevent rapid successive re-fetches.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchData(), 500)
  }, [])

  // Real-time subscription (spec Section 7.2)
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        () => { debouncedFetch() }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Per-agent stats for today
  const todayStr = format(startOfDay(new Date()), 'yyyy-MM-dd')
  const todayTickets = tickets.filter(t => t.created_at.startsWith(todayStr))
  const agentStats = todayTickets.reduce<Record<string, number>>((acc, t) => {
    acc[t.created_by_name] = (acc[t.created_by_name] || 0) + 1
    return acc
  }, {})

  // Time-grouped activity
  const timeGroups = useMemo(() => groupByTimeBlock(todayTickets), [todayTickets])

  // Open tickets list — sorted per spec Section 7.3
  const openTickets = tickets
    .filter((t) => t.status !== 'Resolved' && t.record_type === 'ticket')
    .sort((a, b) => {
      if (a.need_team_check && !b.need_team_check) return -1
      if (!a.need_team_check && b.need_team_check) return 1
      const aStale = isStale(a)
      const bStale = isStale(b)
      if (aStale && !bStale) return -1
      if (!aStale && bStale) return 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  // Handle stat card click — scroll to relevant section
  const handleCardClick = (key: string) => {
    if (key === 'callsToday' || key === 'resolvedToday') {
      activityRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      openTicketsRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  if (loading) {
    return <DashboardSkeleton />
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-text-primary mb-6">Dashboard</h1>

      {/* Stats bar — 5 cards with trend indicators */}
      <StatsBar stats={stats} yesterdayStats={yesterdayStats} onCardClick={handleCardClick} />

      {/* Per-agent stats — who logged how many today */}
      {Object.keys(agentStats).length > 0 && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {Object.entries(agentStats)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => (
              <div key={name} className="flex items-center gap-1.5 bg-surface-raised border border-border rounded-full px-3 py-1">
                <span className="text-xs text-accent font-medium">{name}</span>
                <span className="text-xs text-text-primary font-bold tabular-nums">{count}</span>
              </div>
            ))}
        </div>
      )}

      {/* Charts */}
      <DashboardCharts data={chartData} />

      {/* My Upcoming Schedules — shows assigned work */}
      {upcomingSchedules.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-text-secondary">
              My Upcoming Schedules ({upcomingSchedules.length})
            </h2>
            <button
              onClick={() => router.push('/schedule')}
              className="text-xs text-accent hover:underline"
            >
              View all
            </button>
          </div>
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="divide-y divide-border">
              {upcomingSchedules.map((s) => {
                const colors = SCHEDULE_TYPE_COLORS[s.schedule_type] || { bg: 'bg-zinc-500/20', text: 'text-zinc-400' }
                const dateStr = s.schedule_date.split('-').reverse().join('/')
                return (
                  <div
                    key={s.id}
                    onClick={() => router.push('/schedule')}
                    className="px-4 py-3 hover:bg-surface-raised transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-mono text-xs text-text-tertiary flex-shrink-0">{dateStr}</span>
                        <span className="font-mono text-xs text-accent flex-shrink-0">{s.schedule_time}</span>
                        <span className="text-sm text-text-primary truncate">{s.clinic_name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                          {s.schedule_type}
                        </span>
                        {s.duration_estimate && (
                          <span className="text-xs text-text-muted">{s.duration_estimate}</span>
                        )}
                      </div>
                    </div>
                    {s.pic && (
                      <p className="text-xs text-text-tertiary mt-1">PIC: {s.pic}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Today's Activity Feed — grouped by time blocks */}
      <div ref={activityRef} className="mt-6">
        <h2 className="text-sm font-medium text-text-secondary mb-3">
          Today&apos;s Activity ({todayTickets.length})
        </h2>

        {todayTickets.length === 0 ? (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-text-secondary text-sm font-medium">No activity yet today</p>
            <p className="text-text-tertiary text-xs mt-1">Calls and tickets will appear here as they&apos;re logged</p>
            <Button onClick={() => router.push('/log')} size="sm" className="mt-4">
              Log a Call
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {timeGroups.map((group) => (
              <div key={group.label}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">{group.label}</span>
                  <span className="text-xs text-text-muted">({group.tickets.length})</span>
                </div>
                <div className="bg-surface border border-border rounded-lg overflow-hidden">
                  <div className="divide-y divide-border">
                    {group.tickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        onClick={() => router.push(`/tickets/${ticket.id}`)}
                        className="px-4 py-3 hover:bg-surface-raised transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                            <span className="font-mono text-xs text-text-tertiary flex-shrink-0">
                              {format(new Date(ticket.created_at), 'HH:mm')}
                            </span>
                            <span className="font-mono text-xs text-text-muted flex-shrink-0">
                              {ticket.ticket_ref}
                            </span>
                            {ticket.caller_tel && (
                              <span className="font-mono text-xs text-emerald-400 flex-shrink-0">
                                {ticket.caller_tel}
                              </span>
                            )}
                            <span className="font-mono text-xs text-accent flex-shrink-0">
                              [{ticket.clinic_code}]
                            </span>
                            <span className="text-sm text-text-primary truncate">
                              {ticket.clinic_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <RecordTypeBadge recordType={ticket.record_type} />
                            <IssueTypeBadge issueType={ticket.issue_type} />
                            <StatusBadge status={ticket.status} />
                            {ticket.need_team_check && <NeedsAttentionBadge />}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-text-tertiary tabular-nums">
                          <span className="bg-accent-muted text-accent font-medium px-1.5 py-0.5 rounded">{ticket.created_by_name}</span>
                          {ticket.call_duration && <span>{getDurationLabel(ticket.call_duration)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Open Tickets List */}
      <div ref={openTicketsRef} className="mt-6">
        <h2 className="text-sm font-medium text-text-secondary mb-3">
          Open Tickets ({openTickets.length})
        </h2>

        {openTickets.length === 0 ? (
          <EmptyState icon={EmptyIcons.checkCircle} title="All caught up!" description="No open tickets right now" />
        ) : (
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="divide-y divide-border">
              {openTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => router.push(`/tickets/${ticket.id}`)}
                  className="px-4 py-3 hover:bg-surface-raised transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                      <span className="font-mono text-xs text-text-tertiary flex-shrink-0">
                        {ticket.ticket_ref}
                      </span>
                      {ticket.caller_tel && (
                        <span className="font-mono text-xs text-emerald-400 flex-shrink-0">
                          {ticket.caller_tel}
                        </span>
                      )}
                      <span className="text-sm text-text-primary font-medium truncate">
                        {ticket.clinic_name}
                      </span>
                      {ticket.mtn_expiry && (() => {
                        const today = new Date(); today.setHours(0,0,0,0)
                        const expiry = new Date(ticket.mtn_expiry + 'T00:00:00')
                        const diff = Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
                        const label = diff < 0 ? 'EXPIRED' : diff <= 30 ? 'EXPIRING' : 'ACTIVE'
                        const color = diff < 0 ? 'bg-red-500/20 text-red-400' : diff <= 30 ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'
                        return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span>
                      })()}
                      <IssueTypeBadge issueType={ticket.issue_type} />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusBadge status={ticket.status} />
                      {ticket.need_team_check && <NeedsAttentionBadge />}
                      {isStale(ticket) && <StaleBadge />}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-text-tertiary tabular-nums">
                    <span className="bg-accent-muted text-accent font-medium px-1.5 py-0.5 rounded">{ticket.created_by_name}</span>
                    <span>{format(new Date(ticket.created_at), 'dd/MM/yyyy HH:mm')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
