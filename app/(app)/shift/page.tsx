'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, addDays, startOfISOWeek,
  getISOWeek,
} from 'date-fns'
import type { SaturdayShift, StandbyShift, ReplacementLeave, StaffRef, PublicHoliday, Profile } from '@/lib/types'
import { toProperCase } from '@/lib/constants'
import { ModalDialog } from '@/components/Modal'
import { Label, Input, Textarea, Select } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'

type Tab = 'saturday' | 'standby' | 'leave'

const HOLIDAY_SCOPES = ['federal', 'SEL', 'KUL']

export default function ShiftPage() {
  const supabase = createClient()
  const { toast } = useToast()

  const [tab, setTab] = useState<Tab>('saturday')
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [agents, setAgents] = useState<Pick<Profile, 'id' | 'display_name'>[]>([])

  const [saturdayShifts, setSaturdayShifts] = useState<SaturdayShift[]>([])
  const [standbyShifts, setStandbyShifts] = useState<StandbyShift[]>([])
  const [leaves, setLeaves] = useState<ReplacementLeave[]>([])
  const [holidays, setHolidays] = useState<PublicHoliday[]>([])

  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<SaturdayShift | StandbyShift | ReplacementLeave | null>(null)
  const [saving, setSaving] = useState(false)

  // Saturday modal form
  const [formDate, setFormDate] = useState('')
  const [formStaff, setFormStaff] = useState<Set<string>>(new Set())
  const [formNotes, setFormNotes] = useState('')

  // Standby modal form
  const [formWeekdayStaff, setFormWeekdayStaff] = useState<Set<string>>(new Set())
  const [formWeekendStaff, setFormWeekendStaff] = useState<Set<string>>(new Set())

  // Leave modal form
  const [formStaffId, setFormStaffId] = useState('')
  const [formDuration, setFormDuration] = useState<number>(1)

  // Leave tab filters
  const [leaveFilterStaff, setLeaveFilterStaff] = useState('all')
  const [leaveFilterMonth, setLeaveFilterMonth] = useState('all')

  // ── Data fetching ──────────────────────────────────────────────────────

  const loadMonthData = useCallback(async (month: Date) => {
    const monthStart = format(startOfMonth(month), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd')

    const firstWeekStart = format(startOfISOWeek(startOfMonth(month)), 'yyyy-MM-dd')
    const lastWeekStart = format(startOfISOWeek(endOfMonth(month)), 'yyyy-MM-dd')

    const [satRes, standbyRes] = await Promise.all([
      supabase
        .from('saturday_shifts')
        .select('*')
        .gte('shift_date', monthStart)
        .lte('shift_date', monthEnd)
        .order('shift_date'),
      supabase
        .from('standby_shifts')
        .select('*')
        .gte('week_start', firstWeekStart)
        .lte('week_start', lastWeekStart)
        .order('week_start'),
    ])

    if (satRes.data) setSaturdayShifts(satRes.data as SaturdayShift[])
    if (standbyRes.data) setStandbyShifts(standbyRes.data as StandbyShift[])
  }, [supabase])

  const loadLeaves = useCallback(async () => {
    const { data } = await supabase
      .from('replacement_leaves')
      .select('*')
      .order('leave_date', { ascending: false })
    if (data) setLeaves(data as ReplacementLeave[])
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const uid = session.user.id
      setUserId(uid)

      const [agentsRes, holidaysRes] = await Promise.all([
        supabase.from('profiles').select('id, display_name').eq('is_active', true).in('role', ['support', 'administrator']).order('display_name'),
        supabase.from('public_holidays').select('*').in('scope', HOLIDAY_SCOPES),
      ])

      if (agentsRes.data) setAgents(agentsRes.data)
      if (holidaysRes.data) setHolidays(holidaysRes.data as PublicHoliday[])

      await Promise.all([loadMonthData(startOfMonth(new Date())), loadLeaves()])
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!loading) loadMonthData(currentMonth)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth])

  // ── Computed ───────────────────────────────────────────────────────────

  const holidayMap = useMemo(() => {
    const map = new Map<string, string[]>()
    holidays.forEach(h => {
      const names = map.get(h.holiday_date) || []
      names.push(h.name)
      map.set(h.holiday_date, names)
    })
    return map
  }, [holidays])

  const saturdaysInMonth = useMemo(() => {
    const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
    return days.filter(d => getDay(d) === 6)
  }, [currentMonth])

  const weeksInMonth = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const weeks: Date[] = []
    let current = startOfISOWeek(monthStart)
    while (current <= monthEnd) {
      weeks.push(current)
      current = addDays(current, 7)
    }
    return weeks
  }, [currentMonth])

  const satShiftMap = useMemo(() => {
    const map = new Map<string, SaturdayShift>()
    saturdayShifts.forEach(s => map.set(s.shift_date, s))
    return map
  }, [saturdayShifts])

  const standbyMap = useMemo(() => {
    const map = new Map<string, StandbyShift>()
    standbyShifts.forEach(s => map.set(s.week_start, s))
    return map
  }, [standbyShifts])

  const filteredLeaves = useMemo(() => {
    let list = leaves
    if (leaveFilterStaff !== 'all') {
      list = list.filter(l => l.staff_id === leaveFilterStaff)
    }
    if (leaveFilterMonth !== 'all') {
      list = list.filter(l => l.leave_date.startsWith(leaveFilterMonth))
    }
    return list
  }, [leaves, leaveFilterStaff, leaveFilterMonth])

  const leaveMonthOptions = useMemo(() => {
    const months = new Set<string>()
    leaves.forEach(l => months.add(l.leave_date.slice(0, 7)))
    return Array.from(months).sort().reverse()
  }, [leaves])

  // ── Modal helpers ──────────────────────────────────────────────────────

  const resetForm = () => {
    setFormDate('')
    setFormStaff(new Set())
    setFormWeekdayStaff(new Set())
    setFormWeekendStaff(new Set())
    setFormNotes('')
    setFormStaffId('')
    setFormDuration(1)
    setEditingItem(null)
  }

  const openAddModal = () => {
    resetForm()
    if (tab === 'saturday') {
      const nextSat = saturdaysInMonth.find(d => !satShiftMap.has(format(d, 'yyyy-MM-dd')))
      if (nextSat) setFormDate(format(nextSat, 'yyyy-MM-dd'))
    } else if (tab === 'standby') {
      const nextWeek = weeksInMonth.find(d => !standbyMap.has(format(d, 'yyyy-MM-dd')))
      if (nextWeek) setFormDate(format(nextWeek, 'yyyy-MM-dd'))
    }
    setShowModal(true)
  }

  const openEditModal = (item: SaturdayShift | StandbyShift | ReplacementLeave) => {
    resetForm()
    setEditingItem(item)

    if (tab === 'saturday') {
      const sat = item as SaturdayShift
      setFormDate(sat.shift_date)
      setFormStaff(new Set(sat.staff.map(s => s.id)))
      setFormNotes(sat.notes || '')
    } else if (tab === 'standby') {
      const stb = item as StandbyShift
      setFormDate(stb.week_start)
      setFormWeekdayStaff(new Set(stb.weekday_staff.map(s => s.id)))
      setFormWeekendStaff(new Set(stb.weekend_staff.map(s => s.id)))
      setFormNotes(stb.notes || '')
    } else {
      const lv = item as ReplacementLeave
      setFormDate(lv.leave_date)
      setFormStaffId(lv.staff_id)
      setFormDuration(lv.duration)
      setFormNotes(lv.notes || '')
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    resetForm()
  }

  const buildStaffRefs = (ids: Set<string>): StaffRef[] =>
    agents.filter(a => ids.has(a.id)).map(a => ({ id: a.id, name: a.display_name }))

  // ── CRUD: Saturday ─────────────────────────────────────────────────────

  const saveSaturday = async () => {
    if (!formDate) { toast('Please select a date', 'error'); return }
    const dayOfWeek = getDay(new Date(formDate + 'T00:00:00'))
    if (dayOfWeek !== 6) { toast('Please select a Saturday', 'error'); return }
    if (formStaff.size === 0) { toast('Select at least one staff', 'error'); return }

    setSaving(true)
    const payload = {
      shift_date: formDate,
      staff: buildStaffRefs(formStaff),
      notes: formNotes.trim() || null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    }

    const { error } = editingItem
      ? await supabase.from('saturday_shifts').update(payload).eq('id', editingItem.id)
      : await supabase.from('saturday_shifts').upsert(payload, { onConflict: 'shift_date' })

    if (!error) {
      toast(editingItem ? 'Updated' : 'Saved')
      closeModal()
      await loadMonthData(currentMonth)
    } else {
      toast('Failed to save', 'error')
    }
    setSaving(false)
  }

  const deleteSaturday = async (id: string) => {
    if (!confirm('Delete this Saturday shift?')) return
    const { error } = await supabase.from('saturday_shifts').delete().eq('id', id)
    if (!error) {
      setSaturdayShifts(prev => prev.filter(s => s.id !== id))
      toast('Deleted')
    }
  }

  // ── CRUD: Standby ──────────────────────────────────────────────────────

  const saveStandby = async () => {
    if (!formDate) { toast('Please select a date', 'error'); return }
    const dayOfWeek = getDay(new Date(formDate + 'T00:00:00'))
    if (dayOfWeek !== 1) { toast('Please select a Monday', 'error'); return }
    if (formWeekdayStaff.size === 0) { toast('Select weekday staff', 'error'); return }
    if (formWeekendStaff.size === 0) { toast('Select weekend staff', 'error'); return }

    setSaving(true)
    const weekEnd = format(addDays(new Date(formDate + 'T00:00:00'), 6), 'yyyy-MM-dd')
    const payload = {
      week_start: formDate,
      week_end: weekEnd,
      weekday_staff: buildStaffRefs(formWeekdayStaff),
      weekend_staff: buildStaffRefs(formWeekendStaff),
      notes: formNotes.trim() || null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    }

    const { error } = editingItem
      ? await supabase.from('standby_shifts').update(payload).eq('id', editingItem.id)
      : await supabase.from('standby_shifts').upsert(payload, { onConflict: 'week_start' })

    if (!error) {
      toast(editingItem ? 'Updated' : 'Saved')
      closeModal()
      await loadMonthData(currentMonth)
    } else {
      toast('Failed to save', 'error')
    }
    setSaving(false)
  }

  const deleteStandby = async (id: string) => {
    if (!confirm('Delete this standby week?')) return
    const { error } = await supabase.from('standby_shifts').delete().eq('id', id)
    if (!error) {
      setStandbyShifts(prev => prev.filter(s => s.id !== id))
      toast('Deleted')
    }
  }

  // ── CRUD: Replacement Leave ────────────────────────────────────────────

  const saveLeave = async () => {
    if (!formStaffId) { toast('Please select a staff member', 'error'); return }
    if (!formDate) { toast('Please select a date', 'error'); return }

    setSaving(true)
    const staffName = agents.find(a => a.id === formStaffId)?.display_name || ''
    const payload = {
      staff_id: formStaffId,
      staff_name: staffName,
      leave_date: formDate,
      duration: formDuration,
      notes: formNotes.trim() || null,
      created_by: userId,
    }

    let error
    if (editingItem) {
      ({ error } = await supabase.from('replacement_leaves').update(payload).eq('id', editingItem.id))
    } else {
      ({ error } = await supabase.from('replacement_leaves').insert(payload))
    }

    if (!error) {
      toast(editingItem ? 'Updated' : 'Saved')
      closeModal()
      await loadLeaves()
    } else if (error.code === '23505') {
      toast('This person already has leave on that date', 'error')
    } else {
      toast('Failed to save', 'error')
    }
    setSaving(false)
  }

  const deleteLeave = async (id: string) => {
    if (!confirm('Delete this replacement leave?')) return
    const { error } = await supabase.from('replacement_leaves').delete().eq('id', id)
    if (!error) {
      setLeaves(prev => prev.filter(l => l.id !== id))
      toast('Deleted')
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────

  const staffNames = (refs: StaffRef[]) =>
    refs.map(r => toProperCase(r.name)).join(' / ')

  const StaffCheckboxes = ({ selected, onChange }: { selected: Set<string>; onChange: (s: Set<string>) => void }) => (
    <div className="space-y-1.5">
      {agents.map(a => (
        <label key={a.id} className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={selected.has(a.id)}
            onChange={() => {
              const next = new Set(selected)
              if (next.has(a.id)) next.delete(a.id); else next.add(a.id)
              onChange(next)
            }}
            className="size-4 rounded border-border bg-surface-inset text-indigo-500 focus:ring-indigo-500/50"
          />
          <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
            {toProperCase(a.display_name)}
            {a.id === userId && <span className="text-text-muted ml-1">(you)</span>}
          </span>
        </label>
      ))}
    </div>
  )

  // ── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="h-8 w-32 skeleton rounded mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 skeleton rounded-lg" />)}
        </div>
      </div>
    )
  }

  // ── Main Render ────────────────────────────────────────────────────────

  const prevMonth = () => setCurrentMonth(m => subMonths(m, 1))
  const nextMonth = () => setCurrentMonth(m => addMonths(m, 1))

  return (
    <div className="max-w-4xl mx-auto">
      {/* Tab Bar */}
      <div className="flex gap-1 mb-5 bg-surface-raised p-1 rounded-lg">
        {([
          { key: 'saturday' as Tab, label: 'Saturday Schedule' },
          { key: 'standby' as Tab, label: 'Standby Schedule' },
          { key: 'leave' as Tab, label: 'Replacement Leave' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              tab === t.key
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'text-text-tertiary hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Saturday Tab ──────────────────────────────────────────────── */}
      {tab === 'saturday' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-surface-raised text-text-secondary hover:text-text-primary transition-colors">
                <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <h2 className="text-sm font-semibold text-text-primary min-w-[140px] text-center">
                {format(currentMonth, 'MMMM yyyy')}
              </h2>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-surface-raised text-text-secondary hover:text-text-primary transition-colors">
                <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            <Button size="sm" onClick={openAddModal}>+ Add Saturday</Button>
          </div>

          {saturdaysInMonth.length === 0 ? (
            <EmptyState
              icon={<svg className="size-8 text-text-muted" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75" /></svg>}
              title="No Saturdays this month"
            />
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-raised text-text-tertiary text-xs">
                    <th className="text-left px-4 py-2.5 font-medium">Date</th>
                    <th className="text-left px-4 py-2.5 font-medium">Staff</th>
                    <th className="text-left px-4 py-2.5 font-medium">Holiday</th>
                    <th className="text-right px-4 py-2.5 font-medium w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {saturdaysInMonth.map(satDate => {
                    const key = format(satDate, 'yyyy-MM-dd')
                    const shift = satShiftMap.get(key)
                    const dayHolidays = holidayMap.get(key) || []
                    const isPH = dayHolidays.length > 0
                    return (
                      <tr key={key} className={`transition-colors ${isPH ? 'bg-amber-500/5' : 'hover:bg-surface-raised/50'}`}>
                        <td className="px-4 py-3">
                          <span className="text-text-primary font-medium">{format(satDate, 'd MMM yyyy')}</span>
                        </td>
                        <td className="px-4 py-3">
                          {shift ? (
                            <span className="text-text-primary">{staffNames(shift.staff)}</span>
                          ) : (
                            <span className="text-text-muted italic">Not assigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {dayHolidays.map((name, i) => (
                            <span key={i} className="inline-block px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-400 rounded mr-1">
                              {name}
                            </span>
                          ))}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {shift ? (
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEditModal(shift)} className="p-1.5 rounded hover:bg-surface-raised text-text-tertiary hover:text-indigo-400 transition-colors">
                                <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                              </button>
                              <button onClick={() => deleteSaturday(shift.id)} className="p-1.5 rounded hover:bg-red-500/10 text-text-tertiary hover:text-red-400 transition-colors">
                                <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { resetForm(); setFormDate(key); setShowModal(true) }}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                              + Assign
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Standby Tab ───────────────────────────────────────────────── */}
      {tab === 'standby' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-surface-raised text-text-secondary hover:text-text-primary transition-colors">
                <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <h2 className="text-sm font-semibold text-text-primary min-w-[140px] text-center">
                {format(currentMonth, 'MMMM yyyy')}
              </h2>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-surface-raised text-text-secondary hover:text-text-primary transition-colors">
                <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            <Button size="sm" onClick={openAddModal}>+ Add Week</Button>
          </div>

          {weeksInMonth.length === 0 ? (
            <EmptyState
              icon={<svg className="size-8 text-text-muted" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75" /></svg>}
              title="No weeks this month"
            />
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-raised text-text-tertiary text-xs">
                    <th className="text-left px-4 py-2.5 font-medium">Week</th>
                    <th className="text-left px-4 py-2.5 font-medium">Date Range</th>
                    <th className="text-left px-4 py-2.5 font-medium">Weekday</th>
                    <th className="text-left px-4 py-2.5 font-medium">Weekend</th>
                    <th className="text-right px-4 py-2.5 font-medium w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {weeksInMonth.map(weekStart => {
                    const key = format(weekStart, 'yyyy-MM-dd')
                    const weekEnd = addDays(weekStart, 6)
                    const shift = standbyMap.get(key)
                    const weekNum = getISOWeek(weekStart)
                    return (
                      <tr key={key} className="hover:bg-surface-raised/50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-indigo-400">W{weekNum}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-text-primary text-xs">
                            {format(weekStart, 'd MMM')} – {format(weekEnd, 'd MMM')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {shift ? (
                            <span className="text-text-primary">{staffNames(shift.weekday_staff)}</span>
                          ) : (
                            <span className="text-text-muted italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {shift ? (
                            <span className="text-text-primary">{staffNames(shift.weekend_staff)}</span>
                          ) : (
                            <span className="text-text-muted italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {shift ? (
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEditModal(shift)} className="p-1.5 rounded hover:bg-surface-raised text-text-tertiary hover:text-indigo-400 transition-colors">
                                <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                              </button>
                              <button onClick={() => deleteStandby(shift.id)} className="p-1.5 rounded hover:bg-red-500/10 text-text-tertiary hover:text-red-400 transition-colors">
                                <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { resetForm(); setFormDate(key); setShowModal(true) }}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                              + Assign
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Replacement Leave Tab ─────────────────────────────────────── */}
      {tab === 'leave' && (
        <>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Select
                value={leaveFilterStaff}
                onChange={e => setLeaveFilterStaff(e.target.value)}
                className="!w-auto !py-1.5 !text-xs"
              >
                <option value="all">All Staff</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{toProperCase(a.display_name)}</option>
                ))}
              </Select>
              <Select
                value={leaveFilterMonth}
                onChange={e => setLeaveFilterMonth(e.target.value)}
                className="!w-auto !py-1.5 !text-xs"
              >
                <option value="all">All Months</option>
                {leaveMonthOptions.map(m => (
                  <option key={m} value={m}>{format(new Date(m + '-01'), 'MMM yyyy')}</option>
                ))}
              </Select>
            </div>
            <Button size="sm" onClick={openAddModal}>+ Add Leave</Button>
          </div>

          {filteredLeaves.length === 0 ? (
            <EmptyState
              icon={<svg className="size-8 text-text-muted" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75" /></svg>}
              title="No replacement leave entries"
            />
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-raised text-text-tertiary text-xs">
                    <th className="text-left px-4 py-2.5 font-medium">Staff</th>
                    <th className="text-left px-4 py-2.5 font-medium">Date</th>
                    <th className="text-left px-4 py-2.5 font-medium">Duration</th>
                    <th className="text-left px-4 py-2.5 font-medium">Notes</th>
                    <th className="text-right px-4 py-2.5 font-medium w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredLeaves.map(lv => (
                    <tr key={lv.id} className="hover:bg-surface-raised/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-text-primary font-medium">{toProperCase(lv.staff_name)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-text-primary">{format(new Date(lv.leave_date + 'T00:00:00'), 'dd/MM/yyyy')}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${
                          lv.duration === 0.5
                            ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-green-500/15 text-green-400'
                        }`}>
                          {lv.duration === 0.5 ? 'Half Day' : 'Full Day'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-text-secondary text-xs">{lv.notes || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEditModal(lv)} className="p-1.5 rounded hover:bg-surface-raised text-text-tertiary hover:text-indigo-400 transition-colors">
                            <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
                          </button>
                          <button onClick={() => deleteLeave(lv.id)} className="p-1.5 rounded hover:bg-red-500/10 text-text-tertiary hover:text-red-400 transition-colors">
                            <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Modals ────────────────────────────────────────────────────── */}

      {/* Saturday Modal */}
      <ModalDialog
        open={showModal && tab === 'saturday'}
        onClose={closeModal}
        title={editingItem ? 'Edit Saturday Shift' : 'Add Saturday Shift'}
        size="sm"
      >
        <div className="p-4 space-y-4">
          <div>
            <Label required>Date</Label>
            <Input
              type="date"
              value={formDate}
              onChange={e => setFormDate(e.target.value)}
            />
            {formDate && getDay(new Date(formDate + 'T00:00:00')) !== 6 && (
              <p className="text-xs text-red-400 mt-1">Please select a Saturday</p>
            )}
          </div>
          <div>
            <Label required>Staff</Label>
            <StaffCheckboxes selected={formStaff} onChange={setFormStaff} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={closeModal}>Cancel</Button>
            <Button size="sm" onClick={saveSaturday} loading={saving}>Save</Button>
          </div>
        </div>
      </ModalDialog>

      {/* Standby Modal */}
      <ModalDialog
        open={showModal && tab === 'standby'}
        onClose={closeModal}
        title={editingItem ? 'Edit Standby Week' : 'Add Standby Week'}
        size="sm"
      >
        <div className="p-4 space-y-4">
          <div>
            <Label required>Week Starting (Monday)</Label>
            <Input
              type="date"
              value={formDate}
              onChange={e => setFormDate(e.target.value)}
            />
            {formDate && getDay(new Date(formDate + 'T00:00:00')) !== 1 && (
              <p className="text-xs text-red-400 mt-1">Please select a Monday</p>
            )}
            {formDate && getDay(new Date(formDate + 'T00:00:00')) === 1 && (
              <p className="text-xs text-text-muted mt-1">
                Week: {format(new Date(formDate + 'T00:00:00'), 'd MMM')} – {format(addDays(new Date(formDate + 'T00:00:00'), 6), 'd MMM yyyy')}
              </p>
            )}
          </div>
          <div>
            <Label required>Weekday Standby</Label>
            <StaffCheckboxes selected={formWeekdayStaff} onChange={setFormWeekdayStaff} />
          </div>
          <div>
            <Label required>Weekend Standby</Label>
            <StaffCheckboxes selected={formWeekendStaff} onChange={setFormWeekendStaff} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={closeModal}>Cancel</Button>
            <Button size="sm" onClick={saveStandby} loading={saving}>Save</Button>
          </div>
        </div>
      </ModalDialog>

      {/* Replacement Leave Modal */}
      <ModalDialog
        open={showModal && tab === 'leave'}
        onClose={closeModal}
        title={editingItem ? 'Edit Replacement Leave' : 'Add Replacement Leave'}
        size="sm"
      >
        <div className="p-4 space-y-4">
          <div>
            <Label required>Staff</Label>
            <Select
              value={formStaffId}
              onChange={e => setFormStaffId(e.target.value)}
            >
              <option value="">Select staff...</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{toProperCase(a.display_name)}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label required>Date</Label>
            <Input
              type="date"
              value={formDate}
              onChange={e => setFormDate(e.target.value)}
            />
          </div>
          <div>
            <Label required>Duration</Label>
            <div className="flex gap-4 mt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="duration"
                  checked={formDuration === 1}
                  onChange={() => setFormDuration(1)}
                  className="text-indigo-500 focus:ring-indigo-500/50"
                />
                <span className="text-sm text-text-secondary">Full Day (1)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="duration"
                  checked={formDuration === 0.5}
                  onChange={() => setFormDuration(0.5)}
                  className="text-indigo-500 focus:ring-indigo-500/50"
                />
                <span className="text-sm text-text-secondary">Half Day (0.5)</span>
              </label>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Worked Saturday 7 Jun"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={closeModal}>Cancel</Button>
            <Button size="sm" onClick={saveLeave} loading={saving}>Save</Button>
          </div>
        </div>
      </ModalDialog>
    </div>
  )
}
