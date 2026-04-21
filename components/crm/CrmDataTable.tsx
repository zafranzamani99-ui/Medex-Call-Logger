'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type ColumnSizingState,
  type ColumnOrderState,
  type Header,
} from '@tanstack/react-table'
import { createClient } from '@/lib/supabase/client'
import type { Clinic, CustomColumn } from '@/lib/types'
import { buildColumns, DEFAULT_COLUMN_VISIBILITY, COLUMN_GROUPS } from './columns'
import { ModalDialog } from '@/components/Modal'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

const CHECKBOX_COL_WIDTH = 40
const BULK_DELETE_MAX = 100

// WHY: Interactive CRM data table — Airtable-like spreadsheet for browsing/editing
// all ~3,800 clinics. Uses @tanstack/react-table for sorting, filtering, pagination,
// column resize, rename, and custom columns.

interface CrmDataTableProps {
  onClinicSelect: (clinicCode: string) => void
  refreshKey?: number
  isAdmin?: boolean
}

// Session storage — volatile (search, filters, sort, page)
const STORAGE_KEY = 'crm-table'
function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_KEY}-${key}`)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}
function saveState(key: string, value: unknown) {
  try { sessionStorage.setItem(`${STORAGE_KEY}-${key}`, JSON.stringify(value)) } catch { /* noop */ }
}

// Local storage — persistent (column widths, renames, visibility)
function loadPersistent<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}-${key}`)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}
function savePersistent(key: string, value: unknown) {
  try { localStorage.setItem(`${STORAGE_KEY}-${key}`, JSON.stringify(value)) } catch { /* noop */ }
}

// Slugify column name for JSONB key
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

// ── Renameable Header ─────────────────────────────────────────────────

