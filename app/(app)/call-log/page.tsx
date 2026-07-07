'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, startOfDay, endOfDay } from 'date-fns'
import { toProperCase, RENEWAL_COLORS } from '@/lib/constants'
import { ModalDialog } from '@/components/Modal'
import Button from '@/components/ui/Button'
import { Label, Input, Textarea } from '@/components/ui/Input'
import EmptyState, { EmptyIcons } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import HeaderFilter from '@/components/table/HeaderFilter'
import { HorizontalDndProvider, SortableHeader, reorderColumns, PlainResizeProvider, PlainResizeHandle, PlainResizeIndicator } from '@/components/table/spreadsheet-kit'

const PAGE_SIZE = 25

type Tab = 'log' | 'missed'
type SourceType = 'submitted' | 'draft' | 'missed'
type SortKey = 'time' | 'phone' | 'clinic' | 'staff' | 'source'
type SortDir = 'asc' | 'desc'

interface CallEntry {
  id: string
  phone: string
  clinic: string
  staff: string
  time: string
  source: SourceType
  status?: string
  ticketRef?: string
  notes?: string
  resolvedStatus?: string | null
  resolvedByName?: string | null
  resolvedAt?: string | null
  resolvedNote?: string | null
  renewalStatus?: string | null
}

interface PhoneSuggestion {
  phone: string
  clinic: string
  count: number
}

interface VoiceGoRow {
  times: string[]
  phone: string
  matched: boolean
  matchedClinic?: string
  matchedRef?: string
  selected: boolean
}

