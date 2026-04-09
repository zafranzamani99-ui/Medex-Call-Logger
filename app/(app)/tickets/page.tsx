'use client'

import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, isToday, isYesterday } from 'date-fns'
import type { Ticket, TicketStatus, RecordType } from '@/lib/types'
import { STATUSES, ISSUE_TYPES, STATUS_COLORS, getIssueTypeColor, RECORD_TYPE_COLORS, getDurationLabel, ISSUE_CATEGORIES, getIssueCategoryColor, toProperCase } from '@/lib/constants'
import { isStale } from '@/lib/staleDetection'
import StatusBadge from '@/components/StatusBadge'
import RecordTypeBadge from '@/components/RecordTypeBadge'
import { NeedsAttentionBadge, StaleBadge, IssueTypeBadge } from '@/components/FlagBadge'
import { HistorySkeleton } from '@/components/Skeleton'
import { SlidePanel } from '@/components/Modal'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import EmptyState, { EmptyIcons } from '@/components/ui/EmptyState'

// WHY: History page — spec Section 10. All tickets with filters, search, CSV export.
// UPGRADE: Desktop table layout at md:, sortable columns, filter chips, better pagination.

const PAGE_SIZE = 25

type SortKey = 'created_at' | 'updated_at' | 'clinic_name' | 'issue_type' | 'status' | 'created_by_name'
type SortDir = 'asc' | 'desc'

