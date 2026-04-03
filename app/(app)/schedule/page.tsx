'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, addMonths, subMonths,
  isSameMonth, isToday,
} from 'date-fns'
import type { Schedule } from '@/lib/types'
import { SCHEDULE_TYPES, SCHEDULE_TYPE_COLORS } from '@/lib/constants'
import Button from '@/components/ui/Button'
import { Input, Label, Textarea } from '@/components/ui/Input'
import ClinicSearch from '@/components/ClinicSearch'
import type { Clinic } from '@/lib/types'
import { useToast } from '@/components/ui/Toast'

// WHY: Schedule page — monthly calendar view for appointment management.
// Replaces the team's Excel-based schedule tracker.
// Features: month navigation, colored chips by schedule_type, add/edit/complete schedules.

// Parse time strings like "8:00AM", "1:00PM", "2:30PM" into minutes for sorting
function parseTimeToMinutes(t: string): number {
  const match = t.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)$/i)
  if (!match) return 0
  let hours = parseInt(match[1])
  const mins = parseInt(match[2] || '0')
  const period = match[3].toUpperCase()
  if (period === 'PM' && hours !== 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0
  return hours * 60 + mins
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  scheduled: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  completed: { bg: 'bg-green-500/20', text: 'text-green-400' },
  cancelled: { bg: 'bg-zinc-500/20', text: 'text-zinc-400' },
  rescheduled: { bg: 'bg-violet-500/20', text: 'text-violet-400' },
  no_answer: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
}