const SOURCE_COLORS: Record<SourceType, { bg: string; text: string }> = {
  submitted: { bg: 'bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
  draft:     { bg: 'bg-amber-500/20',   text: 'text-amber-600 dark:text-amber-400' },
  missed:    { bg: 'bg-red-500/20',      text: 'text-red-600 dark:text-red-400' },
}
const SOURCE_LABELS: Record<SourceType, string> = {
  submitted: 'Submitted', draft: 'Draft', missed: 'Missed',
}

// ── Call Log tab columns ─────────────────────────────────────────
const LOG_COL_KEYS = ['time', 'phone', 'clinic', 'staff', 'source', 'actions'] as const
const LOG_COL_LABELS: Record<string, string> = {
  time: 'Time', phone: 'Phone No.', clinic: 'Clinic', staff: 'Staff', source: 'Source', actions: '',
}
const LOG_ALWAYS_VISIBLE = new Set(['time', 'phone', 'actions'])
const LOG_DEFAULT_WIDTHS: Record<string, number> = {
  time: 90, phone: 150, clinic: 320, staff: 110, source: 250, actions: 40,
}

// ── Missed tab columns ──────────────────────────────────────────
const MISSED_COL_KEYS = ['time', 'phone', 'clinic', 'notes', 'resolution', 'actions'] as const
const MISSED_COL_LABELS: Record<string, string> = {
  time: 'Time', phone: 'Phone No.', clinic: 'Clinic', notes: 'Notes', resolution: 'Action / Status', actions: '',
}
const MISSED_ALWAYS_VISIBLE = new Set(['time', 'phone', 'actions'])
const MISSED_DEFAULT_WIDTHS: Record<string, number> = {
  time: 90, phone: 150, clinic: 220, notes: 180, resolution: 250, actions: 40,
}

export default function CallLogPage() {
  const supabase = createClient()
  const { toast } = useToast()

  const [tab, setTab] = useState<Tab>('log')
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [allEntries, setAllEntries] = useState<CallEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const logTableRef = useRef<HTMLDivElement | null>(null)
  const missedTableRef = useRef<HTMLDivElement | null>(null)

  const [userId, setUserId] = useState('')
  const [supportStaffIds, setSupportStaffIds] = useState<string[]>([])
  const [userName, setUserName] = useState('')

  // Source filter pills (call log tab only)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'submitted' | 'draft'>('all')

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('time')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Header column filters
  const [colClinic, setColClinic] = useState<Set<string>>(new Set())
  const [colStaff, setColStaff] = useState<Set<string>>(new Set())
  const [colSource, setColSource] = useState<Set<string>>(new Set())

  // Pagination
  const [page, setPage] = useState(1)

  // ── Call Log tab column config ──────────────────────────────────
  const LOG_VIS_KEY = 'calllog-col-visibility'
  const [logColVis, setLogColVis] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return Object.fromEntries(LOG_COL_KEYS.map(k => [k, true]))
    try {
      const saved = localStorage.getItem(LOG_VIS_KEY)
      const base = Object.fromEntries(LOG_COL_KEYS.map(k => [k, true]))
      return saved ? { ...base, ...JSON.parse(saved) } : base
    } catch { return Object.fromEntries(LOG_COL_KEYS.map(k => [k, true])) }
  })
  useEffect(() => { try { localStorage.setItem(LOG_VIS_KEY, JSON.stringify(logColVis)) } catch {} }, [logColVis])

  const LOG_ORDER_KEY = 'calllog-col-order'
  const [logColOrder, setLogColOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [...LOG_COL_KEYS]
    try {
      const saved = localStorage.getItem(LOG_ORDER_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        const missing = LOG_COL_KEYS.filter(k => !parsed.includes(k))
        return [...parsed.filter(k => (LOG_COL_KEYS as readonly string[]).includes(k)), ...missing]
      }
    } catch {}
    return [...LOG_COL_KEYS]
  })
  useEffect(() => { try { localStorage.setItem(LOG_ORDER_KEY, JSON.stringify(logColOrder)) } catch {} }, [logColOrder])

  const LOG_WIDTHS_KEY = 'calllog-col-widths-v2'
  const [logColWidths, setLogColWidths] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return LOG_DEFAULT_WIDTHS
    try {
      const saved = localStorage.getItem(LOG_WIDTHS_KEY)
      return saved ? { ...LOG_DEFAULT_WIDTHS, ...JSON.parse(saved) } : LOG_DEFAULT_WIDTHS
    } catch { return LOG_DEFAULT_WIDTHS }
  })
  const setLogColWidth = useCallback((col: string, w: number) => {
    setLogColWidths(prev => {
      const next = { ...prev, [col]: w }
      try { localStorage.setItem(LOG_WIDTHS_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  const logOrderedCols = useMemo(
    () => logColOrder.filter(k => LOG_ALWAYS_VISIBLE.has(k) || logColVis[k]),
    [logColOrder, logColVis]
  )

  // ── Missed tab column config ───────────────────────────────────
  const MISSED_VIS_KEY = 'missed-col-visibility-v3'
  const [missedColVis, setMissedColVis] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return Object.fromEntries(MISSED_COL_KEYS.map(k => [k, true]))
    try {
      const saved = localStorage.getItem(MISSED_VIS_KEY)
      const base = Object.fromEntries(MISSED_COL_KEYS.map(k => [k, true]))
      return saved ? { ...base, ...JSON.parse(saved) } : base
    } catch { return Object.fromEntries(MISSED_COL_KEYS.map(k => [k, true])) }
  })
  useEffect(() => { try { localStorage.setItem(MISSED_VIS_KEY, JSON.stringify(missedColVis)) } catch {} }, [missedColVis])

  const MISSED_ORDER_KEY = 'missed-col-order-v3'
  const [missedColOrder, setMissedColOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [...MISSED_COL_KEYS]
    try {
      const saved = localStorage.getItem(MISSED_ORDER_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        const missing = MISSED_COL_KEYS.filter(k => !parsed.includes(k))
        return [...parsed.filter(k => (MISSED_COL_KEYS as readonly string[]).includes(k)), ...missing]
      }
    } catch {}
    return [...MISSED_COL_KEYS]
  })
  useEffect(() => { try { localStorage.setItem(MISSED_ORDER_KEY, JSON.stringify(missedColOrder)) } catch {} }, [missedColOrder])

  const MISSED_WIDTHS_KEY = 'missed-col-widths-v4'
  const [missedColWidths, setMissedColWidths] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return MISSED_DEFAULT_WIDTHS
    try {
      const saved = localStorage.getItem(MISSED_WIDTHS_KEY)
      return saved ? { ...MISSED_DEFAULT_WIDTHS, ...JSON.parse(saved) } : MISSED_DEFAULT_WIDTHS
    } catch { return MISSED_DEFAULT_WIDTHS }
  })
  const setMissedColWidth = useCallback((col: string, w: number) => {
    setMissedColWidths(prev => {
      const next = { ...prev, [col]: w }
      try { localStorage.setItem(MISSED_WIDTHS_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  const missedOrderedCols = useMemo(
    () => missedColOrder.filter(k => MISSED_ALWAYS_VISIBLE.has(k) || missedColVis[k]),
    [missedColOrder, missedColVis]
  )

  const [showColMenu, setShowColMenu] = useState(false)

  // Missed call modal
  const [showModal, setShowModal] = useState(false)
  const [formPhone, setFormPhone] = useState('')
  const [formClinic, setFormClinic] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Phone auto-suggest
  const [suggestions, setSuggestions] = useState<PhoneSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const suggestRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Dismiss modal
  const [dismissEntry, setDismissEntry] = useState<CallEntry | null>(null)
  const [dismissNote, setDismissNote] = useState('')

  // Voice Go import
  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<VoiceGoRow[]>([])
  const [importSaving, setImportSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load user ──────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      setUserId(session.user.id)
      const [profileRes, staffRes] = await Promise.all([
        supabase.from('profiles').select('display_name').eq('id', session.user.id).single(),
        supabase.from('profiles').select('id').eq('is_active', true).in('role', ['support', 'administrator']),
      ])
      if (profileRes.data) setUserName(profileRes.data.display_name)
      if (staffRes.data) setSupportStaffIds(staffRes.data.map((s: { id: string }) => s.id))
    })()
  }, [supabase])

  // "/" keyboard shortcut
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

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Data fetching ──────────────────────────────────────────────
  const loadData = useCallback(async (dateStr: string) => {
    setLoading(true)
    const dayStart = startOfDay(new Date(dateStr)).toISOString()
    const dayEnd = endOfDay(new Date(dateStr)).toISOString()

    let ticketQ = supabase
        .from('tickets')
        .select('id, caller_tel, clinic_name, created_by_name, submitted_at, created_at, status, ticket_ref')
        .not('caller_tel', 'is', null)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd)
        .order('created_at', { ascending: false })
    let draftQ = supabase
        .from('call_log_drafts')
        .select('id, form_data, updated_at, user_id, profiles:user_id(display_name)')
        .gte('updated_at', dayStart)
        .lte('updated_at', dayEnd)
        .order('updated_at', { ascending: false })
    let missedQ = supabase
        .from('missed_calls')
        .select('*')
        .eq('call_date', dateStr)
        .order('created_at', { ascending: false })

    if (supportStaffIds.length > 0) {
      ticketQ = ticketQ.in('created_by', supportStaffIds)
      draftQ = draftQ.in('user_id', supportStaffIds)
      missedQ = missedQ.in('logged_by', supportStaffIds)
    }

    const [ticketRes, draftRes, missedRes] = await Promise.all([ticketQ, draftQ, missedQ])

    const combined: CallEntry[] = []

    if (ticketRes.data) {
      for (const t of ticketRes.data) {
        if (!t.caller_tel?.trim()) continue
        combined.push({ id: t.id, phone: t.caller_tel, clinic: t.clinic_name || '-', staff: t.created_by_name || '-', time: t.submitted_at || t.created_at, source: 'submitted', status: t.status, ticketRef: t.ticket_ref })
      }
    }
    if (draftRes.data) {
      for (const d of draftRes.data) {
        const fd = d.form_data as Record<string, unknown> | null
        if (!fd) continue
        const phone = (fd.callerTel as string) || ''
        if (!phone.trim()) continue
        const profileData = d.profiles as { display_name: string } | null
        combined.push({ id: d.id, phone, clinic: (fd.selectedClinic as { clinic_name?: string })?.clinic_name || (fd.pic as string) || '-', staff: profileData?.display_name || '-', time: d.updated_at, source: 'draft' })
      }
    }
    if (missedRes.data) {
      for (const m of missedRes.data) {
        combined.push({ id: m.id, phone: m.phone, clinic: m.clinic_name || '-', staff: m.logged_by_name || '-', time: m.called_at || m.created_at, source: 'missed', notes: m.notes, resolvedStatus: m.resolved_status, resolvedByName: m.resolved_by_name, resolvedAt: m.resolved_at, resolvedNote: m.resolved_note })
      }
    }

    combined.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

    const clinicNames = Array.from(new Set(combined.filter(e => e.clinic && e.clinic !== '-').map(e => e.clinic)))
    if (clinicNames.length > 0) {
      const { data: clinicData } = await supabase.from('clinics').select('clinic_name, renewal_status').in('clinic_name', clinicNames)
      if (clinicData) {
        const statusMap = new Map<string, string>()
        for (const c of clinicData) { if (c.renewal_status) statusMap.set(c.clinic_name, c.renewal_status) }
        for (const e of combined) { e.renewalStatus = statusMap.get(e.clinic) || null }
      }
    }

    setAllEntries(combined)
    setLoading(false)
  }, [supabase, supportStaffIds])

  useEffect(() => { if (supportStaffIds.length > 0) loadData(selectedDate) }, [selectedDate, loadData, supportStaffIds])

  // ── Derived data per tab ────────────────────────────────────────
  const logEntries = useMemo(() => allEntries.filter(e => e.source !== 'missed'), [allEntries])
  const missedEntries = useMemo(() => allEntries.filter(e => e.source === 'missed'), [allEntries])

  // ── Call Log tab filtering ──────────────────────────────────────
  const logFiltered = useMemo(() => {
    let result = logEntries
    if (sourceFilter !== 'all') result = result.filter(e => e.source === sourceFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(e => e.phone.toLowerCase().includes(q) || e.clinic.toLowerCase().includes(q) || e.staff.toLowerCase().includes(q) || e.ticketRef?.toLowerCase().includes(q))
    }
    if (colClinic.size > 0) result = result.filter(e => colClinic.has(e.clinic))
    if (colStaff.size > 0) result = result.filter(e => colStaff.has(e.staff))
    if (colSource.size > 0) result = result.filter(e => colSource.has(e.source))
    return result
  }, [logEntries, search, sourceFilter, colClinic, colStaff, colSource])

  // ── Missed tab filtering ────────────────────────────────────────
  const missedFiltered = useMemo(() => {
    if (!search.trim()) return missedEntries
    const q = search.toLowerCase()
    return missedEntries.filter(e => e.phone.toLowerCase().includes(q) || e.clinic.toLowerCase().includes(q) || e.staff.toLowerCase().includes(q) || e.notes?.toLowerCase().includes(q))
  }, [missedEntries, search])

  // Active tab data
  const activeFiltered = tab === 'log' ? logFiltered : missedFiltered

  // ── Sorting ────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...activeFiltered]
    arr.sort((a, b) => {
      // Missed tab: resolved entries always go to the bottom
      if (tab === 'missed') {
        const aResolved = !!a.resolvedStatus
        const bResolved = !!b.resolvedStatus
        if (aResolved !== bResolved) return aResolved ? 1 : -1
      }
      let cmp = 0
      switch (sortKey) {
        case 'time': cmp = new Date(a.time).getTime() - new Date(b.time).getTime(); break
        case 'phone': cmp = a.phone.localeCompare(b.phone); break
        case 'clinic': cmp = a.clinic.localeCompare(b.clinic); break
        case 'staff': cmp = a.staff.localeCompare(b.staff); break
        case 'source': cmp = a.source.localeCompare(b.source); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [activeFiltered, sortKey, sortDir])

  // Distinct values for header filters
  const logDistinct = useMemo(() => {
    const clinic = new Set<string>()
    const staff = new Set<string>()
    logEntries.forEach(e => { if (e.clinic) clinic.add(e.clinic); if (e.staff) staff.add(e.staff) })
    return { clinic: Array.from(clinic).sort(), staff: Array.from(staff).sort(), source: ['submitted', 'draft'] }
  }, [logEntries])

  // ── Pagination ─────────────────────────────────────────────────
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  useEffect(() => { setPage(1) }, [search, sourceFilter, sortKey, sortDir, colClinic, colStaff, colSource, tab])

  const paginationRange = useMemo(() => {
    const range: (number | 'ellipsis')[] = []
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) range.push(i) }
    else {
      range.push(1)
      if (page > 3) range.push('ellipsis')
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) range.push(i)
      if (page < totalPages - 2) range.push('ellipsis')
      range.push(totalPages)
    }
    return range
  }, [page, totalPages])

  const uniquePhones = useMemo(() => new Set(activeFiltered.map(e => e.phone)).size, [activeFiltered])

  // ── Sort helpers ───────────────────────────────────────────────
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }
  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <svg className="size-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
    return <svg className="size-3 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={sortDir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} /></svg>
  }

  // ── CSV export ─────────────────────────────────────────────────
  const handleExport = () => {
    const escape = (s: string) => `"${s.replace(/"/g, '""').replace(/\n/g, ' ')}"`
    const data = activeFiltered
    const headers = tab === 'log'
      ? ['Time', 'Phone No.', 'Clinic', 'Staff', 'Source', 'Ref']
      : ['Time', 'Phone No.', 'Clinic', 'Logged By', 'Notes']
    const rows = data.map(e => tab === 'log'
      ? [format(new Date(e.time), 'dd/MM/yyyy HH:mm'), e.phone, e.clinic, e.staff, e.source === 'submitted' ? (e.status || 'Submitted') : 'Draft', e.ticketRef || '']
      : [format(new Date(e.time), 'dd/MM/yyyy HH:mm'), e.phone, e.clinic, e.staff, e.notes || '']
    )
    const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${tab === 'log' ? 'call_log' : 'missed_calls'}_${selectedDate}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── Row click ──────────────────────────────────────────────────
  const handleRowClick = (e: CallEntry) => {
    if (e.source === 'submitted') window.open(`/tickets/${e.id}`, '_blank')
  }

  // ── Date nav ───────────────────────────────────────────────────
  const goToday = () => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))
  const goPrev = () => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(format(d, 'yyyy-MM-dd')) }
  const goNext = () => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(format(d, 'yyyy-MM-dd')) }
  const displayDate = (() => {
    const d = new Date(selectedDate); const today = new Date(); today.setHours(0,0,0,0); d.setHours(0,0,0,0)
    if (d.getTime() === today.getTime()) return 'Today'
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    if (d.getTime() === yesterday.getTime()) return 'Yesterday'
    return format(new Date(selectedDate), 'dd/MM/yyyy')
  })()

  // ── Filter clear ───────────────────────────────────────────────
  const clearAllFilters = () => { setSourceFilter('all'); setColClinic(new Set()); setColStaff(new Set()); setColSource(new Set()); setSearch('') }

  // ── Delete missed call ─────────────────────────────────────────
  const handleDelete = async (entry: CallEntry, ev: React.MouseEvent) => {
    ev.stopPropagation()
    if (entry.source !== 'missed') return
    const { error } = await supabase.from('missed_calls').delete().eq('id', entry.id)
    if (error) { toast('Failed to delete', 'error'); return }
    setAllEntries(prev => prev.filter(e => e.id !== entry.id))
  }

  // ── Resolve missed call (no answer / dismiss) ──────────────────
  const handleResolve = async (entry: CallEntry, status: 'no_answer' | 'dismissed', note?: string) => {
    const { error } = await supabase.from('missed_calls').update({
      resolved_status: status,
      resolved_by: userId,
      resolved_by_name: userName,
      resolved_at: new Date().toISOString(),
      resolved_note: note || null,
    }).eq('id', entry.id)
    if (error) { toast('Failed to update', 'error'); return }
    setAllEntries(prev => prev.map(e => e.id === entry.id ? { ...e, resolvedStatus: status, resolvedByName: userName, resolvedAt: new Date().toISOString(), resolvedNote: note || null } : e))
    toast(status === 'no_answer' ? 'Marked as no answer' : 'Dismissed', 'success')
  }

  const handleReopen = async (entry: CallEntry) => {
    const { error } = await supabase.from('missed_calls').update({
      resolved_status: null,
      resolved_by: null,
      resolved_by_name: null,
      resolved_at: null,
      resolved_note: null,
    }).eq('id', entry.id)
    if (error) { toast('Failed to reopen', 'error'); return }
    setAllEntries(prev => prev.map(e => e.id === entry.id ? { ...e, resolvedStatus: null, resolvedByName: null, resolvedAt: null, resolvedNote: null } : e))
  }

  // ── Phone auto-suggest ─────────────────────────────────────────
  const searchPhone = useCallback(async (q: string) => {
    if (q.length < 3) { setSuggestions([]); return }
    setSuggestLoading(true)
    const { data } = await supabase.from('tickets').select('caller_tel, clinic_name').ilike('caller_tel', `%${q}%`).not('caller_tel', 'is', null).limit(200)
    if (data) {
      const map = new Map<string, { clinic: string; count: number }>()
      for (const row of data) {
        const phone = row.caller_tel?.trim(); if (!phone) continue
        const existing = map.get(phone)
        if (existing) existing.count++; else map.set(phone, { clinic: row.clinic_name || '', count: 1 })
      }
      const results: PhoneSuggestion[] = []
      map.forEach((v, phone) => results.push({ phone, clinic: v.clinic, count: v.count }))
      results.sort((a, b) => b.count - a.count)
      setSuggestions(results.slice(0, 8))
    }
    setSuggestLoading(false)
  }, [supabase])

  const handlePhoneInput = (val: string) => {
    setFormPhone(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.trim().length >= 3) { setShowSuggestions(true); debounceRef.current = setTimeout(() => searchPhone(val.trim()), 300) }
    else { setSuggestions([]); setShowSuggestions(false) }
  }
  const pickSuggestion = (s: PhoneSuggestion) => { setFormPhone(s.phone); if (s.clinic) setFormClinic(s.clinic); setShowSuggestions(false); setSuggestions([]) }

  const openModal = () => { setFormPhone(''); setFormClinic(''); setFormNotes(''); setSuggestions([]); setShowSuggestions(false); setShowModal(true) }

  const handleSave = async () => {
    if (!formPhone.trim()) return
    setSaving(true)
    const { error } = await supabase.from('missed_calls').insert({ phone: formPhone.trim(), clinic_name: formClinic.trim() || null, notes: formNotes.trim() || null, logged_by: userId, logged_by_name: userName, call_date: selectedDate })
    setSaving(false)
    if (error) { toast('Failed to save missed call', 'error'); return }
    toast('Missed call logged', 'success'); setShowModal(false); loadData(selectedDate)
  }

  // ── Voice Go CSV import ────────────────────────────────────────
  const normalizePhone = (p: string) => {
    let v = p.replace(/[^\d]/g, '')
    if (v.startsWith('60') && v.length > 9) v = v.slice(2)
    if (v.startsWith('0')) v = v.slice(1)
    return v
  }

  const formatPhone = (p: string) => {
    if (p.includes('-') || p.includes(' ')) return p
    const digits = p.replace(/[^\d]/g, '')
    if (!digits.startsWith('0')) return p
    // Landline: 03-XXXXXXXX, 04-XXXXXXX, 05-XXXXXXX, 06-XXXXXXX, 07-XXXXXXX, 09-XXXXXXX
    if (/^0[3-9][^1]/.test(digits)) return digits.slice(0, 2) + '-' + digits.slice(2)
    // Mobile 011: 011-XXXXXXXX
    if (digits.startsWith('011')) return digits.slice(0, 3) + '-' + digits.slice(3)
    // Mobile 01X: 01X-XXXXXXX
    if (digits.startsWith('01')) return digits.slice(0, 3) + '-' + digits.slice(3)
    return p
  }

  const handleImportCSV = async (file: File) => {
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) { toast('CSV is empty or has no data rows', 'error'); return }

    // Find the header row — skip title lines like "Call Log for Virtual No..."
    const headerIdx = lines.findIndex(l => l.toLowerCase().includes('calling') && l.toLowerCase().includes('number'))
    if (headerIdx === -1) { toast('Could not find header row with "Calling Number"', 'error'); return }

    const cols = lines[headerIdx].split(',').map(c => c.replace(/"/g, '').replace(/\t/g, '').trim())
    let callingIdx = -1; let timeIdx = -1; let typeIdx = -1
    cols.forEach((c, i) => {
      const cl = c.toLowerCase()
      if (cl.includes('calling')) callingIdx = i
      if (cl.includes('date') || cl.includes('time')) timeIdx = i
      if (cl === 'type') typeIdx = i
    })
    if (callingIdx === -1) { toast('Could not find "Calling Number" column in CSV', 'error'); return }

    const parseCsvLine = (line: string) => {
      const result: string[] = []; let current = ''; let inQuotes = false
      for (const ch of line) { if (ch === '"') { inQuotes = !inQuotes; continue } if (ch === ',' && !inQuotes) { result.push(current.replace(/\t/g, '').trim()); current = ''; continue } current += ch }
      result.push(current.replace(/\t/g, '').trim()); return result
    }

    // Parse all rows, track missed times + latest incoming time per phone
    const missedByPhone = new Map<string, { phone: string; times: string[] }>()
    const latestIncomingTime = new Map<string, number>()

    const parseMinutes = (s: string): number => {
      const m = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
      if (!m) return -1
      let h = parseInt(m[1]); const min = parseInt(m[2])
      if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12
      if (m[3].toUpperCase() === 'AM' && h === 12) h = 0
      return h * 60 + min
    }

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const vals = parseCsvLine(lines[i]); const phone = vals[callingIdx]?.trim()
      if (!phone) continue
      const callType = typeIdx >= 0 ? vals[typeIdx]?.trim().toLowerCase() : ''
      const norm = normalizePhone(phone)
      const time = timeIdx >= 0 ? (vals[timeIdx]?.trim() || '') : ''

      if (callType === 'incoming') {
        const mins = parseMinutes(time)
        const prev = latestIncomingTime.get(norm) ?? -1
        if (mins > prev) latestIncomingTime.set(norm, mins)
      } else if (callType === 'outgoing') {
        continue
      } else {
        const existing = missedByPhone.get(norm)
        if (existing) { if (time) existing.times.push(time) }
        else missedByPhone.set(norm, { phone, times: time ? [time] : [] })
      }
    }

    if (missedByPhone.size === 0) {
      toast('No missed calls found in CSV', 'error')
      return
    }

    const dedupedNumbers = Array.from(missedByPhone.values())

    const loggedPhones = new Map<string, { clinic: string; ref: string }>()
    allEntries.forEach(e => { const norm = normalizePhone(e.phone); if (!loggedPhones.has(norm)) loggedPhones.set(norm, { clinic: e.clinic, ref: e.ticketRef || '' }) })

    const rows: VoiceGoRow[] = dedupedNumbers.map(cn => {
      const norm = normalizePhone(cn.phone)
      const logMatch = loggedPhones.get(norm)
      const incomingMins = latestIncomingTime.get(norm) ?? -1
      const latestMissedMins = cn.times.reduce((max, t) => Math.max(max, parseMinutes(t)), -1)
      const wasAnswered = incomingMins >= 0 && incomingMins >= latestMissedMins
      const matched = !!logMatch || wasAnswered
      return {
        times: cn.times, phone: cn.phone, matched,
        matchedClinic: logMatch?.clinic || (wasAnswered ? 'Answered (Incoming)' : undefined),
        matchedRef: logMatch?.ref,
        selected: !matched,
      }
    })
    setImportRows(rows); setShowImport(true)
  }

  const toggleImportRow = (idx: number) => { setImportRows(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r)) }
  const toggleAllUnmatched = () => {
    const allSelected = importRows.filter(r => !r.matched).every(r => r.selected)
    setImportRows(prev => prev.map(r => r.matched ? r : { ...r, selected: !allSelected }))
  }

  const handleBulkSaveMissed = async () => {
    const toSave = importRows.filter(r => r.selected && !r.matched)
    if (toSave.length === 0) return
    setImportSaving(true)

    const phoneToClinic = new Map<string, string>()
    const batchSize = 50
    const uniqueImportPhones = Array.from(new Set(toSave.map(r => normalizePhone(r.phone))))
    for (let i = 0; i < uniqueImportPhones.length; i += batchSize) {
      const batch = uniqueImportPhones.slice(i, i + batchSize)
      const orFilter = batch.map(p => `caller_tel.ilike.%${p}%`).join(',')
      const { data } = await supabase.from('tickets').select('caller_tel, clinic_name').or(orFilter).limit(500)
      if (data) {
        (data as { caller_tel: string | null; clinic_name: string | null }[]).forEach(row => {
          if (row.caller_tel && row.clinic_name) phoneToClinic.set(normalizePhone(row.caller_tel), row.clinic_name)
        })
      }
    }

    const parseVoiceGoTime = (timeStr: string, dateStr: string): string | null => {
      if (!timeStr) return null
      try {
        const d = new Date(timeStr)
        if (!isNaN(d.getTime())) return d.toISOString()
        const d2 = new Date(`${dateStr} ${timeStr}`)
        if (!isNaN(d2.getTime())) return d2.toISOString()
      } catch {}
      return null
    }

    const formatCallTimes = (times: string[]) => {
      if (times.length <= 1) return null
      const short = times.map(t => {
        try { const d = new Date(t); return !isNaN(d.getTime()) ? format(d, 'hh:mm a') : t.replace(/^\d+\/\d+\/\d+\s*/, '') } catch { return t }
      })
      return `Called ${times.length}x: ${short.join(', ')}`
    }

    const inserts = toSave.map(r => ({ phone: r.phone, clinic_name: phoneToClinic.get(normalizePhone(r.phone)) || null, notes: formatCallTimes(r.times) || 'Imported from Voice Go', logged_by: userId, logged_by_name: userName, call_date: selectedDate, called_at: parseVoiceGoTime(r.times[0] || '', selectedDate) }))
    const { error } = await supabase.from('missed_calls').insert(inserts)
    setImportSaving(false)
    if (error) { toast('Failed to save missed calls', 'error'); return }
    toast(`${inserts.length} missed call${inserts.length > 1 ? 's' : ''} imported`, 'success')
    setShowImport(false); setImportRows([]); loadData(selectedDate)
  }

  const importUnmatched = useMemo(() => importRows.filter(r => !r.matched), [importRows])
  const importMatched = useMemo(() => importRows.filter(r => r.matched), [importRows])
  const importSelectedCount = useMemo(() => importRows.filter(r => r.selected && !r.matched).length, [importRows])

  // ── Badges & row styling ───────────────────────────────────────
  const sourceBadge = (e: CallEntry) => {
    const label = e.source === 'submitted' ? (e.status || 'Submitted') : SOURCE_LABELS[e.source]
    const color = SOURCE_COLORS[e.source]
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color.bg} ${color.text}`}>{label}</span>
  }
  const getRowClasses = (e: CallEntry) => {
    const base = 'transition-all'
    if (e.source === 'submitted') return `${base} cursor-pointer hover:bg-indigo-500/[0.04]`
    if (e.source === 'missed') return `${base} border-l-2 border-l-red-400/40 hover:bg-red-500/[0.04]`
    return `${base} hover:bg-surface-raised opacity-70 hover:opacity-100`
  }

  // Active column config
  const activeCols = tab === 'log' ? logOrderedCols : missedOrderedCols
  const activeWidths = tab === 'log' ? logColWidths : missedColWidths
  const activeLabels = tab === 'log' ? LOG_COL_LABELS : MISSED_COL_LABELS
  const activeAlwaysVisible = tab === 'log' ? LOG_ALWAYS_VISIBLE : MISSED_ALWAYS_VISIBLE
  const activeColKeys = tab === 'log' ? LOG_COL_KEYS : MISSED_COL_KEYS
  const activeColVis = tab === 'log' ? logColVis : missedColVis

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Call Log</h1>
          <p className="text-[13px] text-text-tertiary mt-0.5">
            {activeFiltered.length} entries · {uniquePhones} unique numbers
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'missed' && (
            <>
              <Button variant="danger" size="sm" onClick={openModal}>
                <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add Missed
              </Button>
              <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                Import Voice Go
              </Button>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImportCSV(f); e.target.value = '' }} />
            </>
          )}
          <div className="relative">
            <Button variant="secondary" size="sm" onClick={() => setShowColMenu(v => !v)}>
              <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h6" /></svg>
              Columns
            </Button>
            {showColMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowColMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 bg-surface border border-border rounded-lg shadow-theme-lg w-[200px] p-1.5">
                  <p className="px-2 py-1 text-[10px] font-medium text-text-muted uppercase tracking-wider">Show columns</p>
                  {activeColKeys.filter(k => k !== 'actions').map(k => {
                    const locked = activeAlwaysVisible.has(k)
                    const visible = activeColVis[k]
                    return (
                      <button key={k} type="button" onClick={() => {
                        if (locked) return
                        if (tab === 'log') setLogColVis(prev => ({ ...prev, [k]: !prev[k] }))
                        else setMissedColVis(prev => ({ ...prev, [k]: !prev[k] }))
                      }} disabled={locked} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[13px] text-left transition-colors ${locked ? 'text-text-muted cursor-not-allowed' : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'}`}>
                        <span className={`size-3.5 rounded border flex items-center justify-center flex-shrink-0 ${visible ? 'bg-accent border-accent' : 'border-border'}`}>
                          {visible && <svg className="size-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </span>
                        <span className="truncate">{activeLabels[k]}</span>
                        {locked && <span className="ml-auto text-[10px] text-text-muted">locked</span>}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={handleExport}>
            <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            CSV
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border">
        {([
          { key: 'log' as Tab, label: 'Call Log', count: logEntries.length },
          { key: 'missed' as Tab, label: 'Missed Call', count: missedEntries.filter(e => !e.resolvedStatus).length },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSearch(''); setPage(1) }}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              tab === t.key
                ? 'text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                tab === t.key
                  ? t.key === 'missed' ? 'bg-red-500/20 text-red-400' : 'bg-indigo-500/20 text-indigo-400'
                  : 'bg-surface-raised text-text-tertiary'
              }`}>
                {t.count}
              </span>
            )}
            {tab === t.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
          </button>
        ))}
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={goPrev} className="p-2 rounded-lg hover:bg-surface-raised text-text-secondary transition-colors">
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-text-primary">{displayDate}</span>
          <span className="text-sm text-text-tertiary">{format(new Date(selectedDate), 'EEEE')}</span>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="ml-2 text-xs bg-transparent border border-border rounded-lg px-2 py-1 text-text-secondary" />
        </div>
        <button onClick={goNext} className="p-2 rounded-lg hover:bg-surface-raised text-text-secondary transition-colors">
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
        <button onClick={goToday} className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">Today</button>
      </div>

      {/* Search bar + source pills (Call Log tab only) */}
      <div className="mb-4 rounded-xl p-1 bg-surface-raised border border-border">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <Input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={tab === 'log' ? 'Search phone, clinic, staff, ref...' : 'Search phone, clinic, notes...'} className="pl-10 !bg-transparent !border-0 !shadow-none !ring-0 text-sm" />
          </div>
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-text-muted bg-surface-inset border border-border rounded">/</kbd>
        </div>
        {tab === 'log' && (
          <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-0.5">
            {(['all', 'submitted', 'draft'] as const).map(type => {
              const isActive = sourceFilter === type
              const colors = type === 'all' ? { bg: 'bg-zinc-500/20', text: 'text-zinc-400' } : SOURCE_COLORS[type]
              return (
                <button key={type} type="button" onClick={() => setSourceFilter(type)} className={`pill text-xs ${colors.bg} ${colors.text} ${isActive ? 'pill-active ring-current opacity-100' : 'opacity-50'}`}>
                  {type === 'all' ? 'All' : SOURCE_LABELS[type]}
                </button>
              )
            })}
            {(colClinic.size > 0 || colStaff.size > 0 || colSource.size > 0) && (
              <button onClick={clearAllFilters} className="text-xs text-text-tertiary hover:text-text-primary transition-colors ml-auto">Clear filters</button>
            )}
          </div>
        )}
      </div>

      {/* ─── Desktop table (md+) ─── */}
      <div ref={tab === 'log' ? logTableRef : missedTableRef} className="hidden md:block card overflow-x-auto relative">
        {loading ? (
          <div className="text-center py-12 text-text-tertiary text-sm">Loading...</div>
        ) : paginated.length === 0 ? (
          <EmptyState icon={EmptyIcons.search} title={tab === 'log' ? 'No calls logged' : 'No missed calls'} description={search ? 'Try a different search term' : tab === 'log' ? `No phone numbers captured on ${displayDate}` : `No missed calls on ${displayDate}`} />
        ) : (
          <PlainResizeProvider widths={activeWidths} onChangeWidth={tab === 'log' ? setLogColWidth : setMissedColWidth}>
          <HorizontalDndProvider columnIds={activeCols} onReorder={(from, to) => {
            if (tab === 'log') setLogColOrder(prev => reorderColumns(prev, from, to))
            else setMissedColOrder(prev => reorderColumns(prev, from, to))
          }}>
          <table className="text-sm table-fixed" style={{ width: activeCols.reduce((sum, k) => sum + activeWidths[k], 0) }}>
            <colgroup>{activeCols.map(k => <col key={k} style={{ width: activeWidths[k] }} />)}</colgroup>
            <thead>
              <tr className="border-b border-border text-xs text-text-tertiary uppercase tracking-wider">
                {activeCols.map(k => {
                  const dragDisabled = activeAlwaysVisible.has(k)
                  const baseTh = 'text-left px-4 py-3 font-medium relative'
                  const cursorTh = dragDisabled ? '' : ' cursor-grab active:cursor-grabbing'
                  const resizeHandle = <PlainResizeHandle columnId={k} currentWidth={activeWidths[k]} />

                  if (k === 'time') return (
                    <SortableHeader key={k} id={k} disabled className={baseTh}>
                      <span className="inline-flex items-center gap-1 cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('time')}>Time <SortIcon column="time" /></span>
                      {resizeHandle}
                    </SortableHeader>
                  )
                  if (k === 'phone') return (
                    <SortableHeader key={k} id={k} disabled className={baseTh}>
                      <span className="inline-flex items-center gap-1 cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('phone')}>Phone No. <SortIcon column="phone" /></span>
                      {resizeHandle}
                    </SortableHeader>
                  )
                  if (k === 'clinic') return (
                    <SortableHeader key={k} id={k} className={`${baseTh}${cursorTh}`}>
                      <span className="inline-flex items-center gap-1 cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('clinic')} onPointerDown={ev => ev.stopPropagation()}>Clinic <SortIcon column="clinic" /></span>
                      {tab === 'log' && <HeaderFilter headerText="Clinic" values={logDistinct.clinic} selected={colClinic} onChange={setColClinic} totalRows={activeFiltered.length} />}
                      {resizeHandle}
                    </SortableHeader>
                  )
                  if (k === 'staff') return (
                    <SortableHeader key={k} id={k} className={`${baseTh}${cursorTh}`}>
                      <span className="inline-flex items-center gap-1 cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('staff')} onPointerDown={ev => ev.stopPropagation()}>{tab === 'log' ? 'Staff' : 'Logged By'} <SortIcon column="staff" /></span>
                      {tab === 'log' && <HeaderFilter headerText="Staff" values={logDistinct.staff} selected={colStaff} onChange={setColStaff} totalRows={activeFiltered.length} />}
                      {resizeHandle}
                    </SortableHeader>
                  )
                  if (k === 'source') return (
                    <SortableHeader key={k} id={k} className={`${baseTh}${cursorTh}`}>
                      <span className="inline-flex items-center gap-1 cursor-pointer hover:text-text-primary transition-colors" onClick={() => handleSort('source')} onPointerDown={ev => ev.stopPropagation()}>Source <SortIcon column="source" /></span>
                      <HeaderFilter headerText="Source" values={logDistinct.source} selected={colSource} onChange={setColSource} totalRows={activeFiltered.length} />
                      {resizeHandle}
                    </SortableHeader>
                  )
                  if (k === 'notes') return (
                    <SortableHeader key={k} id={k} className={`${baseTh}${cursorTh}`}>
                      <span>Notes</span>
                      {resizeHandle}
                    </SortableHeader>
                  )
                  if (k === 'resolution') return (
                    <SortableHeader key={k} id={k} className={`${baseTh}${cursorTh}`}>
                      <span>Action / Status</span>
                      {resizeHandle}
                    </SortableHeader>
                  )
                  if (k === 'actions') return (
                    <SortableHeader key={k} id={k} disabled className="text-right px-4 py-3 font-medium"><span></span></SortableHeader>
                  )
                  return null
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map(e => (
                <tr key={`${e.source}-${e.id}`} onClick={() => handleRowClick(e)} className={getRowClasses(e)}>
                  {activeCols.map(k => {
                    if (k === 'time') return <td key={k} className="px-4 py-3 text-text-secondary whitespace-nowrap align-top">{format(new Date(e.time), 'hh:mm a')}</td>
                    if (k === 'phone') return (
                      <td key={k} className="px-4 py-3 align-top">
                        <a href={`tel:${e.phone.replace(/\s+/g, '')}`} onClick={ev => ev.stopPropagation()} className="font-mono text-sm text-emerald-400 font-medium hover:text-emerald-300 hover:underline whitespace-nowrap">{formatPhone(e.phone)}</a>
                      </td>
                    )
                    if (k === 'clinic') return (
                      <td key={k} className="px-4 py-3 align-top">
                        <span className="text-text-secondary">{e.clinic}</span>
                        {tab === 'missed' && e.renewalStatus && (() => {
                          const key = e.renewalStatus.toUpperCase()
                          const colors = RENEWAL_COLORS[key] || { bg: 'bg-gray-500/20', text: 'text-gray-400' }
                          return <span className={`ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${colors.bg} ${colors.text}`}>{e.renewalStatus}</span>
                        })()}
                      </td>
                    )
                    if (k === 'staff') return <td key={k} className="px-4 py-3 align-top"><span className="text-xs text-accent font-medium">{toProperCase(e.staff)}</span></td>
                    if (k === 'source') return (
                      <td key={k} className="px-4 py-3 align-top">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {sourceBadge(e)}
                          {e.ticketRef && <span className="text-xs text-text-tertiary font-mono">{e.ticketRef}</span>}
                        </div>
                      </td>
                    )
                    if (k === 'notes') return (
                      <td key={k} className="px-4 py-3 align-top text-xs text-text-tertiary">
                        {(() => {
                          const parts: React.ReactNode[] = []
                          if (e.notes && e.notes !== 'Imported from Voice Go') {
                            const match = e.notes.match(/^Called (\d+)x: (.+)$/)
                            if (match) {
                              parts.push(<div key="calls"><span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 mb-1">{match[1]}x called</span><p className="text-text-tertiary">{match[2]}</p></div>)
                            } else {
                              parts.push(<p key="note">{e.notes}</p>)
                            }
                          }
                          if (e.resolvedNote) {
                            parts.push(<p key="remark" className="text-text-tertiary italic mt-1">{e.resolvedStatus === 'dismissed' ? '⤷ ' : ''}{e.resolvedNote}</p>)
                          }
                          return parts.length > 0 ? parts : '-'
                        })()}
                      </td>
                    )
                    if (k === 'resolution') return (
                      <td key={k} className="px-4 py-3 align-top">
                        {e.resolvedStatus === 'logged' ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">Logged</span>
                            <p className="text-[11px] text-text-tertiary">
                              {e.resolvedByName && toProperCase(e.resolvedByName)}
                              {e.resolvedAt && ` · ${format(new Date(e.resolvedAt), 'hh:mm a')}`}
                            </p>
                            {e.resolvedNote && <p className="text-[11px] text-text-tertiary italic">{e.resolvedNote}</p>}
                          </div>
                        ) : e.resolvedStatus ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${e.resolvedStatus === 'no_answer' ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-500/20 text-zinc-400'}`}>
                                {e.resolvedStatus === 'no_answer' ? 'No Answer' : 'Dismissed'}
                              </span>
                              <span className="text-[11px] text-text-tertiary">
                                {e.resolvedByName && toProperCase(e.resolvedByName)}
                                {e.resolvedAt && ` · ${format(new Date(e.resolvedAt), 'hh:mm a')}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button onClick={ev => { ev.stopPropagation(); window.open(`/log?phone=${encodeURIComponent(e.phone)}${e.clinic !== '-' ? `&clinic=${encodeURIComponent(e.clinic)}` : ''}&missed_id=${e.id}`, '_blank') }} className="text-xs font-medium px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors whitespace-nowrap">
                                Log Call
                              </button>
                              <button onClick={ev => { ev.stopPropagation(); handleReopen(e) }} className="text-xs text-text-tertiary hover:text-text-primary transition-colors">
                                Undo
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button onClick={ev => { ev.stopPropagation(); window.open(`/log?phone=${encodeURIComponent(e.phone)}${e.clinic !== '-' ? `&clinic=${encodeURIComponent(e.clinic)}` : ''}&missed_id=${e.id}`, '_blank') }} className="text-xs font-medium px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors whitespace-nowrap">
                              Log Call
                            </button>
                            <button onClick={ev => { ev.stopPropagation(); handleResolve(e, 'no_answer') }} className="text-xs font-medium px-2 py-1 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors whitespace-nowrap">
                              No Answer
                            </button>
                            <button onClick={ev => { ev.stopPropagation(); setDismissEntry(e); setDismissNote('') }} className="text-xs font-medium px-2 py-1 rounded-lg bg-zinc-600 text-white hover:bg-zinc-700 transition-colors whitespace-nowrap">
                              Dismiss
                            </button>
                          </div>
                        )}
                      </td>
                    )
                    if (k === 'actions') return (
                      <td key={k} className="px-4 py-3 text-right align-top">
                        {e.source === 'missed' && (
                          <button onClick={ev => handleDelete(e, ev)} className="text-text-muted hover:text-red-400 p-1 transition-colors" aria-label="Delete">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        )}
                      </td>
                    )
                    return null
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </HorizontalDndProvider>
          <PlainResizeIndicator containerRef={tab === 'log' ? logTableRef : missedTableRef} />
          </PlainResizeProvider>
        )}
      </div>

      {/* ─── Mobile card layout ─── */}
      <div className="md:hidden card overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-text-tertiary text-sm">Loading...</div>
        ) : paginated.length === 0 ? (
          <EmptyState icon={EmptyIcons.search} title={tab === 'log' ? 'No calls logged' : 'No missed calls'} description={search ? 'Try a different search term' : `No entries on ${displayDate}`} />
        ) : (
          <div className="divide-y divide-border">
            {paginated.map(e => (
              <div key={`${e.source}-${e.id}`} onClick={() => handleRowClick(e)} className={`px-4 py-3 ${getRowClasses(e)}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <a href={`tel:${e.phone.replace(/\s+/g, '')}`} onClick={ev => ev.stopPropagation()} className="font-mono text-sm text-emerald-400 font-medium hover:text-emerald-300 flex-shrink-0">{formatPhone(e.phone)}</a>
                    <span className="text-sm text-text-primary truncate">{e.clinic}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {tab === 'log' && sourceBadge(e)}
                    {e.source === 'missed' && !e.resolvedStatus && (
                      <button onClick={ev => handleDelete(e, ev)} className="text-text-muted hover:text-red-400 p-1" aria-label="Delete">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-text-tertiary">
                  <span>{format(new Date(e.time), 'hh:mm a')}</span>
                  <span>·</span>
                  <span className="text-accent font-medium">{toProperCase(e.staff)}</span>
                  {e.ticketRef && <><span>·</span><span className="font-mono">{e.ticketRef}</span></>}
                </div>
                {/* Mobile resolution actions */}
                {e.source === 'missed' && (
                  e.resolvedStatus === 'logged' ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400">Logged</span>
                      <span className="text-[11px] text-text-tertiary">
                        {e.resolvedByName && toProperCase(e.resolvedByName)}
                        {e.resolvedAt && ` · ${format(new Date(e.resolvedAt), 'hh:mm a')}`}
                      </span>
                      {e.resolvedNote && <span className="text-[11px] text-text-tertiary italic">{e.resolvedNote}</span>}
                    </div>
                  ) : e.resolvedStatus ? (
                    <div className="mt-1.5 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${e.resolvedStatus === 'no_answer' ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-500/20 text-zinc-400'}`}>
                          {e.resolvedStatus === 'no_answer' ? 'No Answer' : 'Dismissed'}
                        </span>
                        <span className="text-[11px] text-text-tertiary">
                          {e.resolvedByName && toProperCase(e.resolvedByName)}
                          {e.resolvedAt && ` · ${format(new Date(e.resolvedAt), 'hh:mm a')}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={ev => { ev.stopPropagation(); window.open(`/log?phone=${encodeURIComponent(e.phone)}${e.clinic !== '-' ? `&clinic=${encodeURIComponent(e.clinic)}` : ''}&missed_id=${e.id}`, '_blank') }} className="text-xs font-medium px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">Log Call</button>
                        <button onClick={ev => { ev.stopPropagation(); handleReopen(e) }} className="text-xs text-text-tertiary hover:text-text-primary transition-colors">Undo</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <button onClick={ev => { ev.stopPropagation(); window.open(`/log?phone=${encodeURIComponent(e.phone)}${e.clinic !== '-' ? `&clinic=${encodeURIComponent(e.clinic)}` : ''}&missed_id=${e.id}`, '_blank') }} className="text-xs font-medium px-2 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">Log Call</button>
                      <button onClick={ev => { ev.stopPropagation(); handleResolve(e, 'no_answer') }} className="text-xs font-medium px-2 py-1 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors">No Answer</button>
                      <button onClick={ev => { ev.stopPropagation(); setDismissEntry(e); setDismissNote('') }} className="text-xs font-medium px-2 py-1 rounded-lg bg-zinc-600 text-white hover:bg-zinc-700 transition-colors">Dismiss</button>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="p-2 text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors">
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          {paginationRange.map((item, i) => item === 'ellipsis'
            ? <span key={`e${i}`} className="px-2 text-text-muted text-sm">...</span>
            : <button key={item} onClick={() => setPage(item)} className={`min-w-[32px] h-8 rounded-md text-sm font-medium transition-colors ${page === item ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'}`}>{item}</button>
          )}
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="p-2 text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors">
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}

      {/* ── Add Missed Call Modal ──────────────────────────────────── */}
      <ModalDialog open={showModal} onClose={() => setShowModal(false)} title="Log Missed Call" size="sm">
        <div className="p-4 space-y-4 overflow-y-auto">
          <div ref={suggestRef} className="relative">
            <Label>Phone Number *</Label>
            <input type="tel" value={formPhone} onChange={e => handlePhoneInput(e.target.value)} onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }} placeholder="e.g. 03-12345678" className="w-full rounded-lg bg-surface border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-mono" autoComplete="off" />
            {showSuggestions && (suggestions.length > 0 || suggestLoading) && (
              <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl bg-surface-raised border border-border shadow-theme-lg max-h-64 overflow-y-auto">
                {suggestLoading && suggestions.length === 0 && <div className="px-4 py-3 text-xs text-text-tertiary">Searching...</div>}
                {suggestions.map(s => (
                  <button key={s.phone} type="button" onClick={() => pickSuggestion(s)} className="w-full text-left px-4 py-2.5 hover:bg-indigo-500/10 transition-colors flex items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm text-text-primary">{s.phone}</p>
                      {s.clinic && <p className="text-xs text-text-tertiary truncate">{s.clinic}</p>}
                    </div>
                    <span className="text-xs text-text-tertiary whitespace-nowrap">{s.count} call{s.count > 1 ? 's' : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label>Clinic</Label>
            <input type="text" value={formClinic} onChange={e => setFormClinic(e.target.value)} placeholder="Auto-filled from history or type manually" className="w-full rounded-lg bg-surface border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-indigo-500/40" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleSave} disabled={!formPhone.trim() || saving}>{saving ? 'Saving...' : 'Log Missed Call'}</Button>
        </div>
      </ModalDialog>

      {/* ── Dismiss Modal ─────────────────────────────────────────── */}
      <ModalDialog open={!!dismissEntry} onClose={() => setDismissEntry(null)} title="Dismiss Missed Call" size="sm">
        <div className="p-4 space-y-3">
          <p className="text-sm text-text-secondary">
            Dismissing <span className="font-mono font-medium text-text-primary">{dismissEntry?.phone}</span>
            {dismissEntry?.clinic && dismissEntry.clinic !== '-' && <span> — {dismissEntry.clinic}</span>}
          </p>
          <div>
            <Label>Remark *</Label>
            <Textarea
              value={dismissNote}
              onChange={e => setDismissNote(e.target.value)}
              placeholder="e.g. Same clinic already logged, duplicate entry, wrong number..."
              rows={2}
              autoFocus
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <Button variant="secondary" onClick={() => setDismissEntry(null)}>Cancel</Button>
          <Button
            variant="danger"
            disabled={!dismissNote.trim()}
            onClick={async () => {
              if (!dismissEntry || !dismissNote.trim()) return
              await handleResolve(dismissEntry, 'dismissed', dismissNote.trim())
              setDismissEntry(null)
            }}
          >
            Dismiss
          </Button>
        </div>
      </ModalDialog>

      {/* ── Voice Go Import Modal ──────────────────────────────────── */}
      <ModalDialog open={showImport} onClose={() => setShowImport(false)} title="Import Voice Go — Compare" size="lg">
        <div className="p-4 space-y-4 overflow-y-auto max-h-[65vh]">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-surface border border-border p-3 text-center">
              <p className="text-xs text-text-tertiary">Unique Numbers</p>
              <p className="text-xl font-bold text-text-primary">{importRows.length}</p>
            </div>
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
              <p className="text-xs text-emerald-400">Already Logged</p>
              <p className="text-xl font-bold text-emerald-400">{importMatched.length}</p>
            </div>
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-center">
              <p className="text-xs text-red-400">Unmatched (Missed)</p>
              <p className="text-xl font-bold text-red-400">{importUnmatched.length}</p>
            </div>
          </div>

          {importUnmatched.length === 0 ? (
            <div className="text-center py-6">
              <svg className="size-12 text-emerald-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-sm font-medium text-emerald-400">All calls are accounted for!</p>
              <p className="text-xs text-text-tertiary mt-1">Every number from Voice Go has a matching log entry.</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-red-400">Unmatched — Not logged ({importUnmatched.length})</h4>
                <button type="button" onClick={toggleAllUnmatched} className="text-xs text-text-tertiary hover:text-text-primary transition-colors">
                  {importUnmatched.every(r => r.selected) ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="rounded-lg border border-red-500/20 overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-red-500/5 text-xs text-text-tertiary uppercase tracking-wider"><th className="px-3 py-2 text-left w-8"></th><th className="px-3 py-2 text-left">Calling Number</th><th className="px-3 py-2 text-left">Called At</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {importRows.map((r, idx) => {
                      if (r.matched) return null
                      return (
                        <tr key={idx} className="hover:bg-red-500/[0.03] transition-colors">
                          <td className="px-3 py-2 align-top"><input type="checkbox" checked={r.selected} onChange={() => toggleImportRow(idx)} className="rounded border-border" /></td>
                          <td className="px-3 py-2 align-top">
                            <span className="font-mono font-medium text-text-primary">{r.phone}</span>
                            {r.times.length > 1 && <span className="ml-1.5 text-xs text-red-400 font-medium">{r.times.length}x</span>}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {r.times.map((t, ti) => (
                                <span key={ti} className="text-xs text-text-secondary bg-surface-raised px-1.5 py-0.5 rounded">{t}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importMatched.length > 0 && (
            <details className="group">
              <summary className="text-sm font-semibold text-emerald-400 cursor-pointer flex items-center gap-1">
                <svg className="size-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                Already logged ({importMatched.length})
              </summary>
              <div className="mt-2 rounded-lg border border-emerald-500/20 overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-emerald-500/5 text-xs text-text-tertiary uppercase tracking-wider"><th className="px-3 py-2 text-left">Calling Number</th><th className="px-3 py-2 text-left">Called At</th><th className="px-3 py-2 text-left">Matched To</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {importRows.map((r, idx) => {
                      if (!r.matched) return null
                      return (
                        <tr key={idx} className="opacity-60">
                          <td className="px-3 py-2 align-top"><span className="font-mono text-text-primary">{r.phone}</span></td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {r.times.map((t, ti) => (
                                <span key={ti} className="text-xs text-text-secondary bg-surface-raised px-1.5 py-0.5 rounded">{t}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-text-tertiary align-top">{r.matchedClinic && r.matchedClinic !== '-' ? r.matchedClinic : ''}{r.matchedRef && <span className="ml-1 font-mono">{r.matchedRef}</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-xs text-text-tertiary">{importSelectedCount > 0 ? `${importSelectedCount} selected to import as missed` : 'Select numbers to import'}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setShowImport(false); setImportRows([]) }}>Close</Button>
            {importSelectedCount > 0 && (
              <Button variant="danger" onClick={handleBulkSaveMissed} disabled={importSaving}>{importSaving ? 'Importing...' : `Import ${importSelectedCount} Missed`}</Button>
            )}
          </div>
        </div>
      </ModalDialog>
    </div>
  )
}
