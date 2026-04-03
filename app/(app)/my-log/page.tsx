'use client'

import { useState, useEffect } from 'react'
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

  // Stats
  const callLogs = tickets.filter(t => t.record_type === 'call')
  const ticketLogs = tickets.filter(t => t.record_type === 'ticket')
  const resolvedCount = tickets.filter(t => t.status === 'Resolved').length

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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">My Log</h1>
          <p className="text-sm text-text-tertiary mt-0.5">{userName}&apos;s work tracker</p>
        </div>
      </div>

      {/* Date range filter */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {(Object.keys(dateLabels) as DateRange[]).map((range) => (
          <button
            key={range}
            onClick={() => setDateRange(range)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              dateRange === range
                ? 'bg-accent text-white'
                : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            {dateLabels[range]}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-surface border border-border rounded-lg p-3">
          <div className="text-2xl font-bold text-text-primary tabular-nums">{callLogs.length}</div>
          <div className="text-xs text-text-tertiary">Call Logs</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <div className="text-2xl font-bold text-text-primary tabular-nums">{ticketLogs.length}</div>
          <div className="text-xs text-text-tertiary">Tickets</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <div className="text-2xl font-bold text-text-primary tabular-nums">{resolvedCount}</div>
          <div className="text-xs text-text-tertiary">Resolved</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <div className="text-2xl font-bold text-text-primary tabular-nums">{lkRequests.length}</div>
          <div className="text-xs text-text-tertiary">LK Requests</div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 skeleton rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {/* My Call Logs & Tickets */}
          <div className="mb-6">
            <h2 className="text-sm font-medium text-text-secondary mb-2">
              Call Logs & Tickets ({tickets.length})
            </h2>
            {tickets.length === 0 ? (
              <EmptyState icon={EmptyIcons.phone} title={`No records for ${dateLabels[dateRange].toLowerCase()}`} />
            ) : (
              <div className="bg-surface border border-border rounded-lg overflow-hidden divide-y divide-border">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    onClick={() => router.push(`/tickets/${ticket.id}`)}
                    className="px-4 py-3 hover:bg-surface-raised transition-colors cursor-pointer"
                  >
                    {/* Row 1: Ref + Phone + Clinic + Status */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-mono text-xs text-text-tertiary flex-shrink-0">
                          {ticket.ticket_ref}
                        </span>
                        {ticket.caller_tel && (
                          <span className="font-mono text-sm text-emerald-400 font-semibold flex-shrink-0">
                            {ticket.caller_tel}
                          </span>
                        )}
                        <span className="text-sm text-text-secondary truncate">
                          {ticket.clinic_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(ticket as Ticket & { _isUpdatedOnly?: boolean })._isUpdatedOnly && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-medium">Updated</span>
                        )}
                        <StatusBadge status={ticket.status} />
                      </div>
                    </div>

                    {/* Row 2: Issue text */}
                    <p className="text-sm text-text-secondary mt-1 line-clamp-1">
                      {ticket.issue}
                    </p>

                    {/* Row 3: Metadata */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <RecordTypeBadge recordType={ticket.record_type} />
                      <IssueTypeBadge issueType={ticket.issue_type} />
                      {ticket.call_duration && (
                        <span className="text-xs text-text-tertiary">{getDurationLabel(ticket.call_duration)}</span>
                      )}
                      <span className="text-xs text-text-tertiary tabular-nums ml-auto">
                        {format(new Date(ticket.created_at), 'dd/MM/yyyy HH:mm')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* My LK Requests */}
          <div>
            <h2 className="text-sm font-medium text-text-secondary mb-2">
              License Key Requests ({lkRequests.length})
            </h2>
            {lkRequests.length === 0 ? (
              <EmptyState icon={EmptyIcons.key} title={`No LK requests for ${dateLabels[dateRange].toLowerCase()}`} />
            ) : (
              <div className="bg-surface border border-border rounded-lg overflow-hidden divide-y divide-border">
                {lkRequests.map((lk) => (
                  <div key={lk.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-accent flex-shrink-0">
                          {lk.clinic_code}
                        </span>
                        <span className="text-sm text-text-primary">{lk.clinic_name}</span>
                      </div>
                      <span className="text-xs text-text-tertiary tabular-nums">
                        {format(new Date(lk.created_at), 'dd/MM/yyyy HH:mm')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