export default function HistoryPage() {
  const router = useRouter()
  const supabase = createClient()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState<string[]>([])

  // Filters (spec Section 10.1)
  const [showFilters, setShowFilters] = useState(false)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<TicketStatus[]>([])
  const [issueTypeFilter, setIssueTypeFilter] = useState<string[]>([])
  const [issueCategoryFilter, setIssueCategoryFilter] = useState<string[]>([])
  const [loggedByFilter, setLoggedByFilter] = useState('')
  const [recordTypeFilter, setRecordTypeFilter] = useState<'all' | RecordType>('all')
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [staleOnly, setStaleOnly] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [renewalFilter, setRenewalFilter] = useState('')

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Pagination
  const [page, setPage] = useState(1)

  // Timeline entry counts per ticket
  const [updateCounts, setUpdateCounts] = useState<Record<string, number>>({})
  const searchRef = useRef<HTMLInputElement>(null)

  // Persist/restore filters via sessionStorage so back navigation preserves state
  const FILTERS_KEY = 'history-filters'
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(FILTERS_KEY)
      if (saved) {
        const f = JSON.parse(saved)
        if (f.search) setSearch(f.search)
        if (f.dateFrom) setDateFrom(f.dateFrom)
        if (f.dateTo) setDateTo(f.dateTo)
        if (f.statusFilter?.length) setStatusFilter(f.statusFilter)
        if (f.issueTypeFilter?.length) setIssueTypeFilter(f.issueTypeFilter)
        if (f.issueCategoryFilter?.length) setIssueCategoryFilter(f.issueCategoryFilter)
        if (f.loggedByFilter) setLoggedByFilter(f.loggedByFilter)
        if (f.recordTypeFilter && f.recordTypeFilter !== 'all') setRecordTypeFilter(f.recordTypeFilter)
        if (f.flaggedOnly) setFlaggedOnly(f.flaggedOnly)
        if (f.staleOnly) setStaleOnly(f.staleOnly)
        if (f.sortKey) setSortKey(f.sortKey)
        if (f.sortDir) setSortDir(f.sortDir)
        if (f.page) setPage(f.page)
      }
    } catch { /* ignore */ }

    // Handle URL query params (e.g. ?filter=urgent from Dashboard)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const filterParam = params.get('filter')
      if (filterParam === 'urgent') {
        setStatusFilter(['In Progress', 'Pending Customer', 'Pending Team', 'Escalated'])
        setFlaggedOnly(false)
        setPage(1)
      }
    }
  }, [])

  const saveFilters = useCallback(() => {
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify({
      search, dateFrom, dateTo, statusFilter, issueTypeFilter, issueCategoryFilter,
      loggedByFilter, recordTypeFilter, flaggedOnly, staleOnly,
      sortKey, sortDir, page,
    }))
  }, [search, dateFrom, dateTo, statusFilter, issueTypeFilter, issueCategoryFilter,
      loggedByFilter, recordTypeFilter, flaggedOnly, staleOnly,
      sortKey, sortDir, page])

  // Save filters whenever they change
  useEffect(() => { saveFilters() }, [saveFilters])

  // ─── Scroll position restore (save before leaving, restore on back) ───
  const navigateToTicket = useCallback((ticketId: string) => {
    sessionStorage.setItem('tickets-scroll-y', String(window.scrollY))
    router.push(`/tickets/${ticketId}`)
  }, [router])

  useEffect(() => {
    if (!loading) {
      const savedY = sessionStorage.getItem('tickets-scroll-y')
      if (savedY) {
        requestAnimationFrame(() => {
          window.scrollTo(0, parseInt(savedY, 10))
          sessionStorage.removeItem('tickets-scroll-y')
        })
      }
    }
  }, [loading])

  // ─── Column resize ───
  const STORAGE_KEY = 'history-col-widths'
  const COL_KEYS = ['ref', 'phone', 'clinic', 'issue', 'type', 'status', 'jira', 'next', 'staff', 'actions'] as const
  const DEFAULT_WIDTHS: Record<string, number> = {
    ref: 155, phone: 120, clinic: 200, issue: 320, type: 105, status: 150, jira: 90, next: 150, staff: 80, actions: 50,
  }
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDTHS
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      return saved ? { ...DEFAULT_WIDTHS, ...JSON.parse(saved) } : DEFAULT_WIDTHS
    } catch { return DEFAULT_WIDTHS }
  })
  const resizing = useRef<{ col: string; startX: number; startW: number } | null>(null)

  const onResizeStart = useCallback((col: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizing.current = { col, startX: e.clientX, startW: colWidths[col] }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [colWidths])

  useEffect(() => {
    let rafId: number | null = null
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return
      const { col, startX, startW } = resizing.current
      const newW = Math.max(60, startW + (e.clientX - startX))
      if (rafId) return // skip if rAF already pending
      rafId = requestAnimationFrame(() => {
        rafId = null
        setColWidths(prev => ({ ...prev, [col]: newW }))
      })
    }
    const onUp = () => {
      if (!resizing.current) return
      resizing.current = null
      if (rafId) { cancelAnimationFrame(rafId); rafId = null }
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // Save to session
      setColWidths(prev => {
        try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prev)) } catch {}
        return prev
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // Fetch tickets + timeline counts
  useEffect(() => {
    async function fetchTickets() {
      const { data } = await supabase
        .from('tickets')
        .select('*, timeline_entries(count)')
        .order('created_at', { ascending: false })

      if (data) {
        const typed = data as (Ticket & { timeline_entries: [{ count: number }] })[]
        setTickets(typed)
        const counts: Record<string, number> = {}
        typed.forEach((t) => {
          counts[t.id] = t.timeline_entries?.[0]?.count || 0
        })
        setUpdateCounts(counts)
        const names = Array.from(new Set(typed.map((t) => t.created_by_name)))
        setAgents(names)
      }
      setLoading(false)
    }
    fetchTickets()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply filters
  const filtered = useMemo(() => {
    let result = tickets

    if (search) {
      const s = search.toLowerCase()
      result = result.filter(
        (t) =>
          t.clinic_name.toLowerCase().includes(s) ||
          t.clinic_code.toLowerCase().includes(s) ||
          (t.pic && t.pic.toLowerCase().includes(s)) ||
          t.issue.toLowerCase().includes(s) ||
          (t.ticket_ref && t.ticket_ref.toLowerCase().includes(s)) ||
          (t.caller_tel && t.caller_tel.toLowerCase().includes(s)) ||
          (t.clinic_phone && t.clinic_phone.toLowerCase().includes(s))
      )
    }
    if (dateFrom) result = result.filter((t) => t.created_at >= dateFrom)
    if (dateTo) result = result.filter((t) => t.created_at <= dateTo + 'T23:59:59')
    if (statusFilter.length > 0) result = result.filter((t) => statusFilter.includes(t.status))
    if (issueTypeFilter.length > 0) result = result.filter((t) => issueTypeFilter.includes(t.issue_type))
    if (issueCategoryFilter.length > 0) result = result.filter((t) => t.issue_category && issueCategoryFilter.includes(t.issue_category))
    if (loggedByFilter) result = result.filter((t) => t.created_by_name === loggedByFilter)
    if (flaggedOnly) result = result.filter((t) => t.need_team_check)
    if (staleOnly) result = result.filter((t) => isStale(t))
    if (recordTypeFilter !== 'all') result = result.filter((t) => t.record_type === recordTypeFilter)
    if (renewalFilter) result = result.filter((t) => t.renewal_status === renewalFilter)

    return result
  }, [tickets, search, dateFrom, dateTo, statusFilter, issueTypeFilter, issueCategoryFilter, loggedByFilter, flaggedOnly, staleOnly, recordTypeFilter, renewalFilter])

  // Apply sorting
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'created_at':
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'updated_at':
          cmp = new Date(a.last_activity_at || a.created_at).getTime() - new Date(b.last_activity_at || b.created_at).getTime()
          break
        case 'clinic_name':
          cmp = a.clinic_name.localeCompare(b.clinic_name)
          break
        case 'issue_type':
          cmp = a.issue_type.localeCompare(b.issue_type)
          break
        case 'status':
          cmp = a.status.localeCompare(b.status)
          break
        case 'created_by_name':
          cmp = a.created_by_name.localeCompare(b.created_by_name)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  // Pagination
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Reset page when filters or sort change
  useEffect(() => { setPage(1) }, [search, dateFrom, dateTo, statusFilter, issueTypeFilter, issueCategoryFilter, loggedByFilter, flaggedOnly, staleOnly, recordTypeFilter, renewalFilter, sortKey, sortDir])

  // "/" keyboard shortcut — focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Toggle sort
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // Sort indicator component
  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <svg className="size-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
    return (
      <svg className="size-3 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
          d={sortDir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
        />
      </svg>
    )
  }

  // CSV Export (spec Section 10.3)
  const handleExport = () => {
    const headers = [
      'Ref', 'Type', 'Date', 'Duration', 'Clinic Code', 'Clinic Name', 'City', 'State', 'Product',
      'MTN Expiry', 'Renewal', 'Category', 'Issue Type', 'Issue', 'My Response', 'Jira Link', 'Next Step',
      'Status', 'PIC', 'Caller Tel', 'Logged By', 'Need Team Check'
    ]
    const rows = filtered.map((t) => [
      t.ticket_ref,
      t.record_type === 'ticket' ? 'Ticket' : 'Call Log',
      format(new Date(t.created_at), 'dd/MM/yyyy HH:mm'),
      getDurationLabel(t.call_duration),
      t.clinic_code, t.clinic_name, t.city || '', t.state || '', t.product_type || '',
      t.mtn_expiry ? t.mtn_expiry.split('-').reverse().join('/') : '', t.renewal_status || '',
      t.issue_category || '', t.issue_type,
      `"${(t.issue || '').replace(/"/g, '""')}"`,
      `"${(t.my_response || '').replace(/"/g, '""')}"`,
      t.jira_link || '', t.next_step || '', t.status, t.pic || '', t.caller_tel || '',
      t.created_by_name, t.need_team_check ? 'Yes' : 'No',
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `medex_tickets_${format(new Date(), 'yyyyMMdd')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const toggleStatus = (s: TicketStatus) => {
    setStatusFilter((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])
  }
  const toggleIssueType = (t: string) => {
    setIssueTypeFilter((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])
  }
  const toggleIssueCategory = (c: string) => {
    setIssueCategoryFilter((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])
  }

  const handleDelete = async (ticket: Ticket, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete ticket ${ticket.ticket_ref}?`)) return
    await supabase.from('tickets').delete().eq('id', ticket.id)
    setTickets((prev) => prev.filter((t) => t.id !== ticket.id))
  }

  const activeFilterCount =
    statusFilter.length + issueTypeFilter.length + issueCategoryFilter.length +
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) +
    (loggedByFilter ? 1 : 0) + (flaggedOnly ? 1 : 0) + (staleOnly ? 1 : 0)

  const clearAllFilters = () => {
    setStatusFilter([]); setIssueTypeFilter([]); setIssueCategoryFilter([]); setDateFrom(''); setDateTo('')
    setLoggedByFilter(''); setFlaggedOnly(false); setStaleOnly(false)
  }

  // Pagination range
  const paginationRange = useMemo(() => {
    const range: (number | 'ellipsis')[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) range.push(i)
    } else {
      range.push(1)
      if (page > 3) range.push('ellipsis')
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        range.push(i)
      }
      if (page < totalPages - 2) range.push('ellipsis')
      range.push(totalPages)
    }
    return range
  }, [page, totalPages])

  // Date group label — "Today", "Yesterday", or "01 April 2026"
  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr)
    if (isToday(date)) return 'Today'
    if (isYesterday(date)) return 'Yesterday'
    return format(date, 'd MMMM yyyy')
  }

  // Get date key for grouping (just the date part, no time)
  const getDateKey = (dateStr: string) => format(new Date(dateStr), 'yyyy-MM-dd')

  if (loading) return <HistorySkeleton />

  // Row styling by status — open/escalated get visual weight, resolved gets muted
  const getRowClasses = (ticket: Ticket) => {
    const base = 'cursor-pointer transition-all'
    switch (ticket.status) {
      case 'In Progress':
      case 'Pending Customer':
      case 'Pending Team':
        return `${base} hover:bg-indigo-500/[0.04] border-l-2 border-l-indigo-400/40`
      case 'Escalated':
        return `${base} hover:bg-red-500/[0.04] border-l-2 border-l-red-400/40`
      case 'Resolved':
        return `${base} hover:bg-surface-raised opacity-60 hover:opacity-100 border-l-2 border-l-transparent`
      default:
        return `${base} hover:bg-surface-raised border-l-2 border-l-transparent`
    }
  }

  return (
    <div>
      {/* Compact header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">History</h1>
          <p className="text-[13px] text-text-tertiary mt-0.5">{filtered.length} records</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleExport}>
            <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            CSV
          </Button>
        </div>
      </div>

      {/* Command-palette style search */}
      <div className="mb-4 rounded-xl p-1 bg-surface-raised border border-border">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <Input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clinic, code, phone, PIC, issue..."
              className="pl-10 !bg-transparent !border-0 !shadow-none !ring-0 text-sm"
            />
          </div>
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-text-muted bg-surface-inset border border-border rounded">/</kbd>
          <Button
            variant={activeFilterCount > 0 ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setShowFilters(true)}
          >
            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {activeFilterCount > 0 ? `${activeFilterCount}` : 'Filter'}
          </Button>
        </div>

        {/* Quick type toggle + sort */}
        <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-0.5">
          {(['all', 'call', 'ticket'] as const).map((type) => {
            const isActive = recordTypeFilter === type
            const colors = type === 'all'
              ? { bg: 'bg-zinc-500/20', text: 'text-zinc-400' }
              : RECORD_TYPE_COLORS[type]
            return (
              <button key={type} type="button" onClick={() => setRecordTypeFilter(type)}
                className={`pill text-xs ${colors.bg} ${colors.text} ${
                  isActive ? 'pill-active ring-current opacity-100' : 'opacity-50'
                }`}>
                {type === 'all' ? 'All' : type === 'call' ? 'Calls' : 'Tickets'}
              </button>
            )
          })}
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              onClick={() => setSortKey(sortKey === 'updated_at' ? 'created_at' : 'updated_at')}
              className={`text-[11px] transition-colors ${sortKey === 'updated_at' ? 'text-indigo-400 font-medium' : 'text-text-muted hover:text-text-primary'}`}
            >
              {sortKey === 'updated_at' ? 'Last Updated' : 'Created'}
            </button>
          </div>
        </div>
      </div>

      {/* Active filter chips — quick dismiss */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {statusFilter.map((s) => (
            <button key={s} onClick={() => toggleStatus(s)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium shadow-sm ${STATUS_COLORS[s].bg} ${STATUS_COLORS[s].text}`}>
              {s}
              <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          ))}
          {issueCategoryFilter.map((cat) => {
            const c = getIssueCategoryColor(cat)
            return (
              <button key={`cat-${cat}`} onClick={() => toggleIssueCategory(cat)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium shadow-sm ${c.bg} ${c.text}`}>
                {cat}
                <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )
          })}
          {issueTypeFilter.map((t) => {
            const c = getIssueTypeColor(t)
            return (
              <button key={t} onClick={() => toggleIssueType(t)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium shadow-sm ${c.bg} ${c.text}`}>
                {t}
                <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )
          })}
          {loggedByFilter && (
            <button onClick={() => setLoggedByFilter('')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium shadow-sm bg-blue-500/20 text-blue-400">
              {loggedByFilter}
              <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
          {dateFrom && (
            <button onClick={() => setDateFrom('')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium shadow-sm bg-zinc-500/20 text-zinc-400">
              From: {dateFrom}
              <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
          {dateTo && (
            <button onClick={() => setDateTo('')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium shadow-sm bg-zinc-500/20 text-zinc-400">
              To: {dateTo}
              <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
          {flaggedOnly && (
            <button onClick={() => setFlaggedOnly(false)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium shadow-sm bg-red-500/20 text-red-400">
              Flagged
              <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
          {staleOnly && (
            <button onClick={() => setStaleOnly(false)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium shadow-sm bg-orange-500/20 text-orange-400">
              Stale
              <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
          <button onClick={clearAllFilters} className="text-xs text-text-tertiary hover:text-text-primary transition-colors ml-1">
            Clear all
          </button>
        </div>
      )}

      {/* Slide-over filter panel */}
      <SlidePanel open={showFilters} onClose={() => setShowFilters(false)} title="Filters">
        <div className="space-y-5">
          {activeFilterCount > 0 && (
            <button type="button" onClick={clearAllFilters}
              className="text-xs text-accent hover:text-accent-hover transition-colors">
              Clear all filters ({activeFilterCount})
            </button>
          )}
          <div>
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 block">Date Range</span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-text-tertiary mb-1">From</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-2.5 py-2 bg-background border border-border rounded-lg text-text-primary text-sm" />
              </div>
              <div>
                <label className="block text-xs text-text-tertiary mb-1">To</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-2.5 py-2 bg-background border border-border rounded-lg text-text-primary text-sm" />
              </div>
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 block">Logged By</span>
            <select value={loggedByFilter} onChange={(e) => setLoggedByFilter(e.target.value)}
              className="w-full px-2.5 py-2 bg-background border border-border rounded-lg text-text-primary text-sm">
              <option value="">All staff</option>
              {agents.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 block">Status</span>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button key={s} type="button" onClick={() => toggleStatus(s)}
                  className={`pill text-xs ${STATUS_COLORS[s].bg} ${STATUS_COLORS[s].text} ${
                    statusFilter.includes(s) ? 'pill-active ring-current opacity-100' : 'opacity-50'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 block">Category</span>
            <div className="space-y-2">
              {issueCategoryFilter.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {issueCategoryFilter.map((cat) => {
                    const c = getIssueCategoryColor(cat)
                    return (
                      <button key={cat} type="button" onClick={() => toggleIssueCategory(cat)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
                        {cat}
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )
                  })}
                </div>
              )}
              <select value="" onChange={(e) => { if (e.target.value) toggleIssueCategory(e.target.value) }}
                className="w-full px-2.5 py-2 bg-background border border-border rounded-lg text-text-secondary text-sm">
                <option value="">{issueCategoryFilter.length === 0 ? 'All categories' : '+ Add category filter'}</option>
                {ISSUE_CATEGORIES.filter((c) => !issueCategoryFilter.includes(c)).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 block">Issue Type</span>
            <div className="space-y-2">
              {issueTypeFilter.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {issueTypeFilter.map((t) => {
                    const c = getIssueTypeColor(t)
                    return (
                      <button key={t} type="button" onClick={() => toggleIssueType(t)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
                        {t}
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )
                  })}
                </div>
              )}
              <select value="" onChange={(e) => { if (e.target.value) toggleIssueType(e.target.value) }}
                className="w-full px-2.5 py-2 bg-background border border-border rounded-lg text-text-secondary text-sm">
                <option value="">{issueTypeFilter.length === 0 ? 'All types' : '+ Add type filter'}</option>
                {ISSUE_TYPES.filter((t) => !issueTypeFilter.includes(t)).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 block">Flags</span>
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 text-sm text-text-secondary cursor-pointer">
                <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)}
                  className="rounded border-border" />
                Needs Attention only
              </label>
              <label className="flex items-center gap-2.5 text-sm text-text-secondary cursor-pointer">
                <input type="checkbox" checked={staleOnly} onChange={(e) => setStaleOnly(e.target.checked)}
                  className="rounded border-border" />
                Stale only
              </label>
            </div>
          </div>
        </div>
      </SlidePanel>

      {/* ─── Desktop table layout (md+) — resizable columns, saved to sessionStorage ─── */}
      <div className="hidden md:block card overflow-x-auto">
        {paginated.length === 0 ? (
          <EmptyState icon={EmptyIcons.search} title="No records match your filters" description="Try adjusting your search or filters" />
        ) : (
          <table className="text-sm table-fixed" style={{ width: COL_KEYS.reduce((sum, k) => sum + colWidths[k], 0) }}>
            <colgroup>
              {COL_KEYS.map((k) => <col key={k} style={{ width: colWidths[k] }} />)}
            </colgroup>
            <thead>
              <tr className="border-b border-border text-xs text-text-tertiary uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium relative cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('created_at')}>
                  <span className="inline-flex items-center gap-1">Ref / Date <SortIcon column="created_at" /></span>
                  <div className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-10 group" onMouseDown={(e) => onResizeStart('ref', e)}><div className="mx-auto w-px h-full bg-transparent group-hover:bg-accent/60 transition-colors" /></div>
                </th>
                <th className="text-left px-4 py-3 font-medium relative">
                  Phone
                  <div className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-10 group" onMouseDown={(e) => onResizeStart('phone', e)}><div className="mx-auto w-px h-full bg-transparent group-hover:bg-accent/60 transition-colors" /></div>
                </th>
                <th className="text-left px-4 py-3 font-medium relative cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('clinic_name')}>
                  <span className="inline-flex items-center gap-1">Clinic <SortIcon column="clinic_name" /></span>
                  <div className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-10 group" onMouseDown={(e) => onResizeStart('clinic', e)}><div className="mx-auto w-px h-full bg-transparent group-hover:bg-accent/60 transition-colors" /></div>
                </th>
                <th className="text-left px-4 py-3 font-medium relative">
                  Details
                  <div className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-10 group" onMouseDown={(e) => onResizeStart('issue', e)}><div className="mx-auto w-px h-full bg-transparent group-hover:bg-accent/60 transition-colors" /></div>
                </th>
                <th className="text-left px-4 py-3 font-medium relative cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('issue_type')}>
                  <span className="inline-flex items-center gap-1">Type <SortIcon column="issue_type" /></span>
                  <div className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-10 group" onMouseDown={(e) => onResizeStart('type', e)}><div className="mx-auto w-px h-full bg-transparent group-hover:bg-accent/60 transition-colors" /></div>
                </th>
                <th className="text-left px-4 py-3 font-medium relative cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('status')}>
                  <span className="inline-flex items-center gap-1">Status <SortIcon column="status" /></span>
                  <div className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-10 group" onMouseDown={(e) => onResizeStart('status', e)}><div className="mx-auto w-px h-full bg-transparent group-hover:bg-accent/60 transition-colors" /></div>
                </th>
                <th className="text-left px-4 py-3 font-medium relative">
                  <span>Jira</span>
                  <div className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-10 group" onMouseDown={(e) => onResizeStart('jira', e)}><div className="mx-auto w-px h-full bg-transparent group-hover:bg-accent/60 transition-colors" /></div>
                </th>
                <th className="text-left px-4 py-3 font-medium relative">
                  <span>Next Step</span>
                  <div className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-10 group" onMouseDown={(e) => onResizeStart('next', e)}><div className="mx-auto w-px h-full bg-transparent group-hover:bg-accent/60 transition-colors" /></div>
                </th>
                <th className="text-left px-4 py-3 font-medium relative cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('created_by_name')}>
                  <span className="inline-flex items-center gap-1">Staff <SortIcon column="created_by_name" /></span>
                  <div className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-10 group" onMouseDown={(e) => onResizeStart('staff', e)}><div className="mx-auto w-px h-full bg-transparent group-hover:bg-accent/60 transition-colors" /></div>
                </th>
                <th className="text-right px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((ticket, idx) => {
                const dateKey = getDateKey(ticket.created_at)
                const prevDateKey = idx > 0 ? getDateKey(paginated[idx - 1].created_at) : null
                const showDateHeader = dateKey !== prevDateKey

                return (
                  <Fragment key={ticket.id}>
                    {showDateHeader && (
                      <tr>
                        <td colSpan={10} className="px-4 py-2 bg-surface-raised/50">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-text-secondary tracking-wide">{getDateLabel(ticket.created_at)}</span>
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-xs text-text-muted tabular-nums">{format(new Date(ticket.created_at), 'dd/MM/yyyy')}</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr
                      onClick={() => navigateToTicket(ticket.id)}
                      className={getRowClasses(ticket)}
                    >
                      <td className="px-4 py-3 align-top">
                        <span className="font-mono text-xs text-text-tertiary block whitespace-nowrap">{ticket.ticket_ref}</span>
                        <span className="text-xs text-text-muted tabular-nums whitespace-nowrap">{format(new Date(ticket.created_at), 'dd/MM/yy HH:mm')}</span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="font-mono text-sm text-emerald-400 font-medium whitespace-nowrap">{ticket.caller_tel || '-'}</span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="text-text-primary font-medium block">{ticket.clinic_name}</span>
                        <span className="font-mono text-xs text-text-muted">{ticket.clinic_code}</span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="space-y-0.5 text-xs leading-relaxed">
                          {ticket.issue_category && (
                            <p className={`text-[11px] font-semibold uppercase tracking-wide ${getIssueCategoryColor(ticket.issue_category).text}`}>{ticket.issue_category}</p>
                          )}
                          <p><span className="text-amber-400 font-medium">PIC:</span> <span className="text-text-primary">{ticket.pic || ''}</span></p>
                          <p><span className="text-sky-400 font-medium">ISSUE:</span> <span className="text-text-secondary">{ticket.issue}</span></p>
                          <p><span className="text-emerald-400 font-medium">RESPONSE:</span> <span className="text-text-secondary">{ticket.my_response || ''}</span></p>
                          {ticket.call_duration && <p><span className="text-violet-400 font-medium">DURATION:</span> <span className="text-text-secondary">{getDurationLabel(ticket.call_duration)}</span></p>}
                          <p><span className="text-orange-400 font-medium">TIMELINE:</span> <span className="text-text-secondary">{ticket.timeline_from_customer || ''}</span></p>
                          <p><span className="text-rose-400 font-medium">INTERNAL:</span> <span className="text-text-secondary">{ticket.internal_timeline || ''}</span></p>
                        </div>
                        {ticket.attachment_urls?.length > 0 && (
                          <div className="flex items-center gap-1 mt-1 text-text-tertiary">
                            <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                            </svg>
                            <span className="text-xs">{ticket.attachment_urls.length} file{ticket.attachment_urls.length > 1 ? 's' : ''}</span>
                          </div>
                        )}
                        {sortKey === 'updated_at' && ticket.last_change_note && (
                          <p className="text-xs text-purple-400 mt-0.5 truncate">{ticket.last_change_note}{ticket.last_updated_by_name ? ` — ${toProperCase(ticket.last_updated_by_name)}` : ''}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-1">
                          <RecordTypeBadge recordType={ticket.record_type} />
                          <IssueTypeBadge issueType={ticket.issue_type} />
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusBadge status={ticket.status} />
                          {ticket.need_team_check && <NeedsAttentionBadge />}
                          {isStale(ticket) && <StaleBadge />}
                          {(updateCounts[ticket.id] || 0) > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-xs font-medium">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              {updateCounts[ticket.id]}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {ticket.jira_link ? (
                          <a
                            href={ticket.jira_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-accent hover:text-accent-hover underline break-all line-clamp-1"
                            title={ticket.jira_link}
                          >
                            {ticket.jira_link.match(/browse\/([A-Z]+-\d+)/)?.[1] || 'Link'}
                          </a>
                        ) : (
                          <span className="text-xs text-text-muted">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="text-xs text-violet-400">{ticket.next_step || ''}</span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="text-xs text-accent font-medium">{toProperCase(ticket.created_by_name)}</span>
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        <button
                          onClick={(e) => handleDelete(ticket, e)}
                          className="text-text-muted hover:text-red-400 p-1 transition-colors"
                          aria-label={`Delete ${ticket.ticket_ref}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── Mobile card layout ─── */}
      <div className="md:hidden card overflow-hidden">
        {paginated.length === 0 ? (
          <EmptyState icon={EmptyIcons.search} title="No records match your filters" description="Try adjusting your search or filters" />
        ) : (
          <div className="divide-y divide-border">
            {paginated.map((ticket, idx) => {
              const dateKey = getDateKey(ticket.created_at)
              const prevDateKey = idx > 0 ? getDateKey(paginated[idx - 1].created_at) : null
              const showDateHeader = dateKey !== prevDateKey

              return (
              <Fragment key={ticket.id}>
              {showDateHeader && (
                <div className="px-4 py-2 bg-surface-raised/50">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-text-secondary tracking-wide">{getDateLabel(ticket.created_at)}</span>
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-text-muted tabular-nums">{format(new Date(ticket.created_at), 'dd/MM/yyyy')}</span>
                  </div>
                </div>
              )}
              <div
                onClick={() => navigateToTicket(ticket.id)}
                className={`px-4 py-3 ${getRowClasses(ticket)}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs text-text-tertiary flex-shrink-0">{ticket.ticket_ref}</span>
                    {ticket.caller_tel && (
                      <span className="font-mono text-xs text-emerald-400 font-medium flex-shrink-0">{ticket.caller_tel}</span>
                    )}
                    <span className="font-mono text-xs text-accent flex-shrink-0">[{ticket.clinic_code}]</span>
                    <span className="text-sm text-text-primary font-medium truncate">{ticket.clinic_name}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(updateCounts[ticket.id] || 0) > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-xs font-medium">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        {updateCounts[ticket.id]}
                      </span>
                    )}
                    <StatusBadge status={ticket.status} />
                    <button
                      onClick={(e) => handleDelete(ticket, e)}
                      className="text-text-muted hover:text-red-400 p-1"
                      aria-label={`Delete ${ticket.ticket_ref}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="mt-1 space-y-0.5 text-xs leading-relaxed">
                  <p><span className="text-amber-400 font-medium">PIC:</span> <span className="text-text-primary">{ticket.pic || ''}</span></p>
                  <p className="truncate"><span className="text-sky-400 font-medium">ISSUE:</span> <span className="text-text-secondary">{ticket.issue}</span></p>
                  <p className="truncate"><span className="text-emerald-400 font-medium">RESPONSE:</span> <span className="text-text-secondary">{ticket.my_response || ''}</span></p>
                  <p className="truncate"><span className="text-violet-400 font-medium">NEXT:</span> <span className="text-text-secondary">{ticket.next_step || ''}</span></p>
                  <p className="truncate"><span className="text-orange-400 font-medium">TIMELINE:</span> <span className="text-text-secondary">{ticket.timeline_from_customer || ''}</span></p>
                  <p className="truncate"><span className="text-rose-400 font-medium">INTERNAL:</span> <span className="text-text-secondary">{ticket.internal_timeline || ''}</span></p>
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="bg-accent-muted text-accent font-medium text-xs px-1.5 py-0.5 rounded">{toProperCase(ticket.created_by_name)}</span>
                  <span className="text-xs text-text-tertiary tabular-nums">{format(new Date(ticket.created_at), 'dd/MM/yyyy HH:mm')}</span>
                  {ticket.call_duration && <span className="text-xs text-text-tertiary">{getDurationLabel(ticket.call_duration)}</span>}
                  <RecordTypeBadge recordType={ticket.record_type} />
                  <IssueTypeBadge issueType={ticket.issue_type} />
                  {ticket.need_team_check && <NeedsAttentionBadge />}
                  {isStale(ticket) && <StaleBadge />}
                </div>
                {sortKey === 'updated_at' && ticket.last_change_note && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-purple-400">
                    <span className="text-purple-400/60">Last update:</span>
                    <span className="truncate">{ticket.last_change_note}</span>
                    {ticket.last_updated_by_name && <span className="text-text-tertiary">by {toProperCase(ticket.last_updated_by_name)}</span>}
                  </div>
                )}
              </div>
              </Fragment>
              )
            })}
          </div>
        )}
      </div>

      {/* Better pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="p-2 text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors"
            aria-label="Previous page"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {paginationRange.map((item, i) =>
            item === 'ellipsis' ? (
              <span key={`e${i}`} className="px-2 text-text-muted text-sm">...</span>
            ) : (
              <button
                key={item}
                onClick={() => setPage(item)}
                className={`min-w-[32px] h-8 rounded-md text-sm font-medium transition-colors ${
                  page === item
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
                }`}
              >
                {item}
              </button>
            )
          )}
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="p-2 text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors"
            aria-label="Next page"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
