'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, startOfDay, subDays, startOfWeek, startOfMonth } from 'date-fns'
import { useRouter } from 'next/navigation'
import type { Ticket } from '@/lib/types'
import StatusBadge from '@/components/StatusBadge'
import RecordTypeBadge from '@/components/RecordTypeBadge'
import { IssueTypeBadge } from '@/components/FlagBadge'
import { getDurationLabel } from '@/lib/constants'
import EmptyState, { EmptyIcons } from '@/components/ui/EmptyState'

// WHY: Personal work tracker — each staff sees their own call logs, tickets, LK requests.
// Useful for self-tracking and manager oversight.

interface LKRequest {
  id: string
  clinic_code: string
  clinic_name: string
  created_by: string
  created_at: string
}

type DateRange = 'today' | 'yesterday' | 'week' | 'month' | 'all'

export default function MyLogPage() {
  const supabase = createClient()
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [lkRequests, setLkRequests] = useState<LKRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>('today')
  const [search, setSearch] = useState('')

  // Load current user
  useEffect(() => {
    async function loadUser() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', session.user.id)
          .single()
        if (profile) setUserName(profile.display_name)
      }
    }
    loadUser()
  }, [])

  // Fetch data when user or date range changes
  useEffect(() => {
    if (userName) fetchData()
  }, [userName, dateRange])

  const getDateFilter = (): string | null => {
    const now = new Date()
    switch (dateRange) {
      case 'today': return startOfDay(now).toISOString()
      case 'yesterday': return startOfDay(subDays(now, 1)).toISOString()
      case 'week': return startOfWeek(now, { weekStartsOn: 1 }).toISOString()
      case 'month': return startOfMonth(now).toISOString()
      case 'all': return null
    }
  }

  const fetchData = async () => {
    setLoading(true)
    const dateFrom = getDateFilter()

    // Fetch my tickets/call logs
    let ticketQuery = supabase
      .from('tickets')
      .select('*')
      .eq('created_by_name', userName)

    if (dateFrom) {
      if (dateRange === 'yesterday') {
        // Yesterday only: from start of yesterday to start of today
        ticketQuery = ticketQuery
          .gte('created_at', dateFrom)
          .lt('created_at', startOfDay(new Date()).toISOString())
      } else {
        ticketQuery = ticketQuery.gte('created_at', dateFrom)
      }
    }

    ticketQuery = ticketQuery.order('created_at', { ascending: false })

    // Also fetch tickets updated in this period (created earlier but touched recently)
    let updatedQuery: typeof ticketQuery | null = null
    if (dateFrom && dateRange !== 'all') {
      updatedQuery = supabase
        .from('tickets')
        .select('*')
        .eq('created_by_name', userName)
        .lt('created_at', dateFrom) // created BEFORE the date range
      if (dateRange === 'yesterday') {
        updatedQuery = updatedQuery
          .gte('last_activity_at', dateFrom)
          .lt('last_activity_at', startOfDay(new Date()).toISOString())
      } else {
        updatedQuery = updatedQuery.gte('last_activity_at', dateFrom)
      }
      updatedQuery = updatedQuery.order('last_activity_at', { ascending: false })
    }

    // Fetch my LK requests
    let lkQuery = supabase
      .from('license_key_requests')
      .select('*')
      .eq('created_by', userName)

    if (dateFrom) {
      if (dateRange === 'yesterday') {
        lkQuery = lkQuery
          .gte('created_at', dateFrom)
          .lt('created_at', startOfDay(new Date()).toISOString())
      } else {
        lkQuery = lkQuery.gte('created_at', dateFrom)
      }
    }

    lkQuery = lkQuery.order('created_at', { ascending: false })

    const queries: Promise<{ data: unknown }>[] = [ticketQuery, lkQuery]
    if (updatedQuery) queries.push(updatedQuery)
    const results = await Promise.all(queries)

    const created = (results[0].data || []) as Ticket[]
    const createdIds = new Set(created.map(t => t.id))
    const updated = updatedQuery ? ((results[2].data || []) as Ticket[]).filter(t => !createdIds.has(t.id)) : []

    // Mark updated-only tickets so UI can show "Updated" badge
    updated.forEach(t => { (t as Ticket & { _isUpdatedOnly?: boolean })._isUpdatedOnly = true })
    setTickets([...created, ...updated])
    if (results[1].data) setLkRequests(results[1].data as LKRequest[])
    setLoading(false)
  }

  // --- Derived data ---

  // Stats
  const callLogs = tickets.filter(t => t.record_type === 'call')
  const ticketLogs = tickets.filter(t => t.record_type === 'ticket')
  const resolvedCount = tickets.filter(t => t.status === 'Resolved').length
  const unresolvedTickets = tickets.filter(t => t.status !== 'Resolved')
  const resolutionPct = tickets.length > 0 ? Math.round((resolvedCount / tickets.length) * 100) : 0

  // Repeat caller detection — count clinic_code occurrences
  const clinicCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    tickets.forEach(t => {
      if (t.clinic_code) {
        counts[t.clinic_code] = (counts[t.clinic_code] || 0) + 1
      }
    })
    return counts
  }, [tickets])

  // Search filter
  const filteredTickets = useMemo(() => {
    if (!search.trim()) return tickets
    const q = search.toLowerCase()
    return tickets.filter(t =>
      t.clinic_name?.toLowerCase().includes(q) ||
      t.issue?.toLowerCase().includes(q) ||
      t.issue_type?.toLowerCase().includes(q) ||
      t.caller_tel?.toLowerCase().includes(q) ||
      t.ticket_ref?.toLowerCase().includes(q)
    )
  }, [tickets, search])

  const dateLabels: Record<DateRange, string> = {
    today: 'Today',
    yesterday: 'Yesterday',
    week: 'This Week',
    month: 'This Month',
    all: 'All Time',
  }

  // Time-block grouping
  const getTimeBlock = (dateStr: string): 'morning' | 'afternoon' | 'evening' => {
    const hour = new Date(dateStr).getHours()
    if (hour < 12) return 'morning'
    if (hour < 17) return 'afternoon'
    return 'evening'
  }

  const timeBlockLabels = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }

  // Group filtered tickets by time block
  const groupedTickets = filteredTickets.reduce((acc, ticket) => {
    const block = getTimeBlock(ticket.created_at)
    if (!acc[block]) acc[block] = []
    acc[block].push(ticket)
    return acc
  }, {} as Record<string, Ticket[]>)

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">My Log</h1>
            <p className="text-[13px] text-text-tertiary mt-0.5">{userName}&apos;s work overview</p>
          </div>
          {/* Date range pills */}
          <div className="flex gap-1">
            {(Object.keys(dateLabels) as DateRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all ${
                  dateRange === range
                    ? 'bg-indigo-500/15 text-indigo-400'
                    : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.03]'
                }`}
              >
                {dateLabels[range]}
              </button>
            ))}
          </div>
        </div>

        {/* Stats strip */}
        {!loading && tickets.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl p-3 border border-border" style={{ background: 'rgba(255,255,255,0.015)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Total</p>
              <p className="text-xl font-bold text-text-primary tabular-nums mt-0.5">{tickets.length}</p>
              <p className="text-[11px] text-text-tertiary mt-0.5">
                {callLogs.length} call{callLogs.length !== 1 ? 's' : ''}
                {ticketLogs.length > 0 && ` · ${ticketLogs.length} ticket${ticketLogs.length !== 1 ? 's' : ''}`}
                {lkRequests.length > 0 && ` · ${lkRequests.length} LK`}
              </p>
            </div>
            <div className="rounded-xl p-3 border border-border" style={{ background: 'rgba(255,255,255,0.015)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Resolved</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="text-xl font-bold text-emerald-400 tabular-nums">{resolutionPct}%</p>
                <p className="text-[11px] text-text-tertiary">{resolvedCount}/{tickets.length}</p>
              </div>
              {/* Mini progress bar */}
              <div className="mt-1.5 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${resolutionPct}%`, background: '#34d399' }}
                />
              </div>
            </div>
            <div className={`rounded-xl p-3 border ${
              unresolvedTickets.length > 0 ? 'border-amber-500/25' : 'border-border'
            }`} style={{ background: unresolvedTickets.length > 0 ? 'rgba(245,158,11,0.04)' : 'rgba(255,255,255,0.015)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Open</p>
              <p className={`text-xl font-bold tabular-nums mt-0.5 ${
                unresolvedTickets.length > 0 ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {unresolvedTickets.length}
              </p>
              <p className="text-[11px] text-text-tertiary mt-0.5">
                {unresolvedTickets.length === 0 ? 'All caught up' : 'need attention'}
              </p>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 skeleton rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {/* Needs Attention — pinned unresolved items */}
          {unresolvedTickets.length > 0 && !search && (
            <div className="mb-6 rounded-xl overflow-hidden border border-amber-500/20"
              style={{ background: 'rgba(245,158,11,0.03)', boxShadow: '0 0 0 1px rgba(245,158,11,0.05), 0 4px 12px -2px rgba(245,158,11,0.08)' }}
            >
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-500/10" style={{ background: 'rgba(245,158,11,0.05)' }}>
                <div className="flex items-center gap-2">
                  <svg className="size-4 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  <span className="text-xs font-semibold text-amber-300 tracking-wide">
                    {unresolvedTickets.length} need{unresolvedTickets.length === 1 ? 's' : ''} attention
                  </span>
                </div>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {unresolvedTickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    onClick={() => router.push(`/tickets/${ticket.id}`)}
                    className="w-full text-left px-4 py-3 hover:bg-amber-500/[0.04] transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-text-primary">{ticket.clinic_name}</span>
                          <StatusBadge status={ticket.status} />
                          <span className="text-[11px] text-zinc-500 ml-auto shrink-0">
                            {format(new Date(ticket.created_at), 'HH:mm')}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 line-clamp-1">{ticket.issue}</p>
                      </div>
                      <div className="shrink-0 mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-400 group-hover:text-amber-300 transition-colors">
                        <span className="hidden sm:inline">Follow-up</span>
                        <svg className="size-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search bar */}
          <div className="mb-4 relative">
            <svg className="size-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clinic, issue, phone..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-surface-inset border border-border rounded-lg text-white
                         placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/30"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-1"
              >
                <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Search result count */}
          {search && (
            <p className="text-[11px] text-text-muted mb-3">
              {filteredTickets.length} result{filteredTickets.length !== 1 ? 's' : ''} for &quot;{search}&quot;
            </p>
          )}

          {/* Time-block grouped tickets */}
          {filteredTickets.length === 0 ? (
            <EmptyState
              icon={EmptyIcons.phone}
              title={search ? `No results for "${search}"` : `No records for ${dateLabels[dateRange].toLowerCase()}`}
            />
          ) : (
            <div className="space-y-5 mb-8">
              {(['morning', 'afternoon', 'evening'] as const).map((block) => {
                const blockTickets = groupedTickets[block]
                if (!blockTickets || blockTickets.length === 0) return null
                return (
                  <div key={block}>
                    {/* Time block header */}
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                        {timeBlockLabels[block]}
                      </span>
                      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
                      <span className="text-[11px] text-text-muted tabular-nums">{blockTickets.length}</span>
                    </div>

                    <div className="card overflow-hidden divide-y divide-border">
                      {blockTickets.map((ticket) => {
                        const isRepeat = clinicCounts[ticket.clinic_code] >= 2
                        return (
                          <div
                            key={ticket.id}
                            onClick={() => router.push(`/tickets/${ticket.id}`)}
                            className={`px-4 py-2.5 transition-all cursor-pointer group ${
                              ticket.status === 'Resolved'
                                ? 'hover:bg-white/[0.02] opacity-60 hover:opacity-100'
                                : 'hover:bg-indigo-500/[0.03] border-l-2 border-l-indigo-400/30'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-xs text-text-muted tabular-nums flex-shrink-0">
                                  {format(new Date(ticket.created_at), 'HH:mm')}
                                </span>
                                {ticket.caller_tel && (
                                  <span className="font-mono text-xs text-emerald-400 font-medium flex-shrink-0">
                                    {ticket.caller_tel}
                                  </span>
                                )}
                                <span className="text-sm text-text-primary font-medium truncate">
                                  {ticket.clinic_name}
                                </span>
                                {isRepeat && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-500/15 text-text-secondary font-medium flex-shrink-0 tabular-nums">
                                    {clinicCounts[ticket.clinic_code]}x
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {(ticket as Ticket & { _isUpdatedOnly?: boolean })._isUpdatedOnly && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-medium">Updated</span>
                                )}
                                <StatusBadge status={ticket.status} />
                                {/* Clickable indicator */}
                                <svg className="size-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                </svg>
                              </div>
                            </div>
                            <p className="text-sm text-text-secondary mt-1 line-clamp-1">{ticket.issue}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <RecordTypeBadge recordType={ticket.record_type} />
                              <IssueTypeBadge issueType={ticket.issue_type} />
                              {ticket.call_duration && (
                                <span className="text-xs text-text-tertiary">{getDurationLabel(ticket.call_duration)}</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* My LK Requests */}
          {lkRequests.length > 0 && !search && (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">License Key Requests</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
                <span className="text-[11px] text-text-muted tabular-nums">{lkRequests.length}</span>
              </div>
              <div className="card overflow-hidden divide-y divide-border">
                {lkRequests.map((lk) => (
                  <div key={lk.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-indigo-400 flex-shrink-0">{lk.clinic_code}</span>
                        <span className="text-sm text-text-primary">{lk.clinic_name}</span>
                      </div>
                      <span className="text-xs text-text-tertiary tabular-nums">
                        {format(new Date(lk.created_at), 'HH:mm')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