export default function SchedulePage() {
  const supabase = createClient()
  const { toast } = useToast()

  // Current user
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [schedules, setSchedules] = useState<Schedule[]>([])

  // Filter — defaults to current user (set in init)
  const [filterAgent, setFilterAgent] = useState<string>('')
  const [filterReady, setFilterReady] = useState(false)
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])

  // Resolve agent_id → current display_name (avoids stale casing like "AMALI" vs "Amali")
  const agentDisplayName = (s: { agent_id?: string; agent_name: string }) =>
    agents.find(a => a.id === s.agent_id)?.name || s.agent_name

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [dayDetailDate, setDayDetailDate] = useState<string | null>(null) // yyyy-MM-dd for day expansion

  // Edit mode state (inside detail modal)
  const [isEditing, setIsEditing] = useState(false)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editType, setEditType] = useState<string | null>(null)
  const [editCustomType, setEditCustomType] = useState('')
  const [editMode, setEditMode] = useState<'Remote' | 'Onsite'>('Remote')
  const [editNotes, setEditNotes] = useState('')
  const [editPic, setEditPic] = useState('')
  const [editClinicWa, setEditClinicWa] = useState('')
  const [editClinic, setEditClinic] = useState<Clinic | null>(null)
  const [editClinicNameManual, setEditClinicNameManual] = useState('')
  const [editManualMode, setEditManualMode] = useState(false)
  const [editSaving, setEditSaving] = useState(false)

  // Clinic phone lookup (clinic_code → phone)
  const [clinicPhones, setClinicPhones] = useState<Record<string, string>>({})

  // Add form state
  const [formClinic, setFormClinic] = useState<Clinic | null>(null)
  const [formPic, setFormPic] = useState('')
  const [formClinicWa, setFormClinicWa] = useState('')
  const [formClinicName, setFormClinicName] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formTime, setFormTime] = useState('')
  const [formType, setFormType] = useState<string | null>(null)
  const [formCustomType, setFormCustomType] = useState('')
  const [formMode, setFormMode] = useState<'Remote' | 'Onsite'>('Remote')
  const [formNotes, setFormNotes] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  // Get user on mount — default filter to current user
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUserId(session.user.id)
        setFilterAgent(session.user.id) // default to "My Schedules"
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', session.user.id)
          .single()
        if (profile) setUserName(profile.display_name)
      } else {
        setFilterAgent('all') // fallback if no session
      }
      setFilterReady(true)
      // Load all agents for filter
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .order('display_name')
      if (profiles) setAgents(profiles.map((p: { id: string; display_name: string }) => ({ id: p.id, name: p.display_name })))
    }
    init()
  }, [])

  // Fetch schedules for current month (wait until filter is initialized)
  useEffect(() => {
    if (filterReady) fetchSchedules()
  }, [currentMonth, filterAgent, filterReady])

  const fetchSchedules = async () => {
    const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

    let query = supabase
      .from('schedules')
      .select('*')
      .gte('schedule_date', monthStart)
      .lte('schedule_date', monthEnd)
      .order('schedule_date')
      .order('schedule_time')

    if (filterAgent !== 'all') {
      query = query.eq('agent_id', filterAgent)
    }

    const { data } = await query
    const scheduleList = (data || []) as Schedule[]
    setSchedules(scheduleList)

    // Look up clinic phones from CRM
    const codeSet = new Set<string>()
    scheduleList.forEach(s => { if (s.clinic_code !== 'MANUAL') codeSet.add(s.clinic_code) })
    const codes = Array.from(codeSet)
    if (codes.length > 0) {
      const { data: clinics } = await supabase
        .from('clinics')
        .select('clinic_code, clinic_phone')
        .in('clinic_code', codes)
      if (clinics) {
        const phoneMap: Record<string, string> = {}
        clinics.forEach((c: { clinic_code: string; clinic_phone: string | null }) => {
          if (c.clinic_phone) phoneMap[c.clinic_code] = c.clinic_phone
        })
        setClinicPhones(phoneMap)
      }
    }
  }

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    // Start from Monday
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentMonth])

  // Group schedules by date, sorted by time within each day
  const schedulesByDate = useMemo(() => {
    const map: Record<string, Schedule[]> = {}
    schedules.forEach(s => {
      const key = s.schedule_date
      if (!map[key]) map[key] = []
      map[key].push(s)
    })
    // Sort each day's schedules by actual time
    Object.values(map).forEach(dayList => {
      dayList.sort((a, b) => parseTimeToMinutes(a.schedule_time) - parseTimeToMinutes(b.schedule_time))
    })
    return map
  }, [schedules])

  // Month navigation
  const goToPrev = () => setCurrentMonth(subMonths(currentMonth, 1))
  const goToNext = () => setCurrentMonth(addMonths(currentMonth, 1))
  const goToToday = () => setCurrentMonth(new Date())

  // Open detail modal
  const handleChipClick = (schedule: Schedule) => {
    setSelectedSchedule(schedule)
    setShowDetailModal(true)
  }

  // Ensure schedule has a linked ticket — create one if missing
  const ensureTicket = async (s: Schedule): Promise<string | null> => {
    if (s.source_ticket_id) return s.source_ticket_id
    // Auto-create ticket for schedules that don't have one (e.g. seeded data)
    const typeLabel = s.schedule_type === 'Others' && s.custom_type ? s.custom_type : s.schedule_type
    const { data: ticket } = await supabase.from('tickets').insert({
      record_type: 'call',
      clinic_code: s.clinic_code,
      clinic_name: s.clinic_name,
      pic: s.pic || null,
      issue_type: 'Schedule',
      issue: `Schedule ${typeLabel}: ${s.clinic_name} on ${s.schedule_date} at ${s.schedule_time}`,
      my_response: `${s.mode || 'Remote'} ${typeLabel} scheduled.`,
      status: 'Resolved',
      created_by: userId,
      created_by_name: userName,
      last_updated_by: userId,
      last_updated_by_name: userName,
    }).select().single()
    if (ticket) {
      await supabase.from('schedules').update({ source_ticket_id: ticket.id }).eq('id', s.id)
      return ticket.id
    }
    return null
  }

  // Add timeline entry to linked ticket
  const addTimelineEntry = async (ticketId: string, notes: string) => {
    await supabase.from('timeline_entries').insert({
      ticket_id: ticketId,
      entry_date: new Date().toISOString().split('T')[0],
      channel: 'Internal',
      notes: `[Schedule] ${notes}`,
      added_by: userId,
      added_by_name: userName,
    })
  }

  // Status update
  const handleStatusChange = async (id: string, newStatus: string) => {
    await supabase.from('schedules').update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    // Log timeline entry
    if (selectedSchedule) {
      const ticketId = await ensureTicket(selectedSchedule)
      if (ticketId) {
        const label = newStatus === 'completed' ? 'Completed' : newStatus === 'cancelled' ? 'Cancelled' : newStatus === 'scheduled' ? 'Reopened' : newStatus
        await addTimelineEntry(ticketId, `${label}: ${selectedSchedule.clinic_name}`)
        if (newStatus === 'completed') {
          await supabase.from('tickets').update({ status: 'Resolved', updated_at: new Date().toISOString() }).eq('id', ticketId)
        }
      }
    }
    fetchSchedules()
    setShowDetailModal(false)
    toast(`Schedule ${newStatus}`)
  }

  // Reschedule — mark old as rescheduled, open add form pre-filled
  const handleReschedule = async (s: Schedule) => {
    await supabase.from('schedules').update({
      status: 'rescheduled',
      updated_at: new Date().toISOString(),
    }).eq('id', s.id)
    // Log timeline entry
    const ticketId = await ensureTicket(s)
    if (ticketId) {
      await addTimelineEntry(ticketId, `Rescheduled: ${s.clinic_name} — was ${s.schedule_date} at ${s.schedule_time}`)
    }
    // Pre-fill add form with all details from old schedule
    if (s.clinic_code && s.clinic_code !== 'MANUAL') {
      const { data } = await supabase.from('clinics').select('*').eq('clinic_code', s.clinic_code).single()
      setFormClinic(data as Clinic | null)
      setFormClinicName(s.clinic_name)
    } else {
      setFormClinic(null)
      setFormClinicName(s.clinic_name)
    }
    setFormPic(s.pic || '')
    setFormClinicWa(s.clinic_wa || '')
    setFormDate('')
    setFormTime(s.schedule_time)
    setFormType(s.schedule_type)
    setFormCustomType(s.custom_type || '')
    setFormMode((s.mode as 'Remote' | 'Onsite') || 'Remote')
    setFormNotes(s.notes || '')
    setShowDetailModal(false)
    setShowAddModal(true)
    fetchSchedules()
    toast('Old schedule marked as rescheduled — pick a new date/time')
  }

  // No answer — set status + append timestamped note
  const handleNoAnswer = async (s: Schedule) => {
    const timestamp = new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true })
    const noAnswerNote = `No answer at ${timestamp}`
    const updatedNotes = s.notes ? `${s.notes}\n${noAnswerNote}` : noAnswerNote
    await supabase.from('schedules').update({
      status: 'no_answer',
      notes: updatedNotes,
      updated_at: new Date().toISOString(),
    }).eq('id', s.id)
    // Log timeline entry
    const ticketId = await ensureTicket(s)
    if (ticketId) {
      await addTimelineEntry(ticketId, `No answer: ${s.clinic_name} at ${timestamp}`)
    }
    fetchSchedules()
    setShowDetailModal(false)
    toast('Marked as no answer')
  }

  // Delete schedule
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule entry?')) return
    await supabase.from('schedules').delete().eq('id', id)
    fetchSchedules()
    setShowDetailModal(false)
    toast('Schedule deleted')
  }

  // Start editing a schedule
  const startEditing = async (s: Schedule) => {
    setEditDate(s.schedule_date)
    setEditTime(s.schedule_time)
    setEditType(s.schedule_type)
    setEditCustomType(s.custom_type || '')
    setEditMode((s.mode as 'Remote' | 'Onsite') || 'Remote')
    setEditNotes(s.notes || '')
    setEditPic(s.pic || '')
    setEditClinicWa(s.clinic_wa || '')
    setEditClinicNameManual(s.clinic_name)
    // Try to look up clinic from CRM
    if (s.clinic_code && s.clinic_code !== 'MANUAL') {
      const { data } = await supabase.from('clinics').select('*').eq('clinic_code', s.clinic_code).single()
      setEditClinic(data as Clinic | null)
      setEditManualMode(false)
    } else {
      setEditClinic(null)
      setEditManualMode(true)
    }
    setIsEditing(true)
  }

  // Save edited schedule
  const handleSaveEdit = async () => {
    if (!selectedSchedule) return
    if (!editDate || !editTime || !editType) {
      toast('Date, time, and type are required', 'error')
      return
    }

    setEditSaving(true)
    const duration = SCHEDULE_TYPES.find(t => t.value === editType)?.duration || ''

    const { error } = await supabase.from('schedules').update({
      clinic_code: editClinic ? editClinic.clinic_code : selectedSchedule.clinic_code,
      clinic_name: editClinic ? editClinic.clinic_name : editClinicNameManual,
      schedule_date: editDate,
      schedule_time: editTime,
      schedule_type: editType,
      custom_type: editType === 'Others' ? editCustomType || null : null,
      duration_estimate: duration || null,
      mode: editMode,
      notes: editNotes || null,
      pic: editPic || null,
      clinic_wa: editClinicWa || null,
      updated_at: new Date().toISOString(),
    }).eq('id', selectedSchedule.id)

    if (error) {
      toast('Failed to save: ' + error.message, 'error')
    } else {
      toast('Schedule updated')
      setIsEditing(false)
      setShowDetailModal(false)
      fetchSchedules()
    }
    setEditSaving(false)
  }

  // Reset add form
  const resetForm = () => {
    setFormClinic(null)
    setFormClinicName('')
    setFormPic('')
    setFormClinicWa('')
    setFormDate('')
    setFormTime('')
    setFormType(null)
    setFormCustomType('')
    setFormMode('Remote')
    setFormNotes('')
  }

  // Add schedule
  const handleAddSchedule = async () => {
    if (!formDate || !formTime || !formType) {
      toast('Date, time, and type are required', 'error')
      return
    }
    if (!formClinic && !formClinicName) {
      toast('Select a clinic or enter clinic name', 'error')
      return
    }

    setFormSaving(true)
    const duration = SCHEDULE_TYPES.find(t => t.value === formType)?.duration || ''
    const clinicCode = formClinic?.clinic_code || 'MANUAL'
    const clinicName = formClinic?.clinic_name || formClinicName
    const typeLabel = formType === 'Others' && formCustomType ? formCustomType : formType

    // 1. Create a ticket so it shows in My Log / History
    const { data: ticket } = await supabase.from('tickets').insert({
      record_type: 'call',
      clinic_code: clinicCode,
      clinic_name: clinicName,
      clinic_phone: formClinic?.clinic_phone || null,
      mtn_expiry: formClinic?.mtn_expiry || null,
      renewal_status: formClinic?.renewal_status || null,
      product_type: formClinic?.product_type || null,
      city: formClinic?.city || null,
      state: formClinic?.state || null,
      caller_tel: null,
      pic: formPic || null,
      issue_type: 'Schedule',
      issue: `Schedule ${typeLabel}: ${clinicName} on ${formDate} at ${formTime}`,
      my_response: `${formMode} ${typeLabel} scheduled. ${duration ? 'Duration: ' + duration + '.' : ''}`,
      status: 'Resolved',
      created_by: userId,
      created_by_name: userName,
      last_updated_by: userId,
      last_updated_by_name: userName,
    }).select().single()

    // 2. Create the schedule, linked to the ticket
    const { error } = await supabase.from('schedules').insert({
      clinic_code: clinicCode,
      clinic_name: clinicName,
      pic: formPic || null,
      schedule_date: formDate,
      schedule_time: formTime,
      schedule_type: formType,
      custom_type: formType === 'Others' ? formCustomType || null : null,
      duration_estimate: duration || null,
      mode: formMode,
      agent_name: userName,
      agent_id: userId,
      notes: formNotes || null,
      clinic_wa: formClinicWa || null,
      source_ticket_id: ticket?.id || null,
    })

    if (error) {
      toast('Failed to save: ' + error.message, 'error')
    } else {
      toast('Schedule added')
      resetForm()
      setShowAddModal(false)
      fetchSchedules()
    }
    setFormSaving(false)
  }

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="pb-20 md:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-text-primary">Schedule</h1>
        <div className="flex items-center gap-2">
          {/* Agent filter */}
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="px-3 py-1.5 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="all">All Staff</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <Button size="sm" onClick={() => { resetForm(); setShowAddModal(true) }}>
            + Add Schedule
          </Button>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4 bg-surface border border-border rounded-lg px-4 py-2">
        <button onClick={goToPrev} className="p-1.5 text-text-secondary hover:text-text-primary rounded-md hover:bg-zinc-800 transition-colors">
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-text-primary">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <button
            onClick={goToToday}
            className="px-2 py-0.5 text-xs text-accent border border-accent/30 rounded-md hover:bg-accent/10 transition-colors"
          >
            Today
          </button>
        </div>
        <button onClick={goToNext} className="p-1.5 text-text-secondary hover:text-text-primary rounded-md hover:bg-zinc-800 transition-colors">
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Calendar grid */}
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-surface-raised">
          {weekDays.map(day => (
            <div key={day} className="px-2 py-2 text-center text-xs font-medium text-text-tertiary border-b border-border">
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, i) => {
            const dateKey = format(day, 'yyyy-MM-dd')
            const daySchedules = schedulesByDate[dateKey] || []
            const inMonth = isSameMonth(day, currentMonth)
            const today = isToday(day)

            return (
              <div
                key={i}
                onClick={() => inMonth && daySchedules.length > 0 && setDayDetailDate(dateKey)}
                className={`min-h-[120px] sm:min-h-[160px] border-b border-r border-border p-1.5 ${
                  !inMonth ? 'bg-zinc-900/30' : 'bg-background'
                } ${today ? 'ring-1 ring-inset ring-accent/40' : ''} ${
                  inMonth && daySchedules.length > 0 ? 'cursor-pointer hover:bg-surface-raised/50 transition-colors' : ''
                }`}
              >
                {/* Date number */}
                <div className={`text-xs font-medium mb-0.5 px-1 ${
                  today ? 'text-accent' : inMonth ? 'text-text-secondary' : 'text-text-muted'
                }`}>
                  {format(day, 'd')}
                  {daySchedules.length > 0 && (
                    <span className="ml-1 text-text-muted">({daySchedules.length})</span>
                  )}
                </div>

                {/* Schedule chips — show all, no truncation */}
                <div className="space-y-0.5">
                  {daySchedules.map(s => {
                    const colors = SCHEDULE_TYPE_COLORS[s.schedule_type] || { bg: 'bg-zinc-500/20', text: 'text-zinc-400' }
                    const isCancelled = s.status === 'cancelled'
                    const isCompleted = s.status === 'completed'
                    const isRescheduled = s.status === 'rescheduled'
                    const isNoAnswer = s.status === 'no_answer'
                    const isStruck = isCancelled || isCompleted || isRescheduled
                    const now = new Date()
                    const isPastTime = today && s.status === 'scheduled' && parseTimeToMinutes(s.schedule_time) < (now.getHours() * 60 + now.getMinutes())
                    return (
                      <div
                        key={s.id}
                        className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] sm:text-xs ${colors.bg} ${colors.text} ${
                          isStruck ? 'line-through' : ''
                        } ${isCancelled || isRescheduled ? 'opacity-50' : ''} ${isCompleted ? 'opacity-70' : ''}`}
                      >
                        {isPastTime && <span className="text-amber-400 mr-0.5">!</span>}
                        {isNoAnswer && <span className="text-orange-400 mr-0.5">!</span>}
                        <span className="hidden sm:inline">{s.schedule_time} </span>
                        {s.clinic_name}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 mt-3 text-xs text-text-tertiary flex-wrap">
        <span>{schedules.filter(s => s.status === 'scheduled').length} scheduled</span>
        <span>{schedules.filter(s => s.status === 'completed').length} completed</span>
        <span>{schedules.filter(s => s.status === 'no_answer').length} no answer</span>
        <span>{schedules.filter(s => s.status === 'rescheduled').length} rescheduled</span>
        <span>{schedules.filter(s => s.status === 'cancelled').length} cancelled</span>
        <span className="ml-auto">{schedules.length} total this month</span>
      </div>

      {/* ===== Day Detail Modal ===== */}
      {dayDetailDate && (schedulesByDate[dayDetailDate] || []).length > 0 && (() => {
        const dayEntries = schedulesByDate[dayDetailDate] || []
        const [y, m, d] = dayDetailDate.split('-')
        const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
        return (
          <>
            <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setDayDetailDate(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <div className="bg-surface border border-border rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col pointer-events-auto shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
                  <div>
                    <h3 className="font-semibold text-text-primary">{format(dateObj, 'EEEE, d MMMM yyyy')}</h3>
                    <p className="text-xs text-text-tertiary mt-0.5">{dayEntries.length} schedule{dayEntries.length !== 1 ? 's' : ''}</p>
                  </div>
                  <button onClick={() => setDayDetailDate(null)} className="text-text-tertiary hover:text-text-primary p-2 -mr-2 transition-colors">
                    <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Schedule list */}
                <div className="flex-1 overflow-y-auto divide-y divide-border">
                  {dayEntries.map((s) => {
                    const colors = SCHEDULE_TYPE_COLORS[s.schedule_type] || { bg: 'bg-zinc-500/20', text: 'text-zinc-400' }
                    const isRemote = s.mode === 'Remote'
                    const isCancelled = s.status === 'cancelled'
                    const isCompleted = s.status === 'completed'
                    const isRescheduled = s.status === 'rescheduled'
                    const isNoAnswer = s.status === 'no_answer'
                    const isStruck = isCancelled || isCompleted || isRescheduled
                    const now = new Date()
                    const isDayToday = isToday(dateObj)
                    const isPastTime = isDayToday && s.status === 'scheduled' && parseTimeToMinutes(s.schedule_time) < (now.getHours() * 60 + now.getMinutes())
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleChipClick(s)}
                        className={`w-full text-left px-5 py-3 hover:bg-surface-raised/60 transition-colors ${
                          isCancelled || isRescheduled ? 'opacity-40' : ''
                        } ${isCompleted ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Time + Clinic */}
                            <div className="flex items-center gap-2">
                              {isPastTime && (
                                <svg className="size-3.5 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                </svg>
                              )}
                              {isNoAnswer && (
                                <svg className="size-3.5 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 18.364a7 7 0 010-12.728M8.464 15.536a5 5 0 010-7.072M3 12a9 9 0 0118 0M12 12h.01" />
                                </svg>
                              )}
                              <span className="font-mono text-xs flex-shrink-0 text-accent">{s.schedule_time}</span>
                              <span className={`text-sm text-text-primary font-medium ${isStruck ? 'line-through' : ''}`}>{s.clinic_name}</span>
                            </div>
                            {/* PIC + Phone + WA */}
                            {(s.pic || clinicPhones[s.clinic_code] || s.clinic_wa) && (
                              <div className="text-xs text-text-tertiary mt-0.5 ml-[4.5rem]">
                                {s.pic}{(s.pic && (clinicPhones[s.clinic_code] || s.clinic_wa)) ? ' · ' : ''}{clinicPhones[s.clinic_code] || ''}{clinicPhones[s.clinic_code] && s.clinic_wa ? ' · ' : ''}{s.clinic_wa ? `WhatsApp: ${s.clinic_wa}` : ''}
                              </div>
                            )}
                            {/* Agent + Mode + Duration */}
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-xs text-text-secondary">{agentDisplayName(s)}</span>
                              <span className="text-zinc-600">·</span>
                              <span className={`text-xs ${isRemote ? 'text-purple-400' : 'text-emerald-400'}`}>
                                {isRemote ? 'Remote' : 'Onsite'}
                              </span>
                              {s.duration_estimate && (
                                <>
                                  <span className="text-zinc-600">·</span>
                                  <span className="text-xs text-text-tertiary">{s.duration_estimate}</span>
                                </>
                              )}
                            </div>
                          </div>
                          {/* Type badge */}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${colors.bg} ${colors.text}`}>
                            {s.schedule_type}{s.custom_type ? `: ${s.custom_type}` : ''}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* ===== Detail Modal ===== */}
      {showDetailModal && selectedSchedule && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[60]" onClick={() => { setShowDetailModal(false); setIsEditing(false) }} />
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-2 sm:p-4 pointer-events-none">
            <div className="bg-surface border border-border rounded-xl w-full max-w-md max-h-[90vh] flex flex-col pointer-events-auto shadow-xl">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
                <h3 className="font-semibold text-text-primary">{isEditing ? 'Edit Schedule' : 'Schedule Detail'}</h3>
                <button onClick={() => { setShowDetailModal(false); setIsEditing(false) }} className="text-text-tertiary hover:text-text-primary p-2 -mr-2 transition-colors">
                  <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content — View or Edit mode */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isEditing ? (
                  /* ===== EDIT MODE ===== */
                  <div className="space-y-4">
                    {/* Clinic */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-text-secondary">Clinic</span>
                        <button type="button" onClick={() => { setEditClinic(null); setEditManualMode(!editManualMode) }} className="text-xs text-text-tertiary hover:text-text-primary">
                          {editManualMode ? 'Search CRM' : 'Type manually'}
                        </button>
                      </div>
                      {editManualMode ? (
                        <Input
                          type="text"
                          value={editClinicNameManual}
                          onChange={(e) => setEditClinicNameManual(e.target.value)}
                          placeholder="Clinic name"
                        />
                      ) : (
                        <>
                          <ClinicSearch hideLabel onSelect={(c) => { setEditClinic(c); setEditClinicNameManual(c.clinic_name) }} value={editClinic} />
                          {editClinic && (
                            <p className="text-xs text-text-tertiary mt-1">{editClinic.clinic_code} — {editClinic.clinic_name}</p>
                          )}
                        </>
                      )}
                    </div>

                    {/* PIC + WA */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>PIC</Label>
                        <Input
                          type="text"
                          value={editPic}
                          onChange={(e) => setEditPic(e.target.value)}
                          placeholder="Person in charge"
                        />
                      </div>
                      <div>
                        <Label>Clinic WhatsApp</Label>
                        <Input
                          type="text"
                          value={editClinicWa}
                          onChange={(e) => setEditClinicWa(e.target.value)}
                          placeholder="e.g. 012-3456789"
                        />
                      </div>
                    </div>

                    {/* Date + Time */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label required>Date</Label>
                        <Input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label required>Time</Label>
                        <Input
                          type="text"
                          value={editTime}
                          onChange={(e) => setEditTime(e.target.value)}
                          placeholder="e.g. 10AM, 2:30PM"
                        />
                      </div>
                    </div>

                    {/* Schedule Type */}
                    <div>
                      <Label required>Type</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {SCHEDULE_TYPES.map((t) => {
                          const colors = SCHEDULE_TYPE_COLORS[t.value] || { bg: 'bg-zinc-500/20', text: 'text-zinc-400' }
                          return (
                            <button
                              key={t.value}
                              type="button"
                              onClick={() => setEditType(editType === t.value ? null : t.value)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                editType === t.value
                                  ? `${colors.bg} ${colors.text} border-current/30`
                                  : 'bg-surface border-border text-text-secondary hover:text-text-primary'
                              }`}
                            >
                              {t.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Custom type */}
                    {editType === 'Others' && (
                      <div>
                        <Label>Custom Type</Label>
                        <Input
                          type="text"
                          value={editCustomType}
                          onChange={(e) => setEditCustomType(e.target.value)}
                          placeholder="Describe the schedule type..."
                        />
                      </div>
                    )}

                    {/* Mode */}
                    <div>
                      <Label>Mode</Label>
                      <div className="flex gap-2">
                        {(['Onsite', 'Remote'] as const).map(m => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setEditMode(m)}
                            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                              editMode === m
                                ? m === 'Onsite'
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                  : 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                                : 'bg-surface border-border text-text-secondary hover:text-text-primary'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={2}
                        placeholder="Additional notes..."
                      />
                    </div>
                  </div>
                ) : (
                  /* ===== VIEW MODE ===== */
                  <>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const colors = SCHEDULE_TYPE_COLORS[selectedSchedule.schedule_type] || { bg: 'bg-zinc-500/20', text: 'text-zinc-400' }
                        return <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                          {selectedSchedule.schedule_type}{selectedSchedule.custom_type ? ` — ${selectedSchedule.custom_type}` : ''}
                        </span>
                      })()}
                      {(() => {
                        const st = STATUS_STYLES[selectedSchedule.status] || STATUS_STYLES.scheduled
                        return <span className={`text-xs px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>
                          {selectedSchedule.status === 'no_answer' ? 'no answer' : selectedSchedule.status}
                        </span>
                      })()}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-text-tertiary text-xs">Clinic</span>
                        <p className="text-text-primary">{selectedSchedule.clinic_name}</p>
                      </div>
                      <div>
                        <span className="text-text-tertiary text-xs">Code</span>
                        <p className="text-text-primary font-mono">{selectedSchedule.clinic_code}</p>
                      </div>
                      <div>
                        <span className="text-text-tertiary text-xs">Phone</span>
                        <p className="text-text-primary">{clinicPhones[selectedSchedule.clinic_code] || '-'}</p>
                      </div>
                      <div>
                        <span className="text-text-tertiary text-xs">Clinic WhatsApp</span>
                        <p className="text-text-primary">{selectedSchedule.clinic_wa || '-'}</p>
                      </div>
                      <div>
                        <span className="text-text-tertiary text-xs">Date</span>
                        <p className="text-text-primary">{selectedSchedule.schedule_date.split('-').reverse().join('/')}</p>
                      </div>
                      <div>
                        <span className="text-text-tertiary text-xs">Time</span>
                        <p className="text-text-primary">{selectedSchedule.schedule_time}</p>
                      </div>
                      <div>
                        <span className="text-text-tertiary text-xs">Duration</span>
                        <p className="text-text-primary">{selectedSchedule.duration_estimate || '-'}</p>
                      </div>
                      <div>
                        <span className="text-text-tertiary text-xs">Staff</span>
                        <p className="text-text-primary">{agentDisplayName(selectedSchedule)}</p>
                      </div>
                      <div>
                        <span className="text-text-tertiary text-xs">Mode</span>
                        <p className={`font-medium ${selectedSchedule.mode === 'Remote' ? 'text-purple-400' : 'text-emerald-400'}`}>
                          {selectedSchedule.mode || 'Onsite'}
                        </p>
                      </div>
                      {selectedSchedule.pic && (
                        <div>
                          <span className="text-text-tertiary text-xs">PIC</span>
                          <p className="text-text-primary">{selectedSchedule.pic}</p>
                        </div>
                      )}
                    </div>
                    {selectedSchedule.notes && (
                      <div>
                        <span className="text-text-tertiary text-xs">Notes</span>
                        <p className="text-sm text-text-primary">{selectedSchedule.notes}</p>
                      </div>
                    )}
                    {selectedSchedule.source_ticket_id && (
                      <a
                        href={`/tickets/${selectedSchedule.source_ticket_id}`}
                        className="text-xs text-accent hover:underline"
                      >
                        View source call log
                      </a>
                    )}
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="px-4 py-3 border-t border-border flex gap-2 flex-shrink-0">
                {isEditing ? (
                  <>
                    <Button size="sm" onClick={handleSaveEdit} loading={editSaving} className="flex-1">
                      Save Changes
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => startEditing(selectedSchedule)} className="flex-1">
                      <svg className="size-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </Button>
                    {selectedSchedule.status === 'scheduled' && (
                      <>
                        <Button size="sm" variant="success" onClick={() => handleStatusChange(selectedSchedule.id, 'completed')} className="flex-1">
                          Complete
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => handleNoAnswer(selectedSchedule)}>
                          No Answer
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => handleReschedule(selectedSchedule)}>
                          Reschedule
                        </Button>
                      </>
                    )}
                    {selectedSchedule.status === 'no_answer' && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => handleNoAnswer(selectedSchedule)} className="flex-1">
                          No Answer Again
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => handleReschedule(selectedSchedule)}>
                          Reschedule
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => handleStatusChange(selectedSchedule.id, 'scheduled')}>
                          Retry
                        </Button>
                      </>
                    )}
                    {selectedSchedule.status === 'cancelled' && (
                      <Button size="sm" variant="secondary" onClick={() => handleStatusChange(selectedSchedule.id, 'scheduled')} className="flex-1">
                        Reopen
                      </Button>
                    )}
                    {selectedSchedule.status === 'rescheduled' && (
                      <Button size="sm" variant="secondary" onClick={() => handleStatusChange(selectedSchedule.id, 'scheduled')} className="flex-1">
                        Reopen
                      </Button>
                    )}
                    {selectedSchedule.status === 'completed' && (
                      <Button size="sm" variant="secondary" onClick={() => handleStatusChange(selectedSchedule.id, 'scheduled')} className="flex-1">
                        Reopen
                      </Button>
                    )}
                    <Button size="sm" variant="danger" onClick={() => handleDelete(selectedSchedule.id)}>
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== Add Schedule Modal ===== */}
      {showAddModal && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setShowAddModal(false)} />
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 pointer-events-none">
            <div className="bg-surface border border-border rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col pointer-events-auto">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
                <h3 className="font-semibold text-text-primary">Add Schedule</h3>
                <button onClick={() => setShowAddModal(false)} className="text-text-tertiary hover:text-text-primary p-2 -mr-2 transition-colors">
                  <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Form */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Clinic */}
                <div>
                  <ClinicSearch onSelect={(clinic) => { setFormClinic(clinic); setFormClinicName(clinic.clinic_name) }} value={formClinic} />
                  {formClinic && (
                    <p className="text-xs text-text-tertiary mt-1">{formClinic.clinic_code} — {formClinic.clinic_name}</p>
                  )}
                  {!formClinic && formClinicName && (
                    <div className="flex items-center justify-between mt-1 px-1">
                      <p className="text-xs text-text-secondary">{formClinicName}</p>
                      <button type="button" onClick={() => setFormClinicName('')} className="text-xs text-text-tertiary hover:text-text-primary">Clear</button>
                    </div>
                  )}
                </div>

                {/* PIC + WA */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>PIC</Label>
                    <Input
                      type="text"
                      value={formPic}
                      onChange={(e) => setFormPic(e.target.value)}
                      placeholder="Person in charge"
                    />
                  </div>
                  <div>
                    <Label>Clinic WhatsApp</Label>
                    <Input
                      type="text"
                      value={formClinicWa}
                      onChange={(e) => setFormClinicWa(e.target.value)}
                      placeholder="e.g. 012-3456789"
                    />
                  </div>
                </div>

                {/* Date + Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label required>Date</Label>
                    <Input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label required>Time</Label>
                    <Input
                      type="text"
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                      placeholder="e.g. 10AM, 2:30PM"
                    />
                  </div>
                </div>

                {/* Schedule Type */}
                <div>
                  <Label required>Type</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {SCHEDULE_TYPES.map((t) => {
                      const colors = SCHEDULE_TYPE_COLORS[t.value] || { bg: 'bg-zinc-500/20', text: 'text-zinc-400' }
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setFormType(formType === t.value ? null : t.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            formType === t.value
                              ? `${colors.bg} ${colors.text} border-current/30`
                              : 'bg-surface border-border text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          {t.label}
                          {t.duration && <span className="ml-1 opacity-60">({t.duration})</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Custom type */}
                {formType === 'Others' && (
                  <div>
                    <Label>Custom Type</Label>
                    <Input
                      type="text"
                      value={formCustomType}
                      onChange={(e) => setFormCustomType(e.target.value)}
                      placeholder="Describe the schedule type..."
                    />
                  </div>
                )}

                {/* Mode: Remote / Onsite */}
                <div>
                  <Label>Mode</Label>
                  <div className="flex gap-2">
                    {(['Onsite', 'Remote'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setFormMode(m)}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          formMode === m
                            ? m === 'Onsite'
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                            : 'bg-surface border-border text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    rows={2}
                    placeholder="Additional notes..."
                  />
                </div>
              </div>

              {/* Submit */}
              <div className="px-4 py-3 border-t border-border flex-shrink-0">
                <Button onClick={handleAddSchedule} loading={formSaving} size="md" className="w-full">
                  Save Schedule
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
