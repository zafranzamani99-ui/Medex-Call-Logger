'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, startOfDay, subDays, startOfWeek, startOfMonth } from 'date-fns'
import { useRouter } from 'next/navigation'
import type { Ticket } from '@/lib/types'
import StatusBadge from '@/components/StatusBadge'
import RecordTypeBadge from '@/components/RecordTypeBadge'
import { IssueTypeBadge } from '@/components/FlagBadge'
import { getDurationLabel, JOB_SHEET_STATUS_COLORS } from '@/lib/constants'
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
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [lkRequests, setLkRequests] = useState<LKRequest[]>([])
  const [jobSheets, setJobSheets] = useState<{ id: string; js_number: string; clinic_name: string; service_date: string; status: string; service_types: string[]; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('mylog-date-range')
      if (saved) { sessionStorage.removeItem('mylog-date-range'); return saved as DateRange }
    }
    return 'today'
  })
  const [search, setSearch] = useState('')

  const navigateToTicket = useCallback((ticketId: string) => {
    sessionStorage.setItem('mylog-date-range', dateRange)
    sessionStorage.setItem('mylog-scroll-y', String(window.scrollY))
    router.push(`/tickets/${ticketId}`)
  }, [router, dateRange])

  useEffect(() => {
    if (!loading) {
      const savedY = sessionStorage.getItem('mylog-scroll-y')
      if (savedY) {
        requestAnimationFrame(() => {
          window.scrollTo(0, parseInt(savedY, 10))
          sessionStorage.removeItem('mylog-scroll-y')
        })
      }
    }
  }, [loading])

  // Load current user
  useEffect(() => {
    async function loadUser() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setUserId(session.user.id)
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', session.user.id)
          .single()
        if (profile) setUserName(profile.display_name)
      }
    }
    loadUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch data when user or date range changes
  useEffect(() => {
    if (userName && userId) fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName, userId, dateRange])

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

    // Fetch my job sheets
    let jsQuery = supabase
      .from('job_sheets')
      .select('id, js_number, clinic_name, service_date, status, service_types, created_at')
      .or(`service_by_id.eq.${userId},created_by.eq.${userId}`)

    if (dateFrom) {
      if (dateRange === 'yesterday') {
        jsQuery = jsQuery
          .gte('created_at', dateFrom)
          .lt('created_at', startOfDay(new Date()).toISOString())
      } else {
        jsQuery = jsQuery.gte('created_at', dateFrom)
      }
    }
    jsQuery = jsQuery.order('created_at', { ascending: false })

    const queries: Promise<{ data: unknown }>[] = [ticketQuery, lkQuery, jsQuery]
    if (updatedQuery) queries.push(updatedQuery)
    const results = await Promise.all(queries)

    const created = (results[0].data || []) as Ticket[]
    const createdIds = new Set(created.map(t => t.id))
    const updated = updatedQuery ? ((results[3].data || []) as Ticket[]).filter(t => !createdIds.has(t.id)) : []

    // Mark updated-only tickets so UI can show "Updated" badge
    updated.forEach(t => { (t as Ticket & { _isUpdatedOnly?: boolean })._isUpdatedOnly = true })
    setTickets([...created, ...updated])
    if (results[1].data) setLkRequests(results[1].data as LKRequest[])
    setJobSheets((results[2].data || []) as typeof jobSheets)
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
            <div className="rounded-xl p-3 border border-border bg-surface-raised">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Total</p>
              <p className="text-xl font-bold text-text-primary tabular-nums mt-0.5">{tickets.length}</p>
              <p className="text-[11px] text-text-tertiary mt-0.5">
                {callLogs.length} call{callLogs.length !== 1 ? 's' : ''}
                {ticketLogs.length > 0 && ` · ${ticketLogs.length} ticket${ticketLogs.length !== 1 ? 's' : ''}`}
                {lkRequests.length > 0 && ` · ${lkRequests.length} LK`}
                {jobSheets.length > 0 && ` · ${jobSheets.length} JS`}
              </p>
            </div>
            <div className="rounded-xl p-3 border border-border bg-surface-raised">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Resolved</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="text-xl font-bold text-emerald-400 tabular-nums">{resolutionPct}%</p>
                <p className="text-[11px] text-text-tertiary">{resolvedCount}/{tickets.length}</p>
              </div>
              {/* Mini progress bar */}
              <div className="mt-1.5 h-1 rounded-full bg-surface-inset overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${resolutionPct}%`, background: '#34d399' }}
                />
              </div>
            </div>
            <div className={`rounded-xl p-3 border ${
              unresolvedTickets.length > 0 ? 'border-amber-500/25 bg-amber-500/[0.04]' : 'border-border bg-surface-raised'
            }`}>
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
                    onClick={() => navigateToTicket(ticket.id)}
                    className="w-full text-left px-4 py-3 hover:bg-amber-500/[0.04] transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-text-primary">{ticket.clinic_name}</span>
                          <StatusBadge status={ticket.status} />
                          <span className="text-[11px] text-text-tertiary ml-auto shrink-0">
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
                         placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/30"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary p-1"
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
            <div className="card overflow-hidden divide-y divide-border mb-8">
              {filteredTickets.map((ticket) => {
                const isRepeat = clinicCounts[ticket.clinic_code] >= 2
                return (
                  <div
                    key={ticket.id}
                    onClick={() => navigateToTicket(ticket.id)}
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
                        <svg className="size-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </div>
                    {/* Detail fields — only show non-empty */}
                    <div className="mt-1 space-y-0.5 text-xs leading-relaxed">
                      <p className="line-clamp-1"><span className="text-sky-400 font-medium">ISSUE:</span> <span className="text-text-secondary">{ticket.issue || ''}</span></p>
                      {ticket.my_response && (
                        <p className="line-clamp-1"><span className="text-emerald-400 font-medium">RESPONSE:</span> <span className="text-text-secondary">{ticket.my_response}</span></p>
                      )}
                      {ticket.next_step && (
                        <p className="line-clamp-1"><span className="text-violet-400 font-medium">NEXT:</span> <span className="text-text-secondary">{ticket.next_step}</span></p>
                      )}
                      {ticket.timeline_from_customer && (
                        <p className="line-clamp-1"><span className="text-orange-400 font-medium">TIMELINE:</span> <span className="text-text-secondary">{ticket.timeline_from_customer}</span></p>
                      )}
                      {ticket.internal_timeline && (
                        <p className="line-clamp-1"><span className="text-rose-400 font-medium">INTERNAL:</span> <span className="text-text-secondary">{ticket.internal_timeline}</span></p>
                      )}
                    </div>
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
          )}

          {/* My LK Requests */}
          {lkRequests.length > 0 && !search && (
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">License Key Requests</span>
                <div className="flex-1 h-px bg-border" />
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

          {/* My Job Sheets */}
          {jobSheets.length > 0 && !search && (
            <div className="mt-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Job Sheets</span>
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] text-text-muted tabular-nums">{jobSheets.length}</span>
              </div>
              <div className="card overflow-hidden divide-y divide-border">
                {jobSheets.map((js) => {
                  const sc = JOB_SHEET_STATUS_COLORS[js.status] || { bg: 'bg-zinc-500/20', text: 'text-zinc-400' }
                  return (
                    <div
                      key={js.id}
                      onClick={() => router.push(`/job-sheets/${js.id}`)}
                      className="px-4 py-3 hover:bg-surface-raised/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs text-accent flex-shrink-0">{js.js_number}</span>
                          <span className="text-sm text-text-primary truncate">{js.clinic_name}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sc.bg} ${sc.text}`}>
                            {js.status}
                          </span>
                          <span className="text-xs text-text-tertiary tabular-nums">
                            {format(new Date(js.service_date), 'dd MMM')}
                          </span>
                        </div>
                      </div>
                      {(js.service_types || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {js.service_types.map((t: string) => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
