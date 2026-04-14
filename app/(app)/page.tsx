'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, subDays, startOfDay } from 'date-fns'
import type { Ticket, DashboardStats, Schedule } from '@/lib/types'
import { isStale } from '@/lib/staleDetection'
import dynamic from 'next/dynamic'
import Button from '@/components/ui/Button'
import { SCHEDULE_TYPE_COLORS, formatWorkDurationLive, toProperCase } from '@/lib/constants'

const DashboardCharts = dynamic(() => import('@/components/DashboardCharts'), {
  ssr: false,
  loading: () => <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-8"><div className="h-48 skeleton" /><div className="h-48 skeleton" /></div>,
})
import StatusBadge from '@/components/StatusBadge'
import RecordTypeBadge from '@/components/RecordTypeBadge'
import { NeedsAttentionBadge, StaleBadge } from '@/components/FlagBadge'
import { DashboardSkeleton } from '@/components/Skeleton'

// WHY: Dashboard — spec Section 7. Command center for team.
// Spatial design: Hero urgency zone → triage panel → activity timeline → charts

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [stats, setStats] = useState<DashboardStats>({
    callsToday: 0, openCalls: 0, openTickets: 0, needsAttention: 0, stale: 0, resolvedToday: 0,
  })
  const [chartData, setChartData] = useState({
    dailyCalls: [] as { date: string; count: number }[],
    issueBreakdown: [] as { name: string; count: number }[],
  })
  const [loading, setLoading] = useState(true)
  const [upcomingSchedules, setUpcomingSchedules] = useState<Schedule[]>([])
  const [activeWork, setActiveWork] = useState<Schedule[]>([])
  const [jobSheetsToday, setJobSheetsToday] = useState(0)
  const [kbDraftsCount, setKbDraftsCount] = useState(0)
  const [, setTick] = useState(0)

  const triageRef = useRef<HTMLDivElement>(null)

  const fetchData = async () => {
    const { data: rawTickets } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false })

    if (!rawTickets) return

    const allTickets = rawTickets as Ticket[]
    setTickets(allTickets)

    const today = startOfDay(new Date())
    const todayStr = format(today, 'yyyy-MM-dd')

    const callsToday = allTickets.filter((t) => t.created_at.startsWith(todayStr)).length
    const openCallsCount = allTickets.filter((t) => t.record_type === 'call' && t.status !== 'Resolved').length
    const openTicketsCount = allTickets.filter((t) => t.record_type === 'ticket' && t.status !== 'Resolved').length
    const needsAttention = allTickets.filter((t) => t.need_team_check && (t.record_type === 'call' || t.status !== 'Resolved')).length
    const staleCount = allTickets.filter((t) => isStale(t)).length
    const resolvedToday = allTickets.filter((t) => t.status === 'Resolved' && t.updated_at.startsWith(todayStr)).length

    setStats({ callsToday, openCalls: openCallsCount, openTickets: openTicketsCount, needsAttention, stale: staleCount, resolvedToday })

    const dailyCalls: { date: string; count: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = subDays(new Date(), i)
      const dateStr = format(d, 'yyyy-MM-dd')
      const label = format(d, 'dd/MM')
      const count = allTickets.filter((t) => t.created_at.startsWith(dateStr)).length
      dailyCalls.push({ date: label, count })
    }

    const issueCounts: Record<string, number> = {}
    allTickets.forEach((t) => {
      issueCounts[t.issue_type] = (issueCounts[t.issue_type] || 0) + 1
    })
    const issueBreakdown = Object.entries(issueCounts).map(([name, count]) => ({ name, count }))

    setChartData({ dailyCalls, issueBreakdown })
    setLoading(false)
  }

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
      .limit(3)

    setUpcomingSchedules(data || [])
  }

  const fetchActiveWork = async () => {
    const { data } = await supabase
      .from('schedules')
      .select('*')
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })

    setActiveWork(data || [])
  }

  const fetchExtras = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    const todayIso = startOfDay(new Date()).toISOString()

    const [jsRes, kbRes] = await Promise.all([
      supabase.from('job_sheets').select('id', { count: 'exact', head: true })
        .eq('service_by_id', session.user.id).gte('created_at', todayIso),
      supabase.from('knowledge_base').select('id', { count: 'exact', head: true })
        .eq('status', 'draft'),
    ])
    setJobSheetsToday(jsRes.count ?? 0)
    setKbDraftsCount(kbRes.count ?? 0)
  }

  useEffect(() => {
    fetchData()
    fetchUpcomingSchedules()
    fetchActiveWork()
    fetchExtras()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeWork.length === 0) return
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [activeWork.length])

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchData(), 500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        () => { debouncedFetch() }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schedules' },
        () => { fetchActiveWork(); fetchUpcomingSchedules() }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const todayStr = format(startOfDay(new Date()), 'yyyy-MM-dd')
  const todayTickets = tickets.filter(t => t.created_at.startsWith(todayStr))
  const agentStats = todayTickets.reduce<Record<string, number>>((acc, t) => {
    acc[t.created_by_name] = (acc[t.created_by_name] || 0) + 1
    return acc
  }, {})

  // Open tickets — sorted by urgency for triage panel
  const openTickets = useMemo(() => tickets
    .filter((t) => t.status !== 'Resolved' && t.record_type === 'ticket')
    .sort((a, b) => {
      if (a.need_team_check && !b.need_team_check) return -1
      if (!a.need_team_check && b.need_team_check) return 1
      const aStale = isStale(a)
      const bStale = isStale(b)
      if (aStale && !bStale) return -1
      if (!aStale && bStale) return 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }), [tickets])

  // Urgency items — needs attention + stale (the ones that DEMAND action)
  const urgentTickets = openTickets.filter(t => t.need_team_check || isStale(t))
  const hasUrgency = stats.needsAttention > 0 || stats.stale > 0

  if (loading) {
    return <DashboardSkeleton />
  }

  return (
    <div>
      {/* ═══ HERO ZONE — The ONE thing that matters ═══ */}
      <div className="mb-8">
        <p className="text-[11px] font-medium text-text-muted uppercase tracking-wider mb-3">{format(new Date(), 'EEEE, MMMM d')}</p>

        {hasUrgency ? (
          <div className="rounded-xl p-5 sm:p-6" style={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.06) 0%, rgba(251, 146, 60, 0.04) 100%)',
            border: '1px solid rgba(239, 68, 68, 0.12)',
          }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
                  {stats.needsAttention + stats.stale} need{stats.needsAttention + stats.stale === 1 ? 's' : ''} attention
                </h1>
                <p className="text-[13px] text-text-tertiary mt-1 flex items-center gap-1.5 flex-wrap">
                  {stats.needsAttention > 0 && <span className="text-red-400">{stats.needsAttention} flagged</span>}
                  {stats.needsAttention > 0 && stats.stale > 0 && <span>·</span>}
                  {stats.stale > 0 && <span className="text-amber-400">{stats.stale} stale</span>}
                  <span>·</span>
                  {stats.openCalls > 0 && <span>{stats.openCalls} open call{stats.openCalls !== 1 ? 's' : ''}</span>}
                  {stats.openCalls > 0 && stats.openTickets > 0 && <span>·</span>}
                  {stats.openTickets > 0 && <span>{stats.openTickets} open ticket{stats.openTickets !== 1 ? 's' : ''}</span>}
                </p>
              </div>
              <button
                onClick={() => router.push('/tickets?filter=urgent')}
                className="flex-shrink-0 px-4 py-2 bg-red-500/10 text-red-400 text-[13px] font-medium rounded-lg hover:bg-red-500/15 transition-colors"
              >
                Review now
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl p-5 sm:p-6" style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(99, 102, 241, 0.03) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.1)',
          }}>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
              {stats.openCalls + stats.openTickets === 0 ? 'All caught up' : `${stats.openCalls + stats.openTickets} open`}
            </h1>
            <p className="text-[13px] text-text-tertiary mt-1">
              {stats.openCalls + stats.openTickets === 0
                ? 'No open calls or tickets. Great work!'
                : <span>{stats.openCalls > 0 && `${stats.openCalls} call${stats.openCalls !== 1 ? 's' : ''}`}{stats.openCalls > 0 && stats.openTickets > 0 && ' · '}{stats.openTickets > 0 && `${stats.openTickets} ticket${stats.openTickets !== 1 ? 's' : ''}`} — no escalations or stale items</span>
              }
            </p>
          </div>
        )}

        {/* Personal stats strip — inline, one line */}
        <div className="flex items-center gap-1 mt-4 text-[13px] text-text-tertiary flex-wrap">
          <span className="text-text-primary font-bold tabular-nums">{stats.callsToday}</span>
          <span>calls today</span>
          <span className="text-text-muted mx-1">·</span>
          <span className="text-text-primary font-bold tabular-nums">{stats.resolvedToday}</span>
          <span>resolved</span>
          {jobSheetsToday > 0 && (
            <>
              <span className="text-text-muted mx-1">·</span>
              <span className="text-text-primary font-bold tabular-nums">{jobSheetsToday}</span>
              <span>job sheet{jobSheetsToday !== 1 ? 's' : ''}</span>
            </>
          )}
          {kbDraftsCount > 0 && (
            <>
              <span className="text-text-muted mx-1">·</span>
              <button onClick={() => router.push('/kb')} className="inline-flex items-center gap-1 hover:underline">
                <span className="text-blue-400 font-bold tabular-nums">{kbDraftsCount}</span>
                <span className="text-blue-400">KB draft{kbDraftsCount !== 1 ? 's' : ''}</span>
              </button>
            </>
          )}
          {Object.keys(agentStats).length > 1 && (
            <>
              <span className="text-text-muted mx-1">·</span>
              {Object.entries(agentStats)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count], i) => (
                  <span key={name}>
                    {i > 0 && <span className="text-text-muted">, </span>}
                    <span>{toProperCase(name)}</span> <span className="text-text-primary font-bold tabular-nums">{count}</span>
                  </span>
                ))}
            </>
          )}
        </div>
      </div>

      {/* ═══ WORKING NOW + NEXT UP — schedule awareness strip ═══ */}
      {(activeWork.length > 0 || upcomingSchedules.length > 0) && (
        <div className="mb-8 rounded-xl overflow-hidden border border-border">
          {/* Working Now */}
          {activeWork.length > 0 && (
            <div className="px-4 py-3" style={{ background: 'rgba(251, 191, 36, 0.04)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="relative flex size-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full size-2 bg-amber-400" />
                </span>
                <span className="text-[11px] font-semibold text-amber-400/80 uppercase tracking-wider">Working Now</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {activeWork.map((s) => {
                  const elapsedSec = s.started_at
                    ? Math.max(0, Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000))
                    : 0
                  const initial = s.agent_name?.charAt(0)?.toUpperCase() || '?'
                  return (
                    <button
                      key={s.id}
                      onClick={() => router.push('/schedule')}
                      className="flex items-center gap-2.5 group"
                    >
                      <div className="size-7 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center text-[11px] font-bold">
                        {initial}
                      </div>
                      <div className="text-left">
                        <div className="text-[13px] text-text-primary font-medium group-hover:text-amber-300 transition-colors">
                          {toProperCase(s.agent_name)} <span className="text-text-muted font-normal">·</span> <span className="font-normal text-text-secondary">{s.schedule_type}</span> <span className="text-text-muted font-normal">@</span> <span className="font-normal text-text-secondary truncate">{s.clinic_name}</span>
                        </div>
                        <div className="text-[11px] font-semibold text-amber-400 tabular-nums">{formatWorkDurationLive(elapsedSec)}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {/* Next Up */}
          {upcomingSchedules.length > 0 && (
            <div className={`px-4 py-3 flex items-center gap-3 flex-wrap bg-surface-raised ${activeWork.length > 0 ? 'border-t border-border' : ''}`}>
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Next up</span>
              {upcomingSchedules.slice(0, 3).map((s) => {
                const colors = SCHEDULE_TYPE_COLORS[s.schedule_type] || { bg: 'bg-zinc-500/20', text: 'text-zinc-400' }
                return (
                  <button
                    key={s.id}
                    onClick={() => router.push('/schedule')}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors"
                  >
                    <span className="font-mono text-[12px] text-accent tabular-nums">{s.schedule_time}</span>
                    <span className="text-[13px] text-text-primary">{s.clinic_name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                      {s.schedule_type}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ TRIAGE PANEL — urgent tickets as individual cards ═══ */}
      {urgentTickets.length > 0 && (
        <div ref={triageRef} className="mb-10">
          <h2 className="text-[12px] font-semibold text-text-muted uppercase tracking-wider mb-3">Requires Triage</h2>
          <div className="space-y-2">
            {urgentTickets.slice(0, 5).map((ticket) => {
              const isAttention = ticket.need_team_check
              const stale = isStale(ticket)
              return (
                <div
                  key={ticket.id}
                  onClick={() => router.push(`/tickets/${ticket.id}`)}
                  className="relative rounded-xl p-4 cursor-pointer transition-all hover:-translate-y-px"
                  style={{
                    background: isAttention
                      ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.04) 0%, transparent 60%)'
                      : 'linear-gradient(135deg, rgba(251, 191, 36, 0.03) 0%, transparent 60%)',
                    border: `1px solid ${isAttention ? 'rgba(239, 68, 68, 0.15)' : 'rgba(251, 191, 36, 0.12)'}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-text-primary">{ticket.clinic_name}</span>
                        {isAttention && <NeedsAttentionBadge />}
                        {stale && <StaleBadge />}
                      </div>
                      <p className="text-[13px] text-text-secondary mt-1 line-clamp-1">{ticket.issue}</p>
                      <div className="flex items-center gap-2 mt-2 text-[11px] text-text-tertiary">
                        <span className="font-mono">{ticket.ticket_ref}</span>
                        <span className="text-text-muted">·</span>
                        <span>{toProperCase(ticket.created_by_name)}</span>
                        <span className="text-text-muted">·</span>
                        <span className="tabular-nums">{format(new Date(ticket.created_at), 'dd/MM HH:mm')}</span>
                        {ticket.issue_category && (
                          <>
                            <span className="text-text-muted">·</span>
                            <span className="text-[11px] text-text-muted">{ticket.issue_category}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <StatusBadge status={ticket.status} />
                      <RecordTypeBadge recordType={ticket.record_type} />
                    </div>
                  </div>
                </div>
              )
            })}
            {urgentTickets.length > 5 && (
              <button
                onClick={() => router.push('/tickets?filter=urgent')}
                className="text-[12px] text-accent hover:underline ml-1"
              >
                View all {urgentTickets.length} urgent tickets
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══ TWO-COLUMN: Activity Timeline + Open Tickets ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Activity Timeline — 3 columns wide */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">Today&apos;s Activity</h2>
            <span className="text-[11px] text-text-muted tabular-nums">{todayTickets.length} records</span>
          </div>

          {todayTickets.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-text-secondary text-[14px] font-medium">No activity yet today</p>
              <p className="text-text-muted text-[12px] mt-1">Calls and tickets will appear here</p>
              <Button onClick={() => router.push('/log')} size="sm" className="mt-4">
                Log a Call
              </Button>
            </div>
          ) : (
            <div className="card overflow-hidden divide-y divide-white/[0.04]">
              {todayTickets.slice(0, 25).map((ticket) => {
                const isResolved = ticket.status === 'Resolved'
                const initial = ticket.created_by_name?.charAt(0)?.toUpperCase() || '?'
                return (
                  <div
                    key={ticket.id}
                    onClick={() => router.push(`/tickets/${ticket.id}`)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-white/[0.025] ${isResolved ? 'opacity-55 hover:opacity-90' : ''}`}
                  >
                    {/* Agent initial */}
                    <div className={`size-8 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-semibold ${
                      ticket.need_team_check
                        ? 'bg-red-500/15 text-red-400'
                        : isResolved
                          ? 'bg-emerald-500/10 text-emerald-400/70'
                          : 'bg-indigo-500/10 text-indigo-400'
                    }`}>
                      {initial}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-text-secondary truncate">
                        <span className="text-text-primary font-medium">{toProperCase(ticket.created_by_name)}</span>
                        {' '}{ticket.record_type === 'call' ? 'logged a call for' : 'opened a ticket for'}{' '}
                        {ticket.caller_tel && <span className="text-emerald-400 font-medium font-mono">{ticket.caller_tel}</span>}
                        {ticket.caller_tel && ' '}
                        <span className="text-text-primary font-medium">{ticket.clinic_name}</span>
                        {isResolved && <span className="text-emerald-400 font-medium"> — resolved</span>}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-text-muted tabular-nums">{format(new Date(ticket.created_at), 'h:mma').toLowerCase()}</span>
                        <span className="text-text-muted text-[11px]">·</span>
                        <span className="text-[11px] text-text-muted font-mono">{ticket.ticket_ref}</span>
                        {ticket.issue_category && (
                          <>
                            <span className="text-text-muted text-[11px]">·</span>
                            <span className="text-[11px] text-text-muted">{ticket.issue_category}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right side — status indicator */}
                    {!isResolved && (
                      <StatusBadge status={ticket.status} />
                    )}
                  </div>
                )
              })}
              {todayTickets.length > 25 && (
                <div className="px-4 py-2.5 text-center">
                  <button
                    onClick={() => router.push('/tickets')}
                    className="text-[12px] text-accent hover:text-accent-hover transition-colors"
                  >
                    View all {todayTickets.length} records →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Open Tickets Panel — 2 columns wide */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">Open Tickets</h2>
            <span className="text-[11px] text-text-muted tabular-nums">{openTickets.length}</span>
          </div>

          {openTickets.length === 0 ? (
            <div className="py-12 text-center">
              <div className="size-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                <svg className="size-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-emerald-400 text-[14px] font-semibold">All caught up!</p>
              <p className="text-text-muted text-[12px] mt-0.5">No open tickets</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="max-h-[480px] overflow-y-auto">
                {openTickets.map((ticket, i) => (
                  <div
                    key={ticket.id}
                    onClick={() => router.push(`/tickets/${ticket.id}`)}
                    className={`px-3.5 py-2.5 hover:bg-surface-raised transition-colors cursor-pointer ${i < openTickets.length - 1 ? 'border-b border-border' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] truncate">
                        {ticket.caller_tel && <span className="text-emerald-400 font-medium font-mono">{ticket.caller_tel}</span>}
                        {ticket.caller_tel && ' '}
                        <span className="text-text-primary font-medium">{ticket.clinic_name}</span>
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <StatusBadge status={ticket.status} />
                        {ticket.need_team_check && <NeedsAttentionBadge />}
                        {isStale(ticket) && <StaleBadge />}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-text-muted">
                      <span className="font-mono">{ticket.ticket_ref}</span>
                      <span>·</span>
                      <span>{toProperCase(ticket.created_by_name)}</span>
                      <span>·</span>
                      <span className="tabular-nums">{format(new Date(ticket.created_at), 'dd/MM')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ CHARTS — pushed down, less prominent ═══ */}
      <DashboardCharts data={chartData} />
    </div>
  )
}
