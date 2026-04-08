'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, addMonths, subMonths,
  isSameMonth, isToday,
} from 'date-fns'
import type { Schedule } from '@/lib/types'
import { SCHEDULE_TYPES, SCHEDULE_TYPE_COLORS, formatWorkDuration } from '@/lib/constants'
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
  const match = t.match(/^(\d{1,2})[:.]?(\d{2})?\s*(AM|PM)$/i)
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
  in_progress: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  completed: { bg: 'bg-green-500/20', text: 'text-green-400' },
  cancelled: { bg: 'bg-zinc-500/20', text: 'text-zinc-400' },
  rescheduled: { bg: 'bg-red-500/20', text: 'text-red-400' },
  no_answer: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
}

export default function SchedulePage() {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()

  // Current user
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [schedules, setSchedules] = useState<Schedule[]>([])

  // Filter — defaults to current user (set in init)
  const [filterAgent, setFilterAgent] = useState<string>('')
  const [filterMode, setFilterMode] = useState<'agent' | 'pic'>('agent')
  const [filterPic, setFilterPic] = useState<string>('all')
  const [filterReady, setFilterReady] = useState(false)
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])

  // Resolve agent_id → current display_name (avoids stale casing like "AMALI" vs "Amali")
  const agentDisplayName = (s: { agent_id?: string; agent_name: string }) =>
    agents.find(a => a.id === s.agent_id)?.name || s.agent_name

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showWorkPanel, setShowWorkPanel] = useState(false)
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
  const [editPicSupport, setEditPicSupport] = useState('')
  const [editClinic, setEditClinic] = useState<Clinic | null>(null)
  const [editClinicNameManual, setEditClinicNameManual] = useState('')
  const [editManualMode, setEditManualMode] = useState(false)
  const [editSaving, setEditSaving] = useState(false)

  // Work Panel state — full clinic details when in_progress
  const [workClinic, setWorkClinic] = useState<Clinic | null>(null)
  const [workNotes, setWorkNotes] = useState('')
  const workNotesRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [elapsedMinutes, setElapsedMinutes] = useState(0)

  // Clinic phone lookup (clinic_code → phone)
  const [clinicPhones, setClinicPhones] = useState<Record<string, string>>({})

  // Reschedule reason modal state
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState<Schedule | null>(null)
  const [rescheduleReason, setRescheduleReason] = useState('')
  const [rescheduleCustomReason, setRescheduleCustomReason] = useState('')

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
  const [formPicSupport, setFormPicSupport] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  // Get user on mount
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
  }, [currentMonth, filterPic, filterReady])

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

    if (filterPic !== 'all') {
      query = query.eq('pic_support', filterPic)
    }

    const { data } = await query
    const scheduleList = (data || []) as Schedule[]
    setSchedules(scheduleList)

    // Auto-resume: if current user has an in_progress schedule, open its work panel
    if (!showDetailModal && userId) {
      const activeWork = scheduleList.find(s => s.status === 'in_progress' && s.agent_id === userId)
      if (activeWork) {
        setSelectedSchedule(activeWork)
        setShowDetailModal(true)
        setShowWorkPanel(true)
        setWorkNotes(activeWork.notes || '')
        if (activeWork.clinic_code && activeWork.clinic_code !== 'MANUAL') {
          const { data: clinic } = await supabase.from('clinics').select('*').eq('clinic_code', activeWork.clinic_code).single()
          setWorkClinic(clinic as Clinic | null)
        }
      }
    }

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

  // Click on a date cell — open day detail if has schedules, otherwise open add form pre-filled
  const handleDateClick = (dateKey: string) => {
    const daySchedules = schedulesByDate[dateKey] || []
    if (daySchedules.length > 0) {
      setDayDetailDate(dateKey)
    } else {
      resetForm()
      setFormDate(dateKey)
      setShowAddModal(true)
    }
  }

  // Open detail modal — if in_progress, also fetch clinic details for Work Panel
  const handleChipClick = async (schedule: Schedule) => {
    setSelectedSchedule(schedule)
    setShowDetailModal(true)
    setShowWorkPanel(schedule.status === 'in_progress')
    if (schedule.status === 'in_progress') {
      setWorkNotes(schedule.notes || '')
      if (schedule.clinic_code && schedule.clinic_code !== 'MANUAL') {
        const { data } = await supabase.from('clinics').select('*').eq('clinic_code', schedule.clinic_code).single()
        setWorkClinic(data as Clinic | null)
      } else {
        setWorkClinic(null)
      }
    }
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
      issue: `Schedule ${typeLabel}: ${s.clinic_name} on ${s.schedule_date.split('-').reverse().join('-')} at ${s.schedule_time}`,
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
    const now = new Date().toISOString()
    // Calculate actual duration if completing from in_progress
    const updatePayload: Record<string, unknown> = { status: newStatus, updated_at: now }
    if (newStatus === 'completed' && selectedSchedule?.started_at) {
      updatePayload.completed_at = now
      updatePayload.actual_duration_minutes = Math.round(
        (new Date(now).getTime() - new Date(selectedSchedule.started_at).getTime()) / 60000
      )
    }
    const { error } = await supabase.from('schedules').update(updatePayload).eq('id', id)
    if (error) {
      // Fallback without time tracking columns
      await supabase.from('schedules').update({ status: newStatus, updated_at: now }).eq('id', id)
    }
    // Log timeline entry
    if (selectedSchedule) {
      const ticketId = await ensureTicket(selectedSchedule)
      if (ticketId) {
        const label = newStatus === 'completed' ? 'Completed' : newStatus === 'cancelled' ? 'Cancelled' : newStatus === 'scheduled' ? 'Reopened' : newStatus === 'in_progress' ? 'Started' : newStatus
        await addTimelineEntry(ticketId, `${label}: ${selectedSchedule.clinic_name}`)
        if (newStatus === 'completed') {
          await supabase.from('tickets').update({ status: 'Resolved', updated_at: new Date().toISOString() }).eq('id', ticketId)
        }
      }
    }
    setSchedules(prev => prev.map(sch => sch.id === id ? { ...sch, status: newStatus as Schedule['status'], updated_at: now } : sch))
    fetchSchedules()
    setShowDetailModal(false)
    toast(`Schedule ${newStatus}`)
  }

  // Open reschedule reason modal
  const promptReschedule = (s: Schedule) => {
    setRescheduleTarget(s)
    setRescheduleReason('')
    setRescheduleCustomReason('')
    setShowRescheduleModal(true)
  }

  // Reschedule — mark old as rescheduled, open add form pre-filled
  const handleReschedule = async (s: Schedule, reason: string) => {
    const now = new Date().toISOString()
    const updatePayload: Record<string, unknown> = { status: 'rescheduled', updated_at: now, reschedule_reason: reason }
    if (s.started_at) {
      updatePayload.completed_at = now
      updatePayload.actual_duration_minutes = Math.round(
        (new Date(now).getTime() - new Date(s.started_at).getTime()) / 60000
      )
    }
    const { error: reschErr } = await supabase.from('schedules').update(updatePayload).eq('id', s.id)
    if (reschErr) {
      await supabase.from('schedules').update({ status: 'rescheduled', updated_at: now, reschedule_reason: reason }).eq('id', s.id)
    }
    // Log timeline entry
    const ticketId = await ensureTicket(s)
    if (ticketId) {
      await addTimelineEntry(ticketId, `Rescheduled: ${s.clinic_name} — was ${s.schedule_date.split('-').reverse().join('-')} at ${s.schedule_time}. Reason: ${reason}`)
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
    setFormPicSupport(s.pic_support || '')
    setFormClinicWa(s.clinic_wa || '')
    setFormDate('')
    setFormTime(s.schedule_time)
    setFormType(s.schedule_type)
    setFormCustomType(s.custom_type || '')
    setFormMode((s.mode as 'Remote' | 'Onsite') || 'Remote')
    setFormNotes(s.notes || '')
    setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, status: 'rescheduled' as const, reschedule_reason: reason, updated_at: now } : sch))
    setShowDetailModal(false)
    setShowRescheduleModal(false)
    setRescheduleTarget(null)
    setShowAddModal(true)
    fetchSchedules()
    toast('Old schedule marked as rescheduled — pick a new date/time')
  }

  // No answer — set status + append timestamped note
  const handleNoAnswer = async (s: Schedule) => {
    const now = new Date().toISOString()
    const timestamp = new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true })
    const noAnswerNote = `No answer at ${timestamp}`
    const updatedNotes = s.notes ? `${s.notes}\n${noAnswerNote}` : noAnswerNote
    const updatePayload: Record<string, unknown> = { status: 'no_answer', notes: updatedNotes, updated_at: now }
    if (s.started_at) {
      updatePayload.completed_at = now
      updatePayload.actual_duration_minutes = Math.round(
        (new Date(now).getTime() - new Date(s.started_at).getTime()) / 60000
      )
    }
    const { error: naErr } = await supabase.from('schedules').update(updatePayload).eq('id', s.id)
    if (naErr) {
      await supabase.from('schedules').update({ status: 'no_answer', notes: updatedNotes, updated_at: now }).eq('id', s.id)
    }
    // Log timeline entry
    const ticketId = await ensureTicket(s)
    if (ticketId) {
      await addTimelineEntry(ticketId, `No answer: ${s.clinic_name} at ${timestamp}`)
    }
    setSchedules(prev => prev.map(sch => sch.id === s.id ? { ...sch, status: 'no_answer' as const, notes: updatedNotes, updated_at: now } : sch))
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

  // Start working on a schedule — set in_progress + fetch full clinic details
  const handleStartWork = async (s: Schedule) => {
    const now = new Date().toISOString()
    const { error } = await supabase.from('schedules').update({
      status: 'in_progress',
      started_at: now,
      updated_at: now,
    }).eq('id', s.id)
    // Fallback: if started_at column doesn't exist yet (migration 031), update without it
    if (error) {
      await supabase.from('schedules').update({
        status: 'in_progress',
        updated_at: now,
      }).eq('id', s.id)
    }
    // Log timeline entry
    const ticketId = await ensureTicket(s)
    if (ticketId) {
      await addTimelineEntry(ticketId, `Started: ${s.clinic_name}`)
    }
    // Fetch full clinic details
    if (s.clinic_code && s.clinic_code !== 'MANUAL') {
      const { data } = await supabase.from('clinics').select('*').eq('clinic_code', s.clinic_code).single()
      setWorkClinic(data as Clinic | null)
    } else {
      setWorkClinic(null)
    }
    setWorkNotes(s.notes || '')
    // Update local state immediately — don't wait for fetchSchedules
    const updated = { ...s, status: 'in_progress' as const, started_at: now, updated_at: now }
    setSelectedSchedule(updated)
    setSchedules(prev => prev.map(sch => sch.id === s.id ? updated : sch))
    setShowWorkPanel(true)
    fetchSchedules()
    toast('Work started')
  }

  // Save work notes (debounced auto-save)
  const saveWorkNotes = useCallback(async (notes: string) => {
    if (!selectedSchedule) return
    await supabase.from('schedules').update({
      notes: notes || null,
      updated_at: new Date().toISOString(),
    }).eq('id', selectedSchedule.id)
  }, [selectedSchedule, supabase])

  const handleWorkNotesChange = (notes: string) => {
    setWorkNotes(notes)
    if (workNotesRef.current) clearTimeout(workNotesRef.current)
    workNotesRef.current = setTimeout(() => saveWorkNotes(notes), 2000)
  }

  // Format phone for WhatsApp link (strip non-digits, add 60 if needed)
  const formatWALink = (phone: string) => {
    const digits = phone.replace(/\D/g, '')
    const number = digits.startsWith('0') ? '60' + digits.slice(1) : digits.startsWith('60') ? digits : '60' + digits
    return `https://wa.me/${number}`
  }

  // Live work timer — ticks every 30s while work panel is open
  useEffect(() => {
    if (!selectedSchedule?.started_at || selectedSchedule.status !== 'in_progress' || !showWorkPanel) {
      return
    }
    const calc = () => Math.max(0, Math.round((Date.now() - new Date(selectedSchedule.started_at!).getTime()) / 60000))
    setElapsedMinutes(calc())
    const interval = setInterval(() => setElapsedMinutes(calc()), 30000)
    return () => clearInterval(interval)
  }, [selectedSchedule?.started_at, selectedSchedule?.status, showWorkPanel])

  // Start editing a schedule
  const startEditing = async (s: Schedule) => {
    setEditDate(s.schedule_date)
    setEditTime(s.schedule_time)
    setEditType(s.schedule_type)
    setEditCustomType(s.custom_type || '')
    setEditMode((s.mode as 'Remote' | 'Onsite') || 'Remote')
    setEditNotes(s.notes || '')
    setEditPic(s.pic || '')
    setEditPicSupport(s.pic_support || '')
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
      pic_support: editPicSupport || null,
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
    setFormPicSupport('')
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
      issue: `Schedule ${typeLabel}: ${clinicName} on ${formDate.split('-').reverse().join('-')} at ${formTime}`,
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
      pic_support: formPicSupport || null,
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Schedule</h1>
          <p className="text-[13px] text-text-tertiary mt-0.5">Manage appointments and visits</p>
        </div>
        <div className="flex items-center gap-2">
          {/* PIC filter */}
          <select
            value={filterPic}
            onChange={(e) => setFilterPic(e.target.value)}
            className="px-3 py-1.5 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="all">All PIC</option>
            {agents.map(a => (
              <option key={a.id} value={a.name}>{a.name}</option>
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
                onClick={() => inMonth && handleDateClick(dateKey)}
                className={`group min-h-[120px] sm:min-h-[160px] border-b border-r border-border p-1.5 ${
                  !inMonth ? 'bg-zinc-900/30' : 'bg-background'
                } ${today ? 'ring-1 ring-inset ring-accent/40' : ''} ${
                  inMonth ? 'cursor-pointer hover:bg-surface-raised/50 transition-colors' : ''
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
                    const isInProgress = s.status === 'in_progress'
                    const isStruck = isCancelled || isCompleted || isRescheduled
                    const now = new Date()
                    const isPastTime = today && s.status === 'scheduled' && parseTimeToMinutes(s.schedule_time) < (now.getHours() * 60 + now.getMinutes())
                    return (
                      <div
                        key={s.id}
                        title={isRescheduled && s.reschedule_reason ? `Rescheduled: ${s.reschedule_reason}` : undefined}
                        className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] sm:text-xs ${
                          isInProgress ? 'bg-amber-500/25 text-amber-300 ring-1 ring-amber-500/40'
                            : isRescheduled ? 'bg-red-500/20 text-red-400'
                            : `${colors.bg} ${colors.text}`
                        } ${isStruck ? 'line-through' : ''} ${isCancelled ? 'opacity-50' : ''} ${isRescheduled ? 'opacity-60' : ''} ${isCompleted ? 'opacity-70' : ''}`}
                      >
                        {isInProgress && <span className="inline-block size-1.5 rounded-full bg-amber-400 animate-pulse mr-0.5 align-middle" />}
                        {isPastTime && <span className="text-amber-400 mr-0.5">!</span>}
                        {isNoAnswer && <span className="text-orange-400 mr-0.5">!</span>}
                        {isRescheduled && <span className="text-red-400 mr-0.5 no-underline" style={{ textDecoration: 'none' }}>↻</span>}
                        <span className="hidden sm:inline">{s.schedule_time} </span>
                        {s.clinic_name}
                      </div>
                    )
                  })}
                </div>
                {/* "+" hint on hover for empty dates */}
                {inMonth && daySchedules.length === 0 && (
                  <div className="flex-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-text-muted text-lg">+</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 mt-3 text-xs text-text-tertiary flex-wrap">
        <span>{schedules.filter(s => s.status === 'scheduled').length} scheduled</span>
        {schedules.filter(s => s.status === 'in_progress').length > 0 && (
          <span className="text-amber-400">{schedules.filter(s => s.status === 'in_progress').length} in progress</span>
        )}
        {(() => {
          const completed = schedules.filter(s => s.status === 'completed')
          const totalMin = completed.reduce((sum, s) => sum + (s.actual_duration_minutes || 0), 0)
          return (
            <span>
              {completed.length} completed
              {totalMin > 0 && <span className="text-green-400 ml-1">({formatWorkDuration(totalMin)})</span>}
            </span>
          )
        })()}
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
                    const isInProgress = s.status === 'in_progress'
                    const isStruck = isCancelled || isCompleted || isRescheduled
                    const now = new Date()
                    const isDayToday = isToday(dateObj)
                    const isPastTime = isDayToday && s.status === 'scheduled' && parseTimeToMinutes(s.schedule_time) < (now.getHours() * 60 + now.getMinutes())
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleChipClick(s)}
                        className={`w-full text-left px-5 py-3 hover:bg-surface-raised/60 transition-colors ${
                          isCancelled ? 'opacity-40' : ''
                        } ${isCompleted ? 'opacity-60' : ''} ${isInProgress ? 'bg-amber-500/5 border-l-2 border-l-amber-400' : ''} ${isRescheduled ? 'bg-red-500/5 border-l-2 border-l-red-400' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Time + Clinic */}
                            <div className="flex items-center gap-2">
                              {isInProgress && (
                                <span className="inline-block size-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                              )}
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
                              {s.pic_support && <span className="text-xs text-blue-400">· {s.pic_support}</span>}
                            </div>
                            {/* PIC + Phone + WA */}
                            {(s.pic || clinicPhones[s.clinic_code] || s.clinic_wa) && (
                              <div className="text-xs text-text-tertiary mt-0.5 ml-[4.5rem]">
                                {s.pic}{(s.pic && (clinicPhones[s.clinic_code] || s.clinic_wa)) ? ' · ' : ''}{clinicPhones[s.clinic_code] || ''}{clinicPhones[s.clinic_code] && s.clinic_wa ? ' · ' : ''}{s.clinic_wa ? `WhatsApp: ${s.clinic_wa}` : ''}
                              </div>
                            )}
                            {/* Reschedule reason */}
                            {isRescheduled && s.reschedule_reason && (
                              <div className="text-xs text-red-400 mt-0.5 ml-[4.5rem]">Rescheduled: {s.reschedule_reason}</div>
                            )}
                            {/* Mode + Duration */}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className={`text-xs ${isRemote ? 'text-purple-400' : 'text-emerald-400'}`}>
                                {isRemote ? 'Remote' : 'Onsite'}
                              </span>
                              {s.duration_estimate && (
                                <>
                                  <span className="text-zinc-600">·</span>
                                  <span className="text-xs text-text-tertiary">{s.duration_estimate}</span>
                                </>
                              )}
                              {s.actual_duration_minutes && (
                                <>
                                  <span className="text-zinc-600">·</span>
                                  <span className="text-xs text-green-400 font-medium">{formatWorkDuration(s.actual_duration_minutes)}</span>
                                </>
                              )}
                            </div>
                          </div>
                          {/* Type badge */}
                          <span className={`text-[10px] px-2 py-0.5 rounded-lg leading-relaxed max-w-[160px] mt-0.5 ${colors.bg} ${colors.text}`}>
                            {s.schedule_type}{s.custom_type ? `: ${s.custom_type}` : ''}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                  {/* Add Schedule button at bottom of day list */}
                  <div className="px-5 py-3 border-t border-border">
                    <button
                      onClick={() => {
                        setDayDetailDate(null)
                        resetForm()
                        setFormDate(dayDetailDate!)
                        setShowAddModal(true)
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border text-xs text-text-tertiary hover:text-text-primary hover:border-accent/40 transition-colors"
                    >
                      <span className="text-sm">+</span> Add Schedule
                    </button>
                  </div>
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
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-2 pb-20 sm:p-4 sm:pb-4 pointer-events-none">
            <div className={`bg-surface border border-border rounded-xl w-full ${(selectedSchedule.status === 'in_progress' && showWorkPanel) ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] flex flex-col pointer-events-auto shadow-xl transition-all`}>
              {/* Header */}
              <div className={`flex items-center justify-between px-4 py-3 border-b flex-shrink-0 ${(selectedSchedule.status === 'in_progress' && showWorkPanel) ? 'border-amber-500/30 bg-amber-500/5' : 'border-border'}`}>
                <div className="flex items-center gap-2">
                  {/* Back arrow when in work panel */}
                  {(selectedSchedule.status === 'in_progress' && showWorkPanel && !isEditing) && (
                    <button onClick={() => setShowWorkPanel(false)} className="text-text-tertiary hover:text-text-primary p-1 -ml-1 transition-colors" title="Back to details">
                      <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                  )}
                  <h3 className="font-semibold text-text-primary">
                    {isEditing ? 'Edit Schedule' : (selectedSchedule.status === 'in_progress' && showWorkPanel) ? 'Work Panel' : 'Schedule Detail'}
                  </h3>
                </div>
                <button onClick={() => { setShowDetailModal(false); setIsEditing(false); setShowWorkPanel(false) }} className="text-text-tertiary hover:text-text-primary p-2 -mr-2 transition-colors">
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

                    {/* PIC Clinic + PIC Support + WA */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label>PIC Clinic</Label>
                        <Input
                          type="text"
                          value={editPic}
                          onChange={(e) => setEditPic(e.target.value)}
                          placeholder="Clinic contact"
                        />
                      </div>
                      <div>
                        <Label>PIC Support</Label>
                        <Input
                          type="text"
                          value={editPicSupport}
                          onChange={(e) => setEditPicSupport(e.target.value)}
                          placeholder="Support agent"
                        />
                      </div>
                      <div>
                        <Label>Clinic WhatsApp</Label>
                        <Input
                          type="text"
                          value={editClinicWa}
                          onChange={(e) => setEditClinicWa(e.target.value)}
                          placeholder="012-3456789"
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
                ) : (selectedSchedule.status === 'in_progress' && showWorkPanel) ? (
                  /* ===== WORK PANEL — in_progress ===== */
                  <>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const colors = SCHEDULE_TYPE_COLORS[selectedSchedule.schedule_type] || { bg: 'bg-zinc-500/20', text: 'text-zinc-400' }
                        return <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                          {selectedSchedule.schedule_type}{selectedSchedule.custom_type ? ` — ${selectedSchedule.custom_type}` : ''}
                        </span>
                      })()}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 animate-pulse">
                        In Progress
                      </span>
                      <span className={`text-xs ${selectedSchedule.mode === 'Remote' ? 'text-purple-400' : 'text-emerald-400'}`}>
                        {selectedSchedule.mode || 'Onsite'}
                      </span>
                    </div>

                    {/* Schedule summary + live timer */}
                    <div className="flex items-center gap-3 text-sm text-text-secondary">
                      <span className="font-mono text-accent">{selectedSchedule.schedule_time}</span>
                      <span>{selectedSchedule.schedule_date.split('-').reverse().join('/')}</span>
                      <span>{agentDisplayName(selectedSchedule)}</span>
                      {selectedSchedule.started_at && (
                        <span className="ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-xs font-medium tabular-nums">
                          <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
                          {formatWorkDuration(elapsedMinutes)}
                        </span>
                      )}
                    </div>
                    {selectedSchedule.duration_estimate && (
                      <p className="text-xs text-text-muted">Estimated: {selectedSchedule.duration_estimate}</p>
                    )}

                    {/* Full Clinic Details Card */}
                    <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-3 space-y-2">
                      <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Clinic Details</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-text-tertiary text-xs">Name</span>
                          <p className="text-text-primary font-medium">{selectedSchedule.clinic_name}</p>
                        </div>
                        <div>
                          <span className="text-text-tertiary text-xs">Code</span>
                          <p className="text-text-primary font-mono">{selectedSchedule.clinic_code}</p>
                        </div>
                        <div>
                          <span className="text-text-tertiary text-xs">Phone</span>
                          <p className="text-text-primary">{workClinic?.clinic_phone || clinicPhones[selectedSchedule.clinic_code] || '-'}</p>
                        </div>
                        <div>
                          <span className="text-text-tertiary text-xs">WhatsApp</span>
                          <p className="text-text-primary">{selectedSchedule.clinic_wa || '-'}</p>
                        </div>
                        {selectedSchedule.pic && (
                          <div>
                            <span className="text-text-tertiary text-xs">PIC Clinic</span>
                            <p className="text-text-primary">{selectedSchedule.pic}</p>
                          </div>
                        )}
                        {selectedSchedule.pic_support && (
                          <div>
                            <span className="text-text-tertiary text-xs">PIC Support</span>
                            <p className="text-text-primary text-blue-400">{selectedSchedule.pic_support}</p>
                          </div>
                        )}
                        {workClinic?.registered_contact && (
                          <div>
                            <span className="text-text-tertiary text-xs">Registered Contact</span>
                            <p className="text-text-primary">{workClinic.registered_contact}</p>
                          </div>
                        )}
                        {workClinic?.email_main && (
                          <div className="col-span-2">
                            <span className="text-text-tertiary text-xs">Email</span>
                            <p className="text-text-primary truncate">{workClinic.email_main}{workClinic.email_secondary ? ` · ${workClinic.email_secondary}` : ''}</p>
                          </div>
                        )}
                        {workClinic?.product_type && (
                          <div>
                            <span className="text-text-tertiary text-xs">Product</span>
                            <p className="text-text-primary">{workClinic.product_type}</p>
                          </div>
                        )}
                        {workClinic?.mtn_expiry && (
                          <div>
                            <span className="text-text-tertiary text-xs">MTN</span>
                            <p className="text-text-primary flex items-center gap-1.5">
                              {workClinic.mtn_start?.split('-').reverse().join('/') || '?'} → {workClinic.mtn_expiry.split('-').reverse().join('/')}
                              {(() => {
                                const today = new Date(); today.setHours(0,0,0,0)
                                const exp = new Date(workClinic.mtn_expiry + 'T00:00:00')
                                const diff = Math.ceil((exp.getTime() - today.getTime()) / 86400000)
                                if (diff < 0) return <span className="text-[10px] px-1 py-0.5 rounded bg-red-500/20 text-red-400">EXPIRED</span>
                                if (diff <= 30) return <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400">EXPIRING</span>
                                return <span className="text-[10px] px-1 py-0.5 rounded bg-green-500/20 text-green-400">ACTIVE</span>
                              })()}
                            </p>
                          </div>
                        )}
                        {(workClinic?.city || workClinic?.state) && (
                          <div>
                            <span className="text-text-tertiary text-xs">Location</span>
                            <p className="text-text-primary">{[workClinic.city, workClinic.state].filter(Boolean).join(', ')}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="flex flex-wrap gap-2">
                      {/* Call */}
                      {(() => {
                        const phone = workClinic?.clinic_phone || clinicPhones[selectedSchedule.clinic_code]
                        return (
                          <a
                            href={phone ? `tel:${phone}` : undefined}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              phone ? 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20' : 'bg-surface border-border text-text-muted cursor-not-allowed'
                            }`}
                          >
                            <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            Call
                          </a>
                        )
                      })()}
                      {/* WhatsApp */}
                      {(() => {
                        const wa = selectedSchedule.clinic_wa
                        return (
                          <button
                            onClick={() => wa && window.open(formatWALink(wa), '_blank')}
                            disabled={!wa}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              wa ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20' : 'bg-surface border-border text-text-muted cursor-not-allowed'
                            }`}
                          >
                            <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.136.558 4.137 1.534 5.879L.067 23.537l5.818-1.527A11.935 11.935 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-1.902 0-3.69-.517-5.218-1.414l-.374-.222-3.88 1.018 1.035-3.78-.244-.388A9.767 9.767 0 012.182 12c0-5.418 4.4-9.818 9.818-9.818S21.818 6.582 21.818 12s-4.4 9.818-9.818 9.818z"/>
                            </svg>
                            WhatsApp
                          </button>
                        )
                      })()}
                      {/* License Key */}
                      <button
                        onClick={() => {
                          if (selectedSchedule.clinic_code === 'MANUAL') return
                          sessionStorage.setItem('lk-prefill', JSON.stringify({
                            clinic_code: selectedSchedule.clinic_code,
                            clinic_name: selectedSchedule.clinic_name,
                          }))
                          router.push('/lk')
                        }}
                        disabled={selectedSchedule.clinic_code === 'MANUAL'}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          selectedSchedule.clinic_code !== 'MANUAL'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20'
                            : 'bg-surface border-border text-text-muted cursor-not-allowed'
                        }`}
                      >
                        <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                        </svg>
                        License Key
                      </button>
                      {/* View Ticket */}
                      <button
                        onClick={() => selectedSchedule.source_ticket_id && router.push(`/tickets/${selectedSchedule.source_ticket_id}`)}
                        disabled={!selectedSchedule.source_ticket_id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          selectedSchedule.source_ticket_id
                            ? 'bg-violet-500/10 text-violet-400 border-violet-500/30 hover:bg-violet-500/20'
                            : 'bg-surface border-border text-text-muted cursor-not-allowed'
                        }`}
                      >
                        <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        View Ticket
                      </button>
                      {/* Job Sheet */}
                      <button
                        onClick={() => {
                          sessionStorage.setItem('js-prefill', JSON.stringify({
                            schedule_id: selectedSchedule.id,
                            clinic_code: selectedSchedule.clinic_code,
                            clinic_name: selectedSchedule.clinic_name,
                            contact_person: selectedSchedule.pic || '',
                            contact_tel: selectedSchedule.clinic_wa || '',
                            service_date: selectedSchedule.schedule_date,
                            work_notes: workNotes || '',
                          }))
                          router.push('/job-sheets?create=1')
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors bg-orange-500/10 text-orange-400 border-orange-500/30 hover:bg-orange-500/20"
                      >
                        <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Job Sheet
                      </button>
                      {/* Email */}
                      {(() => {
                        const email = workClinic?.email_main
                        return (
                          <a
                            href={email ? `mailto:${email}` : undefined}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              email ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20' : 'bg-surface border-border text-text-muted cursor-not-allowed'
                            }`}
                          >
                            <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            Email
                          </a>
                        )
                      })()}
                    </div>

                    {/* Live Notes */}
                    <div>
                      <span className="text-text-tertiary text-xs">Notes</span>
                      <Textarea
                        value={workNotes}
                        onChange={(e) => handleWorkNotesChange(e.target.value)}
                        rows={3}
                        placeholder="Working notes — auto-saves..."
                      />
                    </div>
                  </>
                ) : (
                  /* ===== VIEW MODE (non in_progress) ===== */
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
                        {selectedSchedule.actual_duration_minutes ? (
                          <p className="text-text-primary">
                            <span className="font-medium">{formatWorkDuration(selectedSchedule.actual_duration_minutes)}</span>
                            {selectedSchedule.duration_estimate && (
                              <span className="text-text-muted text-xs ml-1">(est. {selectedSchedule.duration_estimate})</span>
                            )}
                          </p>
                        ) : (
                          <p className="text-text-primary">{selectedSchedule.duration_estimate || '-'}</p>
                        )}
                      </div>
                      <div>
                        <span className="text-text-tertiary text-xs">Mode</span>
                        <p className={`font-medium ${selectedSchedule.mode === 'Remote' ? 'text-purple-400' : 'text-emerald-400'}`}>
                          {selectedSchedule.mode || 'Onsite'}
                        </p>
                      </div>
                      {selectedSchedule.pic && (
                        <div>
                          <span className="text-text-tertiary text-xs">PIC Clinic</span>
                          <p className="text-text-primary">{selectedSchedule.pic}</p>
                        </div>
                      )}
                      {selectedSchedule.pic_support && (
                        <div>
                          <span className="text-text-tertiary text-xs">PIC Support</span>
                          <p className="text-text-primary text-blue-400">{selectedSchedule.pic_support}</p>
                        </div>
                      )}
                    </div>
                    {selectedSchedule.notes && (
                      <div>
                        <span className="text-text-tertiary text-xs">Notes</span>
                        <p className="text-sm text-text-primary">{selectedSchedule.notes}</p>
                      </div>
                    )}
                    {selectedSchedule.status === 'rescheduled' && selectedSchedule.reschedule_reason && (
                      <div>
                        <span className="text-text-tertiary text-xs">Reschedule Reason</span>
                        <p className="text-sm text-red-400">{selectedSchedule.reschedule_reason}</p>
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

              {/* Audit line */}
              <div className="px-4 py-1.5 text-[11px] text-text-muted">
                Logged by {agentDisplayName(selectedSchedule)} · {new Date(selectedSchedule.created_at).toLocaleDateString('en-GB')}
              </div>

              {/* Actions */}
              <div className="px-4 py-3 border-t border-border flex-shrink-0 space-y-2">
                {isEditing ? (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveEdit} loading={editSaving} className="flex-1">
                      Save Changes
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Primary action — full width */}
                    {selectedSchedule.status === 'scheduled' && (
                      <Button size="sm" onClick={() => handleStartWork(selectedSchedule)} className="w-full bg-amber-500 hover:bg-amber-600 text-black">
                        <svg className="size-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Start Work
                      </Button>
                    )}
                    {selectedSchedule.status === 'in_progress' && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="success" onClick={() => handleStatusChange(selectedSchedule.id, 'completed')} className="flex-1">
                          Complete
                        </Button>
                        {!showWorkPanel && (
                          <Button size="sm" onClick={() => setShowWorkPanel(true)} className="flex-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30">
                            Open Work Panel
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Secondary actions row */}
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startEditing(selectedSchedule)}>
                        <svg className="size-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </Button>
                      {selectedSchedule.status === 'scheduled' && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => handleStatusChange(selectedSchedule.id, 'completed')}>
                            Complete
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => handleNoAnswer(selectedSchedule)}>
                            No Answer
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => promptReschedule(selectedSchedule)}>
                            Reschedule
                          </Button>
                        </>
                      )}
                      {selectedSchedule.status === 'in_progress' && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => handleNoAnswer(selectedSchedule)}>
                            No Answer
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => promptReschedule(selectedSchedule)}>
                            Reschedule
                          </Button>
                        </>
                      )}
                      {selectedSchedule.status === 'no_answer' && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => handleNoAnswer(selectedSchedule)}>
                            No Answer Again
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => promptReschedule(selectedSchedule)}>
                            Reschedule
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => handleStatusChange(selectedSchedule.id, 'scheduled')}>
                            Retry
                          </Button>
                        </>
                      )}
                      {(selectedSchedule.status === 'cancelled' || selectedSchedule.status === 'rescheduled' || selectedSchedule.status === 'completed') && (
                        <Button size="sm" variant="secondary" onClick={() => handleStatusChange(selectedSchedule.id, 'scheduled')}>
                          Reopen
                        </Button>
                      )}
                      {/* Delete — subtle icon, pushed to the right */}
                      <button
                        onClick={() => handleDelete(selectedSchedule.id)}
                        className="ml-auto text-text-muted hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== Reschedule Reason Modal ===== */}
      {showRescheduleModal && rescheduleTarget && (() => {
        const REASON_PRESETS = ['No Answer', 'Clinic Busy', 'Agent Unavailable', 'Clinic Requested', 'Others']
        const currentReason = rescheduleReason === 'Others' ? rescheduleCustomReason.trim() : rescheduleReason
        return (
          <>
            <div className="fixed inset-0 bg-black/60 z-[70]" onClick={() => { setShowRescheduleModal(false); setRescheduleTarget(null) }} />
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
              <div className="bg-surface border border-border rounded-xl w-full max-w-sm pointer-events-auto shadow-xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="font-semibold text-text-primary text-sm">Why are you rescheduling?</h3>
                  <button onClick={() => { setShowRescheduleModal(false); setRescheduleTarget(null) }} className="text-text-tertiary hover:text-text-primary p-1 -mr-1">
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {REASON_PRESETS.map(r => (
                      <button
                        key={r}
                        onClick={() => setRescheduleReason(rescheduleReason === r ? '' : r)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          rescheduleReason === r
                            ? 'bg-violet-500/30 text-violet-300 ring-1 ring-violet-500/50'
                            : 'bg-surface-raised text-text-secondary hover:text-text-primary hover:bg-surface-raised/80'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  {rescheduleReason === 'Others' && (
                    <input
                      type="text"
                      value={rescheduleCustomReason}
                      onChange={e => setRescheduleCustomReason(e.target.value)}
                      placeholder="Type reason..."
                      autoFocus
                      className="w-full px-3 py-2 rounded-lg bg-surface-inset border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  )}
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!currentReason}
                    onClick={() => handleReschedule(rescheduleTarget, currentReason)}
                  >
                    Confirm Reschedule
                  </Button>
                </div>
              </div>
            </div>
          </>
        )
      })()}

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

                {/* PIC Clinic + PIC Support + WA */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>PIC Clinic</Label>
                    <Input
                      type="text"
                      value={formPic}
                      onChange={(e) => setFormPic(e.target.value)}
                      placeholder="Clinic contact"
                    />
                  </div>
                  <div>
                    <Label>PIC Support</Label>
                    <Input
                      type="text"
                      value={formPicSupport}
                      onChange={(e) => setFormPicSupport(e.target.value)}
                      placeholder="Support agent"
                    />
                  </div>
                  <div>
                    <Label>Clinic WhatsApp</Label>
                    <Input
                      type="text"
                      value={formClinicWa}
                      onChange={(e) => setFormClinicWa(e.target.value)}
                      placeholder="012-3456789"
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
