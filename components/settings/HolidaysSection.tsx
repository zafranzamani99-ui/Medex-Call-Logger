'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import type { PublicHoliday } from '@/lib/types'

// WHY: Admin-only section to manage Malaysian public holidays. Seeded migration
// 070 inserts 2026 federal + state holidays; admin can correct/extend here.

const MY_STATES = [
  { value: 'federal', label: 'Federal (nationwide)' },
  { value: 'JHR', label: 'Johor' },
  { value: 'KDH', label: 'Kedah' },
  { value: 'KTN', label: 'Kelantan' },
  { value: 'MLK', label: 'Melaka' },
  { value: 'NSN', label: 'Negeri Sembilan' },
  { value: 'PHG', label: 'Pahang' },
  { value: 'PNG', label: 'Penang' },
  { value: 'PRK', label: 'Perak' },
  { value: 'PLS', label: 'Perlis' },
  { value: 'SBH', label: 'Sabah' },
  { value: 'SWK', label: 'Sarawak' },
  { value: 'SEL', label: 'Selangor' },
  { value: 'TRG', label: 'Terengganu' },
  { value: 'KUL', label: 'Kuala Lumpur' },
  { value: 'LBN', label: 'Labuan' },
  { value: 'PJY', label: 'Putrajaya' },
] as const

const scopeLabel = (scope: string) => MY_STATES.find(s => s.value === scope)?.label || scope

// Format YYYY-MM-DD as DD/MM/YYYY for display (Malaysian convention)
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function HolidaysSection() {
  const supabase = createClient()
  const { toast } = useToast()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [holidays, setHolidays] = useState<PublicHoliday[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newName, setNewName] = useState('')
  const [newScope, setNewScope] = useState('federal')
  const [filter, setFilter] = useState<'all' | 'federal' | 'state'>('all')
  const [collapsed, setCollapsed] = useState(true)

  const load = async () => {
    setLoading(true)
    const start = `${year}-01-01`
    const end = `${year}-12-31`
    const { data, error } = await supabase
      .from('public_holidays')
      .select('*')
      .gte('holiday_date', start)
      .lte('holiday_date', end)
      .order('holiday_date')
    setLoading(false)
    if (error) {
      toast('Failed to load holidays: ' + error.message, 'error')
      return
    }
    setHolidays((data || []) as PublicHoliday[])
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [year])

  const handleAdd = async () => {
    if (!newDate || !newName.trim()) {
      toast('Date and name required', 'error')
      return
    }
    setAdding(true)
    const { data: { session } } = await supabase.auth.getSession()
    const { error } = await supabase.from('public_holidays').insert({
      holiday_date: newDate,
      name: newName.trim(),
      scope: newScope,
      created_by: session?.user.id || null,
    })
    setAdding(false)
    if (error) {
      toast(error.message.includes('duplicate') ? 'Holiday already exists' : `Failed: ${error.message}`, 'error')
      return
    }
    toast('Holiday added', 'success')
    setNewDate('')
    setNewName('')
    setNewScope('federal')
    load()
  }

  const handleDelete = async (h: PublicHoliday) => {
    if (!confirm(`Remove "${h.name}" on ${fmtDate(h.holiday_date)}?`)) return
    const { error } = await supabase.from('public_holidays').delete().eq('id', h.id)
    if (error) {
      toast('Failed to delete: ' + error.message, 'error')
      return
    }
    toast('Holiday removed', 'success')
    load()
  }

  const yearOptions = useMemo(() => {
    const cur = new Date().getFullYear()
    return [cur - 1, cur, cur + 1, cur + 2]
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'federal') return holidays.filter(h => h.scope === 'federal')
    if (filter === 'state') return holidays.filter(h => h.scope !== 'federal')
    return holidays
  }, [holidays, filter])

  const fedCount = holidays.filter(h => h.scope === 'federal').length
  const stateCount = holidays.length - fedCount

  return (
    <div className="bg-surface border border-border rounded-lg p-4 sm:p-6 mb-6">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between gap-3 group"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors">Public Holidays</h2>
          <span className="text-[11px] text-text-muted">
            {fedCount} federal · {stateCount} state
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="px-2 py-1 bg-surface-raised border border-border rounded-md text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <svg
            className={`size-4 text-text-tertiary transition-transform ${collapsed ? '' : 'rotate-180'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {!collapsed && (
      <>
      <p className="text-xs text-text-tertiary mt-3 mb-4">
        Federal holidays apply nationwide. State holidays warn only when scheduling for a clinic in that state.
      </p>

      {/* Add row */}
      <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr_180px_auto] gap-2 mb-4 p-3 bg-surface-raised rounded-lg">
        <div>
          <Label>Date</Label>
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
        </div>
        <div>
          <Label>Name</Label>
          <Input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Sultan's Birthday" />
        </div>
        <div>
          <Label>Scope</Label>
          <select
            value={newScope}
            onChange={(e) => setNewScope(e.target.value)}
            className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            {MY_STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <Button variant="primary" size="md" onClick={handleAdd} disabled={adding}>
            {adding ? 'Adding...' : 'Add'}
          </Button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1 mb-2">
        {([
          { key: 'all', label: `All (${holidays.length})` },
          { key: 'federal', label: `Federal (${fedCount})` },
          { key: 'state', label: `State (${stateCount})` },
        ] as const).map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => setFilter(p.key)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
              filter === p.key
                ? 'bg-accent/15 text-accent'
                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-raised'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* List — capped height with internal scroll so the settings page doesn't grow with holiday count */}
      {loading ? (
        <p className="text-sm text-text-tertiary">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-text-tertiary">No holidays {filter !== 'all' ? `(${filter})` : ''} for {year}.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto pr-1 space-y-1 border border-border/50 rounded-md p-1.5 bg-background/40">
          {filtered.map(h => (
            <div
              key={h.id}
              className="flex items-center justify-between gap-3 px-3 py-2 bg-surface-raised rounded-md hover:bg-surface-raised/80 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-xs font-mono text-text-tertiary w-20 flex-shrink-0">
                  {fmtDate(h.holiday_date)}
                </span>
                <span className="text-sm text-text-primary truncate">{h.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                  h.scope === 'federal'
                    ? 'bg-rose-500/15 text-rose-300'
                    : 'bg-zinc-500/15 text-zinc-400'
                }`}>
                  {scopeLabel(h.scope)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(h)}
                className="text-xs text-text-tertiary hover:text-red-400 px-2 py-1 transition-colors flex-shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  )
}