function RenameableHeader({ header, renames, onRename }: {
  header: Header<Clinic, unknown>
  renames: Record<string, string>
  onRename: (colId: string, name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const colId = header.column.id
  const originalName = typeof header.column.columnDef.header === 'string'
    ? header.column.columnDef.header
    : colId
  const displayName = renames[colId] || originalName

  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  if (editing) {
    return (
      <input
        ref={inputRef}
        defaultValue={displayName}
        onBlur={(e) => {
          setEditing(false)
          const val = e.target.value.trim()
          if (val && val !== originalName) onRename(colId, val)
          else onRename(colId, '')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditing(false)
          e.stopPropagation()
        }}
        onClick={(e) => e.stopPropagation()}
        className="px-1 py-0.5 bg-surface-inset border border-accent/40 rounded text-[11px] font-semibold uppercase tracking-wider text-text-primary w-full focus:outline-none focus:ring-1 focus:ring-accent"
      />
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1"
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
      title="Double-click to rename"
    >
      {displayName}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────

export default function CrmDataTable({ onClinicSelect, refreshKey = 0, isAdmin = false }: CrmDataTableProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState('')

  // Phase 1.3 — bulk selection (ids of selected clinics)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDependencies, setBulkDependencies] = useState<{ openTickets: number; activeSchedules: number; draftJobSheets: number } | null>(null)
  const lastSelectedIdxRef = useRef<number | null>(null)

  // Custom columns from DB (team-shared)
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([])
  const [showAddColumn, setShowAddColumn] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [newColType, setNewColType] = useState<'text' | 'toggle'>('text')

  // Table state — session (volatile)
  const [sorting, setSorting] = useState<SortingState>(() => loadState('sort', []))
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() => loadState('filters', []))
  const [globalFilter, setGlobalFilter] = useState(() => loadState('search', ''))
  const [pagination, setPagination] = useState(() => loadState('page', { pageIndex: 0, pageSize: 50 }))

  // Table state — persistent (localStorage)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => loadPersistent('vis', DEFAULT_COLUMN_VISIBILITY))
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => loadPersistent('colSizes', {}))
  const [columnRenames, setColumnRenames] = useState<Record<string, string>>(() => loadPersistent('colRenames', {}))
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() => loadPersistent('colOrder', []))

  // Freeze panes — columns frozen from left, rows frozen from top (like Excel).
  // Default 2 = ACCT NO + CLINIC NAME stay visible during horizontal scroll (MEDEXCRM parity).
  const [frozenCount, setFrozenCount] = useState<number>(() => loadPersistent('frozenCols', 2))
  const [frozenRowCount, setFrozenRowCount] = useState<number>(() => loadPersistent('frozenRows', 0))

  // Edit menu (includes freeze, undo, find, export, reset)
  const [showEditMenu, setShowEditMenu] = useState(false)
  const editMenuRef = useRef<HTMLDivElement>(null)
  const [showFreezeSubmenu, setShowFreezeSubmenu] = useState<'cols' | 'rows' | null>(null)

  // Undo/Redo history
  const [editHistory, setEditHistory] = useState<Array<{ clinicCode: string; columnId: string; oldValue: string | boolean | null; newValue: string | boolean | null }>>([])
  const [redoStack, setRedoStack] = useState<Array<{ clinicCode: string; columnId: string; oldValue: string | boolean | null; newValue: string | boolean | null }>>([])

  // Find & Replace
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const findInputRef = useRef<HTMLInputElement>(null)

  // Filter search input inside dropdowns
  const [filterSearch, setFilterSearch] = useState('')

  // Drag-and-drop column reorder
  const dragColRef = useRef<string | null>(null)
  const dragOverColRef = useRef<string | null>(null)

  // Column visibility popover
  const [showColMenu, setShowColMenu] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)

  // Filter dropdowns
  const [showFilterDropdown, setShowFilterDropdown] = useState<string | null>(null)
  const filterMenuRef = useRef<HTMLDivElement>(null)

  // Debounced search
  const [searchInput, setSearchInput] = useState(globalFilter)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  // Build columns array (static + custom)
  const tableColumns = useMemo(() => buildColumns(customColumns), [customColumns])

  // Persist session state
  useEffect(() => { saveState('sort', sorting) }, [sorting])
  useEffect(() => { saveState('filters', columnFilters) }, [columnFilters])
  useEffect(() => { saveState('search', globalFilter) }, [globalFilter])
  useEffect(() => { saveState('page', pagination) }, [pagination])

  // Persist local state
  useEffect(() => { savePersistent('vis', columnVisibility) }, [columnVisibility])
  useEffect(() => { savePersistent('colSizes', columnSizing) }, [columnSizing])
  useEffect(() => { savePersistent('colOrder', columnOrder) }, [columnOrder])
  useEffect(() => { savePersistent('frozenCols', frozenCount) }, [frozenCount])
  useEffect(() => { savePersistent('frozenRows', frozenRowCount) }, [frozenRowCount])

  // Debounce search input
  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setGlobalFilter(searchInput), 300)
    return () => clearTimeout(searchTimer.current)
  }, [searchInput])

  // Load user + all clinics + custom columns
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUserId(session.user.id)
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', session.user.id)
          .single()
        if (profile) setUserName(profile.display_name)
      }

      // Load custom column definitions
      const { data: customCols } = await supabase
        .from('crm_custom_columns')
        .select('*')
        .order('display_order')
      if (customCols) setCustomColumns(customCols as CustomColumn[])

      // Load all clinics (paginated to handle Supabase 1000-row limit)
      const PAGE_SIZE = 1000
      let all: Clinic[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('clinics')
          .select('*')
          .order('clinic_name')
          .range(from, from + PAGE_SIZE - 1)
        if (error || !data || data.length === 0) break
        all = all.concat(data as Clinic[])
        if (data.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }
      setClinics(all)
      setLoading(false)
    }
    init()
  }, [supabase, refreshKey])

  // Phase C.6 — realtime subscription on clinics table.
  // Keeps the table fresh when other admins create/update/delete while this tab is open.
  // Own edits are optimistic; realtime is belt-and-braces for multi-admin concurrency.
  useEffect(() => {
    const channel = supabase
      .channel('crm-clinics')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clinics' },
        (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, unknown>; old: Record<string, unknown> }) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as unknown as Clinic
            setClinics(prev => prev.some(c => c.id === row.id) ? prev : [...prev, row])
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as unknown as Clinic
            setClinics(prev => prev.map(c => c.id === row.id ? row : c))
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<Clinic>
            if (!oldRow.id) return
            setClinics(prev => prev.filter(c => c.id !== oldRow.id))
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  // Close popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setShowColMenu(false)
        setShowAddColumn(false)
      }
      if (showFilterDropdown && filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(null)
        setFilterSearch('')
      }
      if (showEditMenu && editMenuRef.current && !editMenuRef.current.contains(e.target as Node)) {
        setShowEditMenu(false)
        setShowFreezeSubmenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFilterDropdown, showEditMenu])

  // Extract unique filter options from data
  const filterOptions = useMemo(() => ({
    renewal_status: Array.from(new Set(clinics.map(c => c.renewal_status).filter(Boolean))).sort() as string[],
    state: Array.from(new Set(clinics.map(c => c.state).filter(Boolean))).sort() as string[],
    product_type: Array.from(new Set(clinics.map(c => c.product_type).filter(Boolean))).sort() as string[],
  }), [clinics])

  // Inline edit save handler — supports both regular columns and custom JSONB columns
  // Also pushes to undo history
  const updateData = useCallback(async (clinicCode: string, columnId: string, value: string | boolean | null) => {
    const isCustom = columnId.startsWith('custom_')
    const customKey = isCustom ? columnId.replace('custom_', '') : null

    // Track old value for undo
    const clinic = clinics.find(c => c.clinic_code === clinicCode)
    let oldValue: string | boolean | null = null
    if (isCustom && customKey) {
      oldValue = (clinic?.custom_data as Record<string, string | boolean | null>)?.[customKey] ?? null
    } else {
      oldValue = (clinic as unknown as Record<string, unknown>)?.[columnId] as string | boolean | null ?? null
    }
    setEditHistory(prev => [...prev.slice(-99), { clinicCode, columnId, oldValue, newValue: value }])
    setRedoStack([])

    if (isCustom && customKey) {
      const currentData = (clinic?.custom_data as Record<string, unknown>) || {}
      const newData = { ...currentData, [customKey]: value }

      setClinics(prev => prev.map(c =>
        c.clinic_code === clinicCode
          ? { ...c, custom_data: newData as Record<string, string | boolean | null>, last_updated_by: userId, last_updated_by_name: userName, updated_at: new Date().toISOString() }
          : c
      ))

      const { error } = await supabase
        .from('clinics')
        .update({
          custom_data: newData,
          last_updated_by: userId,
          last_updated_by_name: userName,
          updated_at: new Date().toISOString(),
        })
        .eq('clinic_code', clinicCode)

      if (error) {
        const { data } = await supabase.from('clinics').select('*').eq('clinic_code', clinicCode).single()
        if (data) setClinics(prev => prev.map(c => c.clinic_code === clinicCode ? data as Clinic : c))
      }
    } else {
      setClinics(prev => prev.map(c =>
        c.clinic_code === clinicCode
          ? { ...c, [columnId]: value, last_updated_by: userId, last_updated_by_name: userName, updated_at: new Date().toISOString() }
          : c
      ))

      const { error } = await supabase
        .from('clinics')
        .update({
          [columnId]: value === '' ? null : value,
          last_updated_by: userId,
          last_updated_by_name: userName,
          updated_at: new Date().toISOString(),
        })
        .eq('clinic_code', clinicCode)

      if (error) {
        const { data } = await supabase.from('clinics').select('*').eq('clinic_code', clinicCode).single()
        if (data) setClinics(prev => prev.map(c => c.clinic_code === clinicCode ? data as Clinic : c))
      }
    }
  }, [clinics, userId, userName, supabase])

  // Column rename handler (per-user, localStorage)
  const handleRename = useCallback((colId: string, name: string) => {
    setColumnRenames(prev => {
      const next = { ...prev }
      if (name) next[colId] = name
      else delete next[colId]
      savePersistent('colRenames', next)
      return next
    })
  }, [])

  // Add custom column (team-shared, DB)
  const addCustomColumn = async () => {
    const name = newColName.trim()
    if (!name) return
    const key = slugify(name)
    if (!key) return

    const { data, error } = await supabase
      .from('crm_custom_columns')
      .insert({
        column_key: key,
        column_name: name,
        column_type: newColType,
        display_order: customColumns.length,
        created_by: userId,
        created_by_name: userName,
      })
      .select()
      .single()

    if (!error && data) {
      setCustomColumns(prev => [...prev, data as CustomColumn])
      // Make it visible by default
      setColumnVisibility(prev => ({ ...prev, [`custom_${key}`]: true }))
    }

    setNewColName('')
    setNewColType('text')
    setShowAddColumn(false)
  }

  // Delete custom column (team-shared, DB)
  const deleteCustomColumn = async (col: CustomColumn) => {
    await supabase.from('crm_custom_columns').delete().eq('id', col.id)
    setCustomColumns(prev => prev.filter(c => c.id !== col.id))
  }

  // ── Undo / Redo ─────────────────────────────────────────────────────
  const handleUndo = useCallback(async () => {
    if (editHistory.length === 0) return
    const last = editHistory[editHistory.length - 1]
    setEditHistory(prev => prev.slice(0, -1))
    setRedoStack(prev => [...prev, last])

    const isCustom = last.columnId.startsWith('custom_')
    const customKey = isCustom ? last.columnId.replace('custom_', '') : null

    if (isCustom && customKey) {
      const clinic = clinics.find(c => c.clinic_code === last.clinicCode)
      const currentData = (clinic?.custom_data as Record<string, unknown>) || {}
      const newData = { ...currentData, [customKey]: last.oldValue }
      setClinics(prev => prev.map(c => c.clinic_code === last.clinicCode ? { ...c, custom_data: newData as Record<string, string | boolean | null> } : c))
      await supabase.from('clinics').update({ custom_data: newData }).eq('clinic_code', last.clinicCode)
    } else {
      setClinics(prev => prev.map(c => c.clinic_code === last.clinicCode ? { ...c, [last.columnId]: last.oldValue } : c))
      await supabase.from('clinics').update({ [last.columnId]: last.oldValue }).eq('clinic_code', last.clinicCode)
    }
  }, [editHistory, clinics, supabase])

  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0) return
    const last = redoStack[redoStack.length - 1]
    setRedoStack(prev => prev.slice(0, -1))
    setEditHistory(prev => [...prev, last])

    const isCustom = last.columnId.startsWith('custom_')
    const customKey = isCustom ? last.columnId.replace('custom_', '') : null

    if (isCustom && customKey) {
      const clinic = clinics.find(c => c.clinic_code === last.clinicCode)
      const currentData = (clinic?.custom_data as Record<string, unknown>) || {}
      const newData = { ...currentData, [customKey]: last.newValue }
      setClinics(prev => prev.map(c => c.clinic_code === last.clinicCode ? { ...c, custom_data: newData as Record<string, string | boolean | null> } : c))
      await supabase.from('clinics').update({ custom_data: newData }).eq('clinic_code', last.clinicCode)
    } else {
      setClinics(prev => prev.map(c => c.clinic_code === last.clinicCode ? { ...c, [last.columnId]: last.newValue } : c))
      await supabase.from('clinics').update({ [last.columnId]: last.newValue }).eq('clinic_code', last.clinicCode)
    }
  }, [redoStack, clinics, supabase])

  // Keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+H, Ctrl+Shift+Z)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); handleUndo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault(); handleRedo()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault(); setShowFindReplace(prev => !prev)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleUndo, handleRedo])

  // ── Phase 1.3 — Selection & bulk delete ─────────────────────────────
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    lastSelectedIdxRef.current = null
  }, [])

  const selectedClinics = useMemo(
    () => clinics.filter(c => selectedIds.has(c.id)),
    [clinics, selectedIds]
  )

  // Phase A.3 — aggregate dependency counts across selected clinics
  const openBulkDeleteModal = useCallback(async () => {
    if (selectedClinics.length === 0) return
    setBulkDeleteOpen(true)
    setBulkDependencies(null)
    const codes = selectedClinics.map(c => c.clinic_code)
    const [ticketsRes, schedulesRes, jobSheetsRes] = await Promise.all([
      supabase.from('tickets').select('id', { count: 'exact', head: true })
        .in('clinic_code', codes).neq('status', 'Resolved'),
      supabase.from('schedules').select('id', { count: 'exact', head: true })
        .in('clinic_code', codes).in('status', ['scheduled', 'in_progress']),
      supabase.from('job_sheets').select('id', { count: 'exact', head: true })
        .in('clinic_code', codes).eq('status', 'draft'),
    ])
    setBulkDependencies({
      openTickets: ticketsRes.count || 0,
      activeSchedules: schedulesRes.count || 0,
      draftJobSheets: jobSheetsRes.count || 0,
    })
  }, [selectedClinics, supabase])

  const handleBulkDelete = async () => {
    if (selectedClinics.length === 0) return
    setBulkDeleting(true)

    // Write audit entries in one batched insert (trigger is UPDATE-only)
    const auditRows = selectedClinics.map(c => ({
      table_name: 'clinics',
      record_id: c.id,
      action: 'DELETE',
      changed_by: userName || 'system',
      old_data: c as unknown as Record<string, unknown>,
      new_data: null,
    }))
    await supabase.from('audit_log').insert(auditRows)

    const ids = selectedClinics.map(c => c.id)
    const { error } = await supabase.from('clinics').delete().in('id', ids)

    if (error) {
      toast(`Failed to delete: ${error.message}`, 'error')
      setBulkDeleting(false)
      return
    }

    // Optimistic local update
    setClinics(prev => prev.filter(c => !selectedIds.has(c.id)))
    toast(`${ids.length} clinic${ids.length !== 1 ? 's' : ''} deleted`, 'success')
    clearSelection()
    setBulkDeleteOpen(false)
    setBulkDeleting(false)
  }

  // ── Reset Table Layout ──────────────────────────────────────────────
  const resetLayout = () => {
    setColumnSizing({})
    setColumnOrder([])
    setColumnRenames({})
    setColumnVisibility(DEFAULT_COLUMN_VISIBILITY)
    setFrozenCount(2)
    setFrozenRowCount(0)
    savePersistent('colSizes', {})
    savePersistent('colOrder', [])
    savePersistent('colRenames', {})
    savePersistent('vis', DEFAULT_COLUMN_VISIBILITY)
    savePersistent('frozenCols', 2)
    savePersistent('frozenRows', 0)
  }

  const table = useReactTable({
    data: clinics,
    columns: tableColumns,
    state: { sorting, columnFilters, columnVisibility, globalFilter, pagination, columnSizing, columnOrder },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onColumnSizingChange: setColumnSizing,
    onColumnOrderChange: setColumnOrder,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
    meta: { updateData },
  })

  const filteredCount = table.getFilteredRowModel().rows.length
  const { pageIndex, pageSize } = pagination
  const start = pageIndex * pageSize + 1
  const end = Math.min((pageIndex + 1) * pageSize, filteredCount)

  // Active column filters for chip display
  const activeFilters = columnFilters.filter(f => Array.isArray(f.value) && (f.value as string[]).length > 0)

  // Helper to get/set array filter value
  const getFilterValue = (id: string): string[] => {
    const f = columnFilters.find(f => f.id === id)
    return (f?.value as string[]) || []
  }
  const toggleFilterValue = (id: string, val: string) => {
    const current = getFilterValue(id)
    const next = current.includes(val) ? current.filter(v => v !== val) : [...current, val]
    table.getColumn(id)?.setFilterValue(next.length > 0 ? next : undefined)
    setPagination(prev => ({ ...prev, pageIndex: 0 }))
  }

  // Column groups including custom columns
  const allGroups = useMemo(() => {
    if (customColumns.length === 0) return COLUMN_GROUPS
    return [
      ...COLUMN_GROUPS,
      { label: 'Custom', columns: customColumns.map(c => `custom_${c.column_key}`) },
    ]
  }, [customColumns])

  // ── Find & Replace (needs table) ────────────────────────────────────
  const findMatches = useMemo(() => {
    if (!findText.trim()) return []
    const needle = findText.toLowerCase()
    const matches: Array<{ clinicCode: string; columnId: string; value: string }> = []
    const visibleCols = table.getVisibleFlatColumns().map(c => c.id)
    for (const clinic of clinics) {
      for (const colId of visibleCols) {
        const isCustom = colId.startsWith('custom_')
        const customKey = isCustom ? colId.replace('custom_', '') : null
        let cellVal: string
        if (isCustom && customKey) {
          cellVal = String((clinic.custom_data as Record<string, unknown>)?.[customKey] ?? '')
        } else {
          cellVal = String((clinic as unknown as Record<string, unknown>)[colId] ?? '')
        }
        if (cellVal && cellVal.toLowerCase().includes(needle)) {
          matches.push({ clinicCode: clinic.clinic_code, columnId: colId, value: cellVal })
        }
      }
    }
    return matches
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findText, clinics, table])

  const handleReplaceAll = async () => {
    if (!findText.trim() || findMatches.length === 0) return
    for (const match of findMatches) {
      const newVal = match.value.replace(new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replaceText)
      await updateData(match.clinicCode, match.columnId, newVal || null)
    }
    setFindText('')
    setReplaceText('')
  }

  // ── Export CSV (needs table) ───────────────────────────────────────
  const exportCSV = useCallback(() => {
    const rows = table.getFilteredRowModel().rows
    const visibleCols = table.getVisibleFlatColumns()

    const headers = visibleCols.map(col => {
      const name = columnRenames[col.id] || (typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id)
      return `"${name.replace(/"/g, '""')}"`
    })

    const csvRows = rows.map(row => {
      return visibleCols.map(col => {
        const isCustom = col.id.startsWith('custom_')
        const customKey = isCustom ? col.id.replace('custom_', '') : null
        let cellVal: string
        if (isCustom && customKey) {
          cellVal = String((row.original.custom_data as Record<string, unknown>)?.[customKey] ?? '')
        } else {
          cellVal = String((row.original as unknown as Record<string, unknown>)[col.id] ?? '')
        }
        return `"${cellVal.replace(/"/g, '""')}"`
      }).join(',')
    })

    const csv = [headers.join(','), ...csvRows].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `crm-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [table, columnRenames])

  return (
    <div>
      {/* ─ Toolbar ─ */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search clinics..."
            className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(''); setGlobalFilter('') }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filter dropdowns — searchable */}
        <div ref={filterMenuRef} className="flex items-center gap-2">
          {(['renewal_status', 'state', 'product_type'] as const).map((filterId) => {
            const label = filterId === 'renewal_status' ? 'Renewal' : filterId === 'state' ? 'State' : 'Product'
            const options = filterOptions[filterId]
            const active = getFilterValue(filterId)
            const filtered = filterSearch
              ? options.filter(o => o.toLowerCase().includes(filterSearch.toLowerCase()))
              : options
            return (
              <div key={filterId} className="relative">
                <button
                  onClick={() => { setShowFilterDropdown(showFilterDropdown === filterId ? null : filterId); setFilterSearch('') }}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors ${
                    active.length > 0
                      ? 'bg-accent/10 border-accent/30 text-accent'
                      : 'bg-surface border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {label}
                  {active.length > 0 && (
                    <span className="text-[10px] bg-accent text-white rounded-full size-4 flex items-center justify-center font-medium">{active.length}</span>
                  )}
                  <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showFilterDropdown === filterId && (
                  <div className="absolute top-full mt-1 left-0 z-30 bg-surface border border-border rounded-lg shadow-theme-lg min-w-[180px] flex flex-col">
                    <div className="px-2 pt-2 pb-1 flex-shrink-0">
                      <input
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                        placeholder={`Search ${label.toLowerCase()}...`}
                        className="w-full px-2 py-1.5 bg-surface-inset border border-border rounded text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => { if (e.key === 'Escape') { setShowFilterDropdown(null); setFilterSearch('') }; e.stopPropagation() }}
                      />
                    </div>
                    <div className="max-h-[240px] overflow-y-auto py-1">
                      {filtered.length === 0 && (
                        <p className="px-3 py-2 text-xs text-text-muted">No matches</p>
                      )}
                      {filtered.map(opt => (
                        <button
                          key={opt}
                          onClick={() => toggleFilterValue(filterId, opt)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised transition-colors"
                        >
                          <span className={`size-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                            active.includes(opt) ? 'bg-accent border-accent' : 'border-border'
                          }`}>
                            {active.includes(opt) && (
                              <svg className="size-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Column visibility + custom columns */}
        <div className="relative" ref={colMenuRef}>
          <button
            onClick={() => setShowColMenu(!showColMenu)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors"
            title="Toggle columns"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 4.5v15m6-15v15M4.5 9h15M4.5 15h15" />
            </svg>
            Columns
          </button>
          {showColMenu && (
            <div className="absolute top-full mt-1 right-0 z-30 bg-surface border border-border rounded-lg shadow-theme-lg w-[240px] max-h-[480px] flex flex-col">
              {/* Add custom column — pinned at top */}
              <div className="border-b border-border px-3 py-2 flex-shrink-0">
                {showAddColumn ? (
                  <div className="space-y-2">
                    <input
                      value={newColName}
                      onChange={(e) => setNewColName(e.target.value)}
                      placeholder="Column name..."
                      className="w-full px-2 py-1.5 bg-surface-inset border border-border rounded text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addCustomColumn()
                        if (e.key === 'Escape') { setShowAddColumn(false); setNewColName('') }
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={newColType}
                        onChange={(e) => setNewColType(e.target.value as 'text' | 'toggle')}
                        className="flex-1 px-2 py-1 bg-surface-inset border border-border rounded text-xs text-text-secondary focus:outline-none"
                      >
                        <option value="text">Text</option>
                        <option value="toggle">Toggle</option>
                      </select>
                      <button
                        onClick={addCustomColumn}
                        disabled={!newColName.trim()}
                        className="px-2.5 py-1 bg-accent text-white rounded text-xs font-medium disabled:opacity-40 hover:bg-accent/90 transition-colors"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setShowAddColumn(false); setNewColName('') }}
                        className="px-2 py-1 text-xs text-text-muted hover:text-text-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddColumn(true)}
                    className="flex items-center gap-1.5 text-sm text-accent hover:text-accent/80 transition-colors py-0.5"
                  >
                    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add custom column
                  </button>
                )}
              </div>

              {/* Column list — scrollable */}
              <div className="overflow-y-auto py-1">
                {allGroups.map(group => (
                  <div key={group.label}>
                    <span className="px-3 py-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider block">
                      {group.label}
                    </span>
                    {group.columns.map(colId => {
                      const col = table.getColumn(colId)
                      if (!col || !col.getCanHide()) return null
                      const isCustom = colId.startsWith('custom_')
                      const customCol = isCustom
                        ? customColumns.find(c => `custom_${c.column_key}` === colId)
                        : null
                      return (
                        <div key={colId} className="flex items-center group/vis">
                          <button
                            onClick={() => col.toggleVisibility()}
                            className="flex-1 flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised transition-colors"
                          >
                            <span className={`size-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                              col.getIsVisible() ? 'bg-accent border-accent' : 'border-border'
                            }`}>
                              {col.getIsVisible() && (
                                <svg className="size-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                            <span className="truncate">
                              {columnRenames[colId] || (typeof col.columnDef.header === 'string' ? col.columnDef.header : colId)}
                            </span>
                          </button>
                          {isCustom && customCol && (
                            <button
                              onClick={() => deleteCustomColumn(customCol)}
                              className="opacity-0 group-hover/vis:opacity-100 px-2 py-1 text-text-muted hover:text-red-400 transition-all"
                              title="Delete custom column"
                            >
                              <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Edit dropdown — freeze, undo, find, export, reset */}
        <div className="relative" ref={editMenuRef}>
          <button
            onClick={() => { setShowEditMenu(!showEditMenu); setShowFreezeSubmenu(null) }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
            Edit
          </button>
          {showEditMenu && (
            <div className="absolute top-full mt-1 left-0 z-30 bg-surface border border-border rounded-lg shadow-theme-lg py-1 min-w-[220px]">
              {/* Undo / Redo */}
              <button
                onClick={() => { handleUndo(); setShowEditMenu(false) }}
                disabled={editHistory.length === 0}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised transition-colors disabled:opacity-30"
              >
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                </svg>
                Undo
                <span className="ml-auto text-[11px] text-text-muted">Ctrl+Z</span>
              </button>
              <button
                onClick={() => { handleRedo(); setShowEditMenu(false) }}
                disabled={redoStack.length === 0}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised transition-colors disabled:opacity-30"
              >
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
                </svg>
                Redo
                <span className="ml-auto text-[11px] text-text-muted">Ctrl+Y</span>
              </button>
              <div className="border-t border-border my-1" />
              {/* Find & Replace */}
              <button
                onClick={() => { setShowFindReplace(prev => !prev); setShowEditMenu(false) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised transition-colors"
              >
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                Find & Replace
                <span className="ml-auto text-[11px] text-text-muted">Ctrl+H</span>
              </button>
              <div className="border-t border-border my-1" />
              {/* Freeze Columns */}
              <div className="relative">
                <button
                  onClick={() => setShowFreezeSubmenu(showFreezeSubmenu === 'cols' ? null : 'cols')}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised transition-colors"
                >
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v18" />
                  </svg>
                  Freeze columns
                  {frozenCount > 0 && <span className="text-[11px] text-accent font-medium">({frozenCount})</span>}
                  <svg className="size-3 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                {showFreezeSubmenu === 'cols' && (
                  <div className="absolute right-full top-0 mr-1 bg-surface border border-border rounded-lg shadow-theme-lg py-1 min-w-[170px] z-40">
                    {[0, 1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => { setFrozenCount(n); setShowFreezeSubmenu(null); setShowEditMenu(false) }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                          frozenCount === n ? 'text-accent font-medium bg-accent/5' : 'text-text-secondary hover:bg-surface-raised'
                        }`}
                      >
                        <span className="size-3.5 flex items-center justify-center flex-shrink-0">
                          {frozenCount === n && <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </span>
                        {n === 0 ? 'None' : `${n} ${n === 1 ? 'column' : 'columns'}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Freeze Rows */}
              <div className="relative">
                <button
                  onClick={() => setShowFreezeSubmenu(showFreezeSubmenu === 'rows' ? null : 'rows')}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised transition-colors"
                >
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9h18" />
                  </svg>
                  Freeze rows
                  {frozenRowCount > 0 && <span className="text-[11px] text-accent font-medium">({frozenRowCount})</span>}
                  <svg className="size-3 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                {showFreezeSubmenu === 'rows' && (
                  <div className="absolute right-full top-0 mr-1 bg-surface border border-border rounded-lg shadow-theme-lg py-1 min-w-[170px] z-40">
                    {[0, 1, 2, 3, 5, 10].map(n => (
                      <button
                        key={n}
                        onClick={() => { setFrozenRowCount(n); setShowFreezeSubmenu(null); setShowEditMenu(false) }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                          frozenRowCount === n ? 'text-accent font-medium bg-accent/5' : 'text-text-secondary hover:bg-surface-raised'
                        }`}
                      >
                        <span className="size-3.5 flex items-center justify-center flex-shrink-0">
                          {frozenRowCount === n && <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </span>
                        {n === 0 ? 'Header only' : `${n} ${n === 1 ? 'row' : 'rows'}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-border my-1" />
              {/* Export */}
              <button
                onClick={() => { exportCSV(); setShowEditMenu(false) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised transition-colors"
              >
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Export as CSV
              </button>
              <div className="border-t border-border my-1" />
              {/* Reset */}
              <button
                onClick={() => { resetLayout(); setShowEditMenu(false) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised transition-colors"
              >
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                Reset table layout
              </button>
            </div>
          )}
        </div>

        {/* Row count */}
        <span className="text-xs text-text-muted tabular-nums ml-auto">
          {filteredCount.toLocaleString()} {filteredCount === 1 ? 'clinic' : 'clinics'}
        </span>
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {activeFilters.map(f => (
            (f.value as string[]).map(val => (
              <button
                key={`${f.id}-${val}`}
                onClick={() => toggleFilterValue(f.id, val)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
              >
                {val}
                <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ))
          ))}
          <button
            onClick={() => { setColumnFilters([]); setPagination(prev => ({ ...prev, pageIndex: 0 })) }}
            className="text-[11px] text-text-muted hover:text-text-secondary transition-colors px-1"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Find & Replace bar */}
      {showFindReplace && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-surface border border-border rounded-lg">
          <div className="relative flex-1 min-w-[160px]">
            <input
              ref={findInputRef}
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              placeholder="Find..."
              className="w-full pl-3 pr-8 py-1.5 bg-surface-inset border border-border rounded text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Escape') { setShowFindReplace(false); setFindText(''); setReplaceText('') } }}
            />
            {findText && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-text-muted tabular-nums">
                {findMatches.length}
              </span>
            )}
          </div>
          <div className="relative flex-1 min-w-[160px]">
            <input
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace with..."
              className="w-full px-3 py-1.5 bg-surface-inset border border-border rounded text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              onKeyDown={(e) => { if (e.key === 'Enter') handleReplaceAll(); if (e.key === 'Escape') { setShowFindReplace(false); setFindText(''); setReplaceText('') } }}
            />
          </div>
          <button
            onClick={handleReplaceAll}
            disabled={findMatches.length === 0}
            className="px-3 py-1.5 text-sm bg-accent text-white rounded font-medium disabled:opacity-40 hover:bg-accent/90 transition-colors"
          >
            Replace all ({findMatches.length})
          </button>
          <button
            onClick={() => { setShowFindReplace(false); setFindText(''); setReplaceText('') }}
            className="p-1.5 text-text-muted hover:text-text-secondary transition-colors"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Phase B.2 — Select-all-matching banner */}
      {isAdmin && (() => {
        const visibleRows = table.getRowModel().rows
        const filteredRows = table.getFilteredRowModel().rows
        const visibleIds = visibleRows.map(r => r.original.id)
        const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
        const hasMoreMatching = filteredRows.length > visibleRows.length
        const allMatchingSelected = filteredRows.length > 0 && filteredRows.every(r => selectedIds.has(r.original.id))
        if (!allVisibleSelected || !hasMoreMatching || allMatchingSelected) return null
        const exceedsCap = filteredRows.length > BULK_DELETE_MAX
        return (
          <div className="mb-2 px-3 py-2 rounded-lg bg-accent/5 border border-accent/20 text-[12px] text-text-secondary flex items-center gap-2 flex-wrap">
            <svg className="size-3.5 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>All {visibleRows.length} on this page selected.</span>
            <button
              onClick={() => {
                if (exceedsCap) return
                setSelectedIds(new Set(filteredRows.map(r => r.original.id)))
              }}
              disabled={exceedsCap}
              title={exceedsCap ? `Cap is ${BULK_DELETE_MAX} — narrow your filter first` : undefined}
              className={`font-medium ${exceedsCap ? 'text-text-muted cursor-not-allowed' : 'text-accent hover:underline'}`}
            >
              Select all {filteredRows.length} matching?
            </button>
            {exceedsCap && (
              <span className="text-[11px] text-text-muted">(max {BULK_DELETE_MAX})</span>
            )}
          </div>
        )
      })()}

      {/* ─ Table ─ */}
      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-10 skeleton rounded" />)}
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden relative">
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
            <table className="w-full text-left" style={{ minWidth: '1200px' }}>
              <thead>
                {table.getHeaderGroups().map(headerGroup => {
                  // Compute cumulative left offsets for frozen columns.
                  // When the checkbox column is present, everything shifts right by its width.
                  const leftOffsets: number[] = []
                  let cumLeft = isAdmin ? CHECKBOX_COL_WIDTH : 0
                  headerGroup.headers.forEach((h, idx) => {
                    leftOffsets[idx] = cumLeft
                    if (idx < frozenCount) cumLeft += h.getSize()
                  })

                  // Current visible page rows — for select-all
                  const visibleRows = table.getRowModel().rows
                  const visibleIds = visibleRows.map(r => r.original.id)
                  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
                  const someVisibleSelected = visibleIds.some(id => selectedIds.has(id))

                  return (
                    <tr key={headerGroup.id}>
                      {isAdmin && (
                        <th
                          className="sticky top-0 bg-surface-raised px-3 py-2.5 border-b border-border z-30"
                          style={{ width: CHECKBOX_COL_WIDTH, position: 'sticky', left: 0 }}
                        >
                          <input
                            type="checkbox"
                            aria-label="Select all visible"
                            checked={allVisibleSelected}
                            ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected }}
                            onChange={e => {
                              e.stopPropagation()
                              setSelectedIds(prev => {
                                const next = new Set(prev)
                                if (e.target.checked) visibleIds.forEach(id => next.add(id))
                                else visibleIds.forEach(id => next.delete(id))
                                return next
                              })
                            }}
                            className="size-3.5 rounded border-border cursor-pointer accent-indigo-500"
                            onClick={e => e.stopPropagation()}
                          />
                        </th>
                      )}
                      {headerGroup.headers.map((header, i) => {
                        const isFrozen = i < frozenCount
                        const isLastFrozen = i === frozenCount - 1

                        return (
                          <th
                            key={header.id}
                            draggable={!isFrozen}
                            onDragStart={(e) => {
                              dragColRef.current = header.column.id
                              e.dataTransfer.effectAllowed = 'move'
                              ;(e.target as HTMLElement).style.opacity = '0.5'
                            }}
                            onDragEnd={(e) => {
                              ;(e.target as HTMLElement).style.opacity = '1'
                              dragColRef.current = null
                              dragOverColRef.current = null
                            }}
                            onDragOver={(e) => {
                              e.preventDefault()
                              e.dataTransfer.dropEffect = 'move'
                              dragOverColRef.current = header.column.id
                            }}
                            onDrop={(e) => {
                              e.preventDefault()
                              const from = dragColRef.current
                              const to = header.column.id
                              if (!from || from === to) return
                              const currentOrder = table.getAllLeafColumns().map(c => c.id)
                              const fromIdx = currentOrder.indexOf(from)
                              const toIdx = currentOrder.indexOf(to)
                              if (fromIdx < 0 || toIdx < 0) return
                              const next = [...currentOrder]
                              next.splice(fromIdx, 1)
                              next.splice(toIdx, 0, from)
                              setColumnOrder(next)
                            }}
                            onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                            className={`sticky top-0 bg-surface-raised text-[11px] font-semibold text-text-muted uppercase tracking-wider px-3 py-2.5 border-b border-border select-none whitespace-nowrap ${
                              header.column.getCanSort() ? 'cursor-pointer hover:text-text-secondary' : ''
                            } ${isFrozen ? 'z-30' : 'cursor-grab z-10'} ${isLastFrozen ? 'shadow-[2px_0_4px_-1px_rgba(0,0,0,0.15)]' : ''}`}
                            style={{
                              width: header.getSize(),
                              position: 'sticky',
                              left: isFrozen ? leftOffsets[i] : undefined,
                            }}
                          >
                            <span className="inline-flex items-center gap-1">
                              <RenameableHeader header={header} renames={columnRenames} onRename={handleRename} />
                              {header.column.getIsSorted() === 'asc' && (
                                <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                              )}
                              {header.column.getIsSorted() === 'desc' && (
                                <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              )}
                            </span>
                            {/* Resize handle */}
                            {header.column.getCanResize() && (
                              <div
                                onMouseDown={header.getResizeHandler()}
                                onTouchStart={header.getResizeHandler()}
                                onClick={(e) => e.stopPropagation()}
                                onDoubleClick={(e) => { e.stopPropagation(); header.column.resetSize() }}
                                className={`absolute top-0 right-0 w-[3px] h-full cursor-col-resize select-none touch-none transition-colors hover:bg-accent/50 ${
                                  header.column.getIsResizing() ? 'bg-accent' : ''
                                }`}
                                title="Drag to resize, double-click to reset"
                              />
                            )}
                          </th>
                        )
                      })}
                    </tr>
                  )
                })}
              </thead>
              <tbody className="divide-y divide-border">
                {table.getRowModel().rows.map((row, rowIdx) => {
                  const isRowFrozen = rowIdx < frozenRowCount
                  const isLastFrozenRow = rowIdx === frozenRowCount - 1
                  // Header height ~37px, each frozen row ~41px
                  const HEADER_H = 37
                  const ROW_H = 41
                  const stickyTop = isRowFrozen ? HEADER_H + rowIdx * ROW_H : undefined

                  // Compute left offsets for frozen body cells
                  const cells = row.getVisibleCells()
                  const bodyLeftOffsets: number[] = []
                  let cumBodyLeft = isAdmin ? CHECKBOX_COL_WIDTH : 0
                  cells.forEach((c, idx) => {
                    bodyLeftOffsets[idx] = cumBodyLeft
                    if (idx < frozenCount) cumBodyLeft += c.column.getSize()
                  })

                  const rowId = row.original.id
                  const rowSelected = selectedIds.has(rowId)

                  return (
                    <tr
                      key={row.id}
                      onClick={() => onClinicSelect(row.original.clinic_code)}
                      className={`group/row cursor-pointer transition-colors ${isRowFrozen ? 'bg-surface-raised hover:bg-surface-raised' : 'hover:bg-surface-raised'} ${isLastFrozenRow ? 'shadow-[0_2px_4px_-1px_rgba(0,0,0,0.15)]' : ''} ${rowSelected ? 'bg-indigo-500/5' : ''}`}
                      style={isRowFrozen ? { position: 'sticky', top: stickyTop, zIndex: 4 } : undefined}
                    >
                      {isAdmin && (
                        <td
                          className={`px-3 py-2 sticky bg-surface group-hover/row:bg-surface-raised ${rowSelected ? 'bg-indigo-500/5' : ''} ${isRowFrozen ? 'z-[6]' : 'z-[5]'}`}
                          style={{ width: CHECKBOX_COL_WIDTH, left: 0 }}
                          onClick={e => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.original.clinic_name}`}
                            checked={rowSelected}
                            onChange={e => {
                              const thisIdx = rowIdx
                              const shift = (e.nativeEvent as MouseEvent).shiftKey
                              setSelectedIds(prev => {
                                const next = new Set(prev)
                                // Shift-click: select range from last to current
                                if (shift && lastSelectedIdxRef.current !== null) {
                                  const [lo, hi] = [
                                    Math.min(lastSelectedIdxRef.current, thisIdx),
                                    Math.max(lastSelectedIdxRef.current, thisIdx),
                                  ]
                                  const rangeRows = table.getRowModel().rows.slice(lo, hi + 1)
                                  const shouldSelect = e.target.checked
                                  rangeRows.forEach(r => {
                                    if (shouldSelect) next.add(r.original.id)
                                    else next.delete(r.original.id)
                                  })
                                } else {
                                  if (e.target.checked) next.add(rowId)
                                  else next.delete(rowId)
                                }
                                return next
                              })
                              lastSelectedIdxRef.current = thisIdx
                            }}
                            className="size-3.5 rounded border-border cursor-pointer accent-indigo-500"
                            onClick={e => e.stopPropagation()}
                          />
                        </td>
                      )}
                      {cells.map((cell, i) => {
                        const isFrozen = i < frozenCount
                        const isLastFrozen = i === frozenCount - 1

                        return (
                          <td
                            key={cell.id}
                            className={`px-3 py-2 text-[13px] ${isRowFrozen && !isFrozen ? 'bg-surface-raised' : ''} ${isFrozen ? `sticky bg-surface-raised group-hover/row:bg-surface-raised ${isRowFrozen ? 'z-[6]' : 'z-[5]'}` : ''} ${isLastFrozen ? 'shadow-[2px_0_4px_-1px_rgba(0,0,0,0.15)]' : ''}`}
                            style={{
                              width: cell.column.getSize(),
                              maxWidth: cell.column.getSize(),
                              left: isFrozen ? bodyLeftOffsets[i] : undefined,
                            }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {table.getRowModel().rows.length === 0 && (
                  <tr>
                    <td colSpan={table.getVisibleFlatColumns().length + (isAdmin ? 1 : 0)} className="px-4 py-12 text-center">
                      <p className="text-sm text-text-muted">No clinics found</p>
                      {globalFilter && <p className="text-xs text-text-muted mt-1">Try a different search term</p>}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ─ Pagination ─ */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-surface">
            <span className="text-xs text-text-muted tabular-nums">
              {filteredCount > 0 ? `${start}–${end} of ${filteredCount.toLocaleString()}` : 'No results'}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="px-2.5 py-1 text-xs bg-surface border border-border rounded-md disabled:opacity-30 text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
              >
                Previous
              </button>
              <span className="text-xs text-text-tertiary tabular-nums px-2">
                {pageIndex + 1} / {table.getPageCount() || 1}
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="px-2.5 py-1 text-xs bg-surface border border-border rounded-md disabled:opacity-30 text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 1.3 — Bulk action toolbar (sticky bottom) */}
      {isAdmin && selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-surface border border-border rounded-full shadow-theme-lg px-4 py-2 flex items-center gap-3">
          <span className="text-[13px] text-text-primary">
            <span className="font-semibold">{selectedIds.size}</span> selected
          </span>
          <button
            onClick={clearSelection}
            className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors"
          >
            Clear
          </button>
          <div className="w-px h-5 bg-border" />
          <Button
            variant="danger"
            size="sm"
            onClick={openBulkDeleteModal}
            disabled={selectedIds.size > BULK_DELETE_MAX}
            title={selectedIds.size > BULK_DELETE_MAX ? `Max ${BULK_DELETE_MAX} at a time — use CSV upload for larger deletions` : undefined}
          >
            Delete selected ({selectedIds.size})
          </Button>
        </div>
      )}

      {/* Phase 1.3 — Bulk delete confirmation */}
      <ModalDialog
        open={bulkDeleteOpen}
        onClose={() => { if (!bulkDeleting) setBulkDeleteOpen(false) }}
        title={`Delete ${selectedIds.size} ${selectedIds.size === 1 ? 'clinic' : 'clinics'}?`}
        size="md"
      >
        <div className="p-4 space-y-3">
          <p className="text-[13px] text-text-primary">
            This will permanently remove the following {selectedIds.size === 1 ? 'clinic' : `${selectedIds.size} clinics`} from the CRM.
          </p>

          <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-surface-inset/30 p-2">
            <ul className="text-[12px] space-y-0.5">
              {selectedClinics.slice(0, 10).map(c => (
                <li key={c.id} className="flex gap-2">
                  <span className="font-mono text-text-tertiary flex-shrink-0">{c.clinic_code}</span>
                  <span className="text-text-secondary truncate">{c.clinic_name}</span>
                </li>
              ))}
              {selectedClinics.length > 10 && (
                <li className="text-text-muted italic pt-1">…and {selectedClinics.length - 10} more</li>
              )}
            </ul>
          </div>

          {bulkDependencies === null && (
            <p className="text-[12px] text-text-muted">Checking dependencies…</p>
          )}

          {bulkDependencies && (bulkDependencies.openTickets > 0 || bulkDependencies.activeSchedules > 0 || bulkDependencies.draftJobSheets > 0) && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-300">
              <p className="font-semibold mb-1">⚠ These clinics have active references:</p>
              <ul className="space-y-0.5 text-amber-200/90">
                {bulkDependencies.openTickets > 0 && <li>· {bulkDependencies.openTickets} open ticket{bulkDependencies.openTickets !== 1 ? 's' : ''}</li>}
                {bulkDependencies.activeSchedules > 0 && <li>· {bulkDependencies.activeSchedules} active schedule{bulkDependencies.activeSchedules !== 1 ? 's' : ''}</li>}
                {bulkDependencies.draftJobSheets > 0 && <li>· {bulkDependencies.draftJobSheets} draft job sheet{bulkDependencies.draftJobSheets !== 1 ? 's' : ''}</li>}
              </ul>
              <p className="mt-2 text-amber-200/80">Consider resolving these first.</p>
            </div>
          )}

          <p className="text-[12px] text-text-tertiary">
            Existing tickets, schedules, and job sheets referencing these clinics will keep their snapshot — they will not be affected.
          </p>
          <p className="text-[12px] text-red-400 font-medium">This action cannot be undone.</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-surface-inset/30">
          <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>Cancel</Button>
          <Button variant="danger" onClick={handleBulkDelete} loading={bulkDeleting}>
            Delete {selectedIds.size} permanently
          </Button>
        </div>
      </ModalDialog>
    </div>
  )
}
