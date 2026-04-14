'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Clinic, OpenTicketWarning, IssueType, TicketStatus, Channel, KnowledgeBaseEntry } from '@/lib/types'
import { STATUSES, STATUS_COLORS, getIssueTypeColor, CALL_DURATIONS, SCHEDULE_TYPES, SCHEDULE_TYPE_COLORS, ISSUE_CATEGORIES, getIssueCategoryColor, ISSUE_TYPES, toProperCase } from '@/lib/constants'
import ClinicSearch from '@/components/ClinicSearch'
import OpenTicketBanner from '@/components/OpenTicketBanner'
import TimelineBuilder from '@/components/TimelineBuilder'
import PillSelector from '@/components/PillSelector'
import IssueTypeSelect from '@/components/IssueTypeSelect'

import LicenseKeyModal from '@/components/LicenseKeyModal'
import ClinicProfilePanel from '@/components/ClinicProfilePanel'
import Button from '@/components/ui/Button'
import { Input, Textarea, Label } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { format } from 'date-fns'

// WHY: Log Call form — spec Section 8. The most-used page (~80 times/day).
// V3 redesign: Two-zone layout (form left, context right), grouped visual zones.

// Draft system — agents handle 4-5 simultaneous calls, need to save partial forms
interface CallLogDraft {
  id: string
  label: string
  savedAt: string
  selectedClinic: Clinic | null
  callerTel: string
  pic: string
  clinicWa: string
  callDuration: number | null
  issueCategory: string | null
  issueType: string | null
  issue: string
  myResponse: string
  nextStep: string
  timelineFromCustomer: string
  internalTimeline: string
  needTeamCheck: boolean
  status: TicketStatus | null
  jiraLink: string
  callDate?: string
}

const AUTOSAVE_KEY = 'medex-ws-autosave'
const MAX_ATTACHMENTS = 5

export default function LogCallPage() {
  const router = useRouter()
  const supabase = createClient()

  // Current user
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')

  // Clinic
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null)
  const [openTickets, setOpenTickets] = useState<OpenTicketWarning[]>([])
  const [showOpenTicketBanner, setShowOpenTicketBanner] = useState(true)

  // Form fields
  const [callerTel, setCallerTel] = useState('')
  const [pic, setPic] = useState('')
  const [clinicWa, setClinicWa] = useState('')
  const [callDuration, setCallDuration] = useState<number | null>(null)
  const [issueCategory, setIssueCategory] = useState<string | null>(null)
  const [issueType, setIssueType] = useState<IssueType | null>(null)
  const [issue, setIssue] = useState('')
  const [myResponse, setMyResponse] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [timelineFromCustomer, setTimelineFromCustomer] = useState('')
  const [internalTimeline, setInternalTimeline] = useState('')
  const [needTeamCheck, setNeedTeamCheck] = useState(false)
  const [status, setStatus] = useState<TicketStatus | null>('Resolved')
  const [jiraLink, setJiraLink] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Call date — defaults to today, can be changed to backdate
  const [callDate, setCallDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [editingCallDate, setEditingCallDate] = useState(false)

  // Schedule fields — shown when issueType === 'Schedule'
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduleType, setScheduleType] = useState<string | null>(null)
  const [customScheduleType, setCustomScheduleType] = useState('')
  const [scheduleMode, setScheduleMode] = useState<'Remote' | 'Onsite'>('Remote')
  const [schedulePicSupport, setSchedulePicSupport] = useState('')
  const [scheduleNotes, setScheduleNotes] = useState('')

  // Timeline entry
  const [timelineData, setTimelineData] = useState<{
    entryDate: string; channel: Channel; notes: string; formattedString: string
  } | null>(null)

  // UI state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({})

  const [showLicenseKeyModal, setShowLicenseKeyModal] = useState(false)
  const [showCrmPanel, setShowCrmPanel] = useState(false)
  const responseRef = useRef<HTMLTextAreaElement>(null)
  const clinicRef = useRef<HTMLDivElement>(null)
  const issueCategoryRef = useRef<HTMLDivElement>(null)
  const issueTypeRef = useRef<HTMLDivElement>(null)
  const issueRef = useRef<HTMLDivElement>(null)
  const myResponseRef = useRef<HTMLDivElement>(null)
  const durationRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const jiraLinkRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const [drafts, setDrafts] = useState<CallLogDraft[]>([])
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [showAutoRestore, setShowAutoRestore] = useState(false)
  const [showKB, setShowKB] = useState(false)
  const [kbEntries, setKBEntries] = useState<KnowledgeBaseEntry[]>([])
  const [kbSearch, setKBSearch] = useState('')

  // Fetch current user on mount + check for KB pre-fill from /kb page
  useEffect(() => {
    async function getUser() {
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
    }
    getUser()

    // WHY: Check sessionStorage for KB pre-fill data (set by /kb page UC-16)
    const prefill = sessionStorage.getItem('kb_prefill')
    if (prefill) {
      const data = JSON.parse(prefill)
      if (data.issue_type) setIssueType(data.issue_type)
      if (data.issue) setIssue(data.issue)
      if (data.my_response) {
        setMyResponse(data.my_response)
        requestAnimationFrame(() => {
          if (responseRef.current) {
            responseRef.current.style.height = 'auto'
            responseRef.current.style.height = responseRef.current.scrollHeight + 'px'
          }
        })
      }
      sessionStorage.removeItem('kb_prefill')
    }

    // WHY: Check sessionStorage for clinic pre-fill (set by ticket detail "Same Clinic, New Issue")
    const clinicPrefill = sessionStorage.getItem('clinic_prefill')
    if (clinicPrefill) {
      const data = JSON.parse(clinicPrefill)
      sessionStorage.removeItem('clinic_prefill')
      // Fetch full clinic object by clinic_code
      if (data.clinic_code) {
        supabase
          .from('clinics')
          .select('id, clinic_code, clinic_name, clinic_phone, mtn_start, mtn_expiry, renewal_status, product_type, city, state, registered_contact, email_main, email_secondary, lkey_line1, lkey_line2, lkey_line3, lkey_line4, lkey_line5')
          .eq('clinic_code', data.clinic_code)
          .single()
          .then(({ data: clinic }: { data: Clinic | null }) => {
            if (clinic) {
              setSelectedClinic(clinic)
              if (data.caller_tel) setCallerTel(data.caller_tel)
              if (data.pic) setPic(data.pic)
            }
          })
      }
    }

    // Load drafts from Supabase (persistent, survives browser clear)
    async function fetchDrafts() {
      const { data: { session: s } } = await supabase.auth.getSession()
      if (!s?.user) return
      const { data } = await supabase
        .from('call_log_drafts')
        .select('*')
        .eq('user_id', s.user.id)
        .order('updated_at', { ascending: false })
      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setDrafts(data.map((row: any) => ({
          id: row.id,
          label: row.label,
          savedAt: row.updated_at,
          ...row.form_data,
        })))
      }
    }
    fetchDrafts()

    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY)
      if (saved) {
        const data = JSON.parse(saved) as CallLogDraft
        if (data.selectedClinic || data.pic || data.issue || data.callerTel) {
          pendingRestoreRef.current = data
          setShowAutoRestore(true)
        }
      }
    } catch { /* ignore corrupt autosave */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAutoRestore = (restore: boolean) => {
    if (restore && pendingRestoreRef.current) {
      const draft = pendingRestoreRef.current
      setSelectedClinic(draft.selectedClinic)
      setCallerTel(draft.callerTel)
      setPic(draft.pic)
      setClinicWa(draft.clinicWa || '')
      setCallDuration(draft.callDuration)
      setIssueCategory(draft.issueCategory || null)
      setIssueType(draft.issueType as IssueType | null)
      setIssue(draft.issue)
      setMyResponse(draft.myResponse)
      setNextStep(draft.nextStep)
      setTimelineFromCustomer(draft.timelineFromCustomer)
      setInternalTimeline(draft.internalTimeline)
      setNeedTeamCheck(draft.needTeamCheck)
      setStatus(draft.status)
      setJiraLink(draft.jiraLink)
      if (draft.callDate) setCallDate(draft.callDate)
      toast('Form restored')
    }
    pendingRestoreRef.current = null
    localStorage.removeItem(AUTOSAVE_KEY)
    setShowAutoRestore(false)
  }

  // Auto-save
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRestoreRef = useRef<CallLogDraft | null>(null)
  const submittedRef = useRef(false)

  const getFormSnapshot = useCallback((): CallLogDraft | null => {
    if (submittedRef.current) return null
    if (!selectedClinic && !pic && !issue && !callerTel) return null
    return {
      id: 'autosave',
      label: 'autosave',
      savedAt: new Date().toISOString(),
      selectedClinic, callerTel, pic, clinicWa,
      callDuration, issueCategory, issueType, issue, myResponse,
      nextStep, timelineFromCustomer, internalTimeline,
      needTeamCheck, status, jiraLink, callDate,
    }
  }, [selectedClinic, callerTel, pic, clinicWa, callDuration, issueCategory, issueType, issue,
      myResponse, nextStep, timelineFromCustomer, internalTimeline, needTeamCheck, status, jiraLink, callDate])

  useEffect(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(() => {
      const snapshot = getFormSnapshot()
      if (snapshot) {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot))
      } else {
        localStorage.removeItem(AUTOSAVE_KEY)
      }
    }, 1500)
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
      // Save immediately on unmount — catches SPA navigation
      const snapshot = getFormSnapshot()
      if (snapshot) {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot))
      }
    }
  }, [getFormSnapshot])

  useEffect(() => {
    const saveNow = () => {
      const snapshot = getFormSnapshot()
      if (snapshot) {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot))
      }
    }
    const handleVisibility = () => { if (document.visibilityState === 'hidden') saveNow() }
    window.addEventListener('beforeunload', saveNow)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('beforeunload', saveNow)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [getFormSnapshot])

  const handleClinicSelect = (clinic: Clinic) => {
    setSelectedClinic(clinic)
    setShowOpenTicketBanner(true)
    setFieldErrors(prev => ({ ...prev, clinic: false }))
  }

  const handleOpenTickets = (tickets: OpenTicketWarning[]) => {
    setOpenTickets(tickets)
    setShowOpenTicketBanner(tickets.length > 0)
  }

  const handleAddToExisting = (ticketId: string) => {
    router.push(`/tickets/${ticketId}`)
  }

  const loadKB = async () => {
    const { data } = await supabase
      .from('knowledge_base')
      .select('*')
      .eq('status', 'published')
      .order('issue_type')
    if (data) setKBEntries(data)
    setShowKB(true)
  }

  const handleKBSelect = (entry: KnowledgeBaseEntry) => {
    setIssue(entry.issue)
    setMyResponse(entry.fix)
    // Validate issue_type against allowed list (DB CHECK constraint)
    const validType = ISSUE_TYPES.includes(entry.issue_type) ? entry.issue_type : 'Others'
    setIssueType(validType)
    setShowKB(false)
    setFieldErrors(prev => ({ ...prev, issueType: false, issue: false }))
  }

  const filteredKB = useMemo(() => kbEntries.filter((e) =>
    kbSearch === '' ||
    e.issue.toLowerCase().includes(kbSearch.toLowerCase()) ||
    e.fix.toLowerCase().includes(kbSearch.toLowerCase()) ||
    e.issue_type.toLowerCase().includes(kbSearch.toLowerCase())
  ), [kbEntries, kbSearch])

  const uploadFile = useCallback(async (file: File) => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      toast(`Maximum ${MAX_ATTACHMENTS} images allowed`, 'error')
      return
    }
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg']
    if (!allowedTypes.includes(file.type)) {
      toast('Only PNG and JPG images are allowed', 'error')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { toast(data.error || 'Upload failed', 'error'); return }
      setAttachments(prev => [...prev, data.url])
      toast('Image attached', 'success')
    } catch {
      toast('Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }, [attachments.length, toast])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await uploadFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (lightboxUrl || showLicenseKeyModal || showKB) return
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault()
          const file = items[i].getAsFile()
          if (file) uploadFile(file)
          return
        }
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [lightboxUrl, showLicenseKeyModal, showKB, uploadFile])

  const handleSave = useCallback(async () => {
    setError('')
    const errors: Record<string, boolean> = {}

    if (!selectedClinic && !pic) errors.clinic = true
    if (!issueCategory) errors.issueCategory = true
    if (!issueType) errors.issueType = true
    if (!issue.trim()) errors.issue = true
    if (!myResponse.trim()) errors.myResponse = true
    if (!callDuration) errors.duration = true
    if (!status) errors.status = true
    if (status === 'Escalated' && !jiraLink.trim()) errors.jiraLink = true

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      const missing: string[] = []
      if (errors.clinic) missing.push('clinic or clinic PIC')
      if (errors.issueCategory) missing.push('category')
      if (errors.issueType) missing.push('issue type')
      if (errors.issue) missing.push('issue description')
      if (errors.myResponse) missing.push('my response')
      if (errors.duration) missing.push('duration')
      if (errors.status) missing.push('status')
      if (errors.jiraLink) missing.push('Jira link')
      setError(`Required: ${missing.join(', ')}`)

      // Scroll to first errored field
      const fieldOrder: { key: string; ref: React.RefObject<HTMLDivElement | null> }[] = [
        { key: 'clinic', ref: clinicRef },
        { key: 'issueCategory', ref: issueCategoryRef },
        { key: 'issueType', ref: issueTypeRef },
        { key: 'issue', ref: issueRef },
        { key: 'myResponse', ref: myResponseRef },
        { key: 'duration', ref: durationRef },
        { key: 'status', ref: statusRef },
        { key: 'jiraLink', ref: jiraLinkRef },
      ]
      const firstError = fieldOrder.find(f => errors[f.key])
      if (firstError?.ref.current) {
        firstError.ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => {
          const input = firstError.ref.current?.querySelector('input, textarea, select')
          if (input) (input as HTMLElement).focus()
        }, 400)
      }
      return
    }

    setFieldErrors({})
    setSaving(true)

    // Backdate support — callDate defaults to today, can be set to past dates
    const now = new Date()
    const createdAt = new Date(`${callDate}T${format(now, 'HH:mm:ss')}`).toISOString()

    const ticketData = {
      record_type: 'call',
      clinic_code: selectedClinic?.clinic_code || 'MANUAL',
      clinic_name: selectedClinic?.clinic_name || pic || 'Unknown',
      clinic_phone: selectedClinic?.clinic_phone || null,
      mtn_expiry: selectedClinic?.mtn_expiry || null,
      renewal_status: selectedClinic?.renewal_status || null,
      product_type: selectedClinic?.product_type || null,
      city: selectedClinic?.city || null,
      state: selectedClinic?.state || null,
      registered_contact: selectedClinic?.registered_contact || null,
      caller_tel: callerTel || null,
      pic: pic || null,
      call_duration: callDuration,
      issue_category: issueCategory,
      issue_type: issueType,
      issue: issue.trim(),
      my_response: myResponse.trim() || null,
      next_step: nextStep.trim() || null,
      timeline_from_customer: timelineFromCustomer.trim() || null,
      internal_timeline: internalTimeline.trim() || null,
      status,
      need_team_check: needTeamCheck,
      jira_link: status === 'Escalated' ? jiraLink.trim() : null,
      attachment_urls: attachments.length > 0 ? attachments : [],
      created_at: createdAt,
      created_by: userId,
      created_by_name: userName,
      last_updated_by: userId,
      last_updated_by_name: userName,
    }

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .insert(ticketData)
      .select()
      .single()

    if (ticketError) {
      setError('Failed to save: ' + ticketError.message)
      setSaving(false)
      return
    }

    if (timelineData && timelineData.channel && timelineData.notes) {
      await supabase.from('timeline_entries').insert({
        ticket_id: ticket.id,
        entry_date: timelineData.entryDate,
        channel: timelineData.channel,
        notes: timelineData.formattedString || timelineData.notes,
        added_by: userId,
        added_by_name: userName,
      })
    }

    if (issueType === 'Schedule' && scheduleDate && scheduleTime && scheduleType) {
      const duration = SCHEDULE_TYPES.find(t => t.value === scheduleType)?.duration || ''
      await supabase.from('schedules').insert({
        clinic_code: selectedClinic?.clinic_code || 'MANUAL',
        clinic_name: selectedClinic?.clinic_name || pic || 'Unknown',
        pic: pic || null,
        pic_support: schedulePicSupport || null,
        schedule_date: scheduleDate,
        schedule_time: scheduleTime,
        schedule_type: scheduleType,
        custom_type: scheduleType === 'Others' ? customScheduleType || null : null,
        duration_estimate: duration || null,
        mode: scheduleMode,
        agent_name: userName,
        agent_id: userId,
        notes: scheduleNotes.trim() || issue.trim() || null,
        clinic_wa: clinicWa.trim() || null,
        source_ticket_id: ticket.id,
      })
    }

    if (activeDraftId) {
      await supabase.from('call_log_drafts').delete().eq('id', activeDraftId)
      setDrafts(prev => prev.filter(d => d.id !== activeDraftId))
    }

    submittedRef.current = true
    localStorage.removeItem(AUTOSAVE_KEY)
    router.push(`/tickets/${ticket.id}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClinic, pic, issueCategory, issueType, issue, status, jiraLink, callerTel, callDuration,
      myResponse, nextStep, timelineFromCustomer, internalTimeline, needTeamCheck,
      timelineData, userId, userName, router, supabase, activeDraftId,
      scheduleDate, scheduleTime, scheduleType, customScheduleType, attachments, callDate])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !saving) {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, saving])

  const handleClear = () => {
    if (issue || myResponse || pic || callerTel) {
      if (!confirm('Clear all fields?')) return
    }
    setSelectedClinic(null)
    setOpenTickets([])
    setCallerTel('')
    setPic('')
    setClinicWa('')
    setCallDuration(null)
    setIssueCategory(null)
    setIssueType(null)
    setIssue('')
    setMyResponse('')
    setNextStep('')
    setTimelineFromCustomer('')
    setInternalTimeline('')
    setNeedTeamCheck(false)
    setStatus('Resolved')
    setJiraLink('')
    setAttachments([])
    setScheduleDate('')
    setScheduleTime('')
    setScheduleType(null)
    setCustomScheduleType('')
    setScheduleMode('Remote')
    setSchedulePicSupport('')
    setScheduleNotes('')
    setCallDate(format(new Date(), 'yyyy-MM-dd'))
    setEditingCallDate(false)
    setTimelineData(null)
    setError('')
    setFieldErrors({})
    setActiveDraftId(null)
    localStorage.removeItem(AUTOSAVE_KEY)
  }

  const resetFormSilent = () => {
    setSelectedClinic(null)
    setOpenTickets([])
    setCallerTel('')
    setPic('')
    setClinicWa('')
    setCallDuration(null)
    setIssueCategory(null)
    setIssueType(null)
    setIssue('')
    setMyResponse('')
    setNextStep('')
    setTimelineFromCustomer('')
    setInternalTimeline('')
    setNeedTeamCheck(false)
    setStatus('Resolved')
    setJiraLink('')
    setAttachments([])
    setScheduleDate('')
    setScheduleTime('')
    setScheduleType(null)
    setCustomScheduleType('')
    setScheduleMode('Remote')
    setSchedulePicSupport('')
    setScheduleNotes('')
    setCallDate(format(new Date(), 'yyyy-MM-dd'))
    setEditingCallDate(false)
    setTimelineData(null)
    setError('')
    setFieldErrors({})
    setActiveDraftId(null)
    localStorage.removeItem(AUTOSAVE_KEY)
  }

  const handleSaveDraft = async () => {
    if (!selectedClinic && !pic && !issue && !callerTel) {
      toast('Nothing to save — form is empty', 'error')
      return
    }
    const label = selectedClinic?.clinic_name || pic || 'Draft'
    const formData = {
      selectedClinic, callerTel, pic, clinicWa, callDuration,
      issueCategory, issueType, issue, myResponse, nextStep,
      timelineFromCustomer, internalTimeline, needTeamCheck,
      status, jiraLink, callDate,
    }
    const { data, error: err } = await supabase.from('call_log_drafts').insert({
      user_id: userId,
      label,
      form_data: formData,
    }).select().single()
    if (err || !data) {
      toast('Failed to save draft', 'error')
      return
    }
    const newDraft: CallLogDraft = { id: data.id, label, savedAt: data.updated_at, ...formData }
    setDrafts(prev => [newDraft, ...prev])
    resetFormSilent()
    toast('Draft saved — start your next call')
  }

  const handleLoadDraft = (draftId: string) => {
    if (issue || myResponse || pic || callerTel) {
      if (!confirm('Load draft? Current form will be replaced.')) return
    }
    const draft = drafts.find(d => d.id === draftId)
    if (!draft) return
    setSelectedClinic(draft.selectedClinic)
    setCallerTel(draft.callerTel)
    setPic(draft.pic)
    setClinicWa(draft.clinicWa || '')
    setCallDuration(draft.callDuration)
    setIssueCategory(draft.issueCategory || null)
    setIssueType(draft.issueType as IssueType | null)
    setIssue(draft.issue)
    setMyResponse(draft.myResponse)
    setNextStep(draft.nextStep)
    setTimelineFromCustomer(draft.timelineFromCustomer)
    setInternalTimeline(draft.internalTimeline)
    setNeedTeamCheck(draft.needTeamCheck)
    setStatus(draft.status)
    setJiraLink(draft.jiraLink)
    if (draft.callDate) setCallDate(draft.callDate)
    setActiveDraftId(draftId)
    setError('')
    setFieldErrors({})
  }

  const handleDeleteDraft = async (draftId: string) => {
    await supabase.from('call_log_drafts').delete().eq('id', draftId)
    setDrafts(prev => prev.filter(d => d.id !== draftId))
    if (activeDraftId === draftId) setActiveDraftId(null)
  }

  const statusOptions = STATUSES.map((s) => ({
    value: s,
    label: s,
    colors: STATUS_COLORS[s],
  }))

  const clinicBorderColor = useMemo(() => {
    if (!selectedClinic?.mtn_expiry) return 'border-l-zinc-600'
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const expiry = new Date(selectedClinic.mtn_expiry + 'T00:00:00')
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
    if (diffDays < 0) return 'border-l-red-500'
    if (diffDays <= 30) return 'border-l-amber-500'
    return 'border-l-green-500'
  }, [selectedClinic?.mtn_expiry])

  // ───────────────────── RENDER ─────────────────────

  return (
    <div className="max-w-5xl mx-auto pb-28 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Log Call</h1>
          <p className="text-[13px] text-text-tertiary mt-0.5">
            Record a new call or ticket{' · '}
            {editingCallDate ? (
              <input
                type="date"
                value={callDate}
                max={format(new Date(), 'yyyy-MM-dd')}
                onChange={(e) => {
                  setCallDate(e.target.value)
                  setEditingCallDate(false)
                }}
                onBlur={() => setEditingCallDate(false)}
                autoFocus
                className="inline-block px-1.5 py-0.5 bg-surface border border-border rounded text-xs text-text-primary
                           focus:outline-none focus:ring-1 focus:ring-accent"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingCallDate(true)}
                className={`inline-block hover:underline ${
                  callDate !== format(new Date(), 'yyyy-MM-dd')
                    ? 'text-amber-400 font-medium'
                    : 'text-text-tertiary'
                }`}
              >
                {callDate === format(new Date(), 'yyyy-MM-dd')
                  ? format(new Date(), 'dd MMM yyyy')
                  : format(new Date(callDate + 'T00:00:00'), 'dd MMM yyyy')}
              </button>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {drafts.length > 0 && (
            <span className="text-[11px] text-text-muted tabular-nums">{drafts.length} draft{drafts.length !== 1 ? 's' : ''}</span>
          )}
          <span className="text-sm text-text-secondary font-medium">{userName}</span>
        </div>
      </div>

      {/* Saved drafts — compact pills */}
      {drafts.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-[11px] text-text-muted uppercase tracking-wider font-medium">Drafts</span>
          {drafts.map(draft => (
            <button
              key={draft.id}
              onClick={() => handleLoadDraft(draft.id)}
              className={`inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg text-xs font-medium transition-all ${
                activeDraftId === draft.id
                  ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                  : 'bg-white/[0.03] text-text-secondary border border-border hover:border-text-muted hover:text-text-primary'
              }`}
            >
              <span className="truncate">{draft.label}</span>
              <span className="text-text-muted text-[10px]">{format(new Date(draft.savedAt), 'dd MMM HH:mm')}</span>
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); handleDeleteDraft(draft.id) }}
                className="p-0.5 rounded hover:bg-white/[0.08] hover:text-red-400 transition-colors"
              >
                <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Auto-restore banner */}
      {showAutoRestore && (
        <div className="flex items-center justify-between gap-3 mb-4 px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <span className="text-sm text-amber-300">Unsaved work detected. Restore?</span>
          <div className="flex gap-2">
            <button onClick={() => handleAutoRestore(false)} className="text-xs text-text-tertiary hover:text-text-primary px-2 py-1">
              Discard
            </button>
            <button onClick={() => handleAutoRestore(true)} className="text-xs font-medium text-amber-400 hover:text-amber-300 px-2 py-1 bg-amber-500/20 rounded">
              Restore
            </button>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm mb-4 flex items-start gap-2">
          <svg className="size-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          {error}
        </div>
      )}

      {/* ═══════ TWO-ZONE LAYOUT ═══════ */}
      <div className="lg:grid lg:grid-cols-5 lg:gap-6">

        {/* ═══════ LEFT: Form Column ═══════ */}
        <div className="lg:col-span-3">

          {/* ─── ZONE 1: Caller Details (inset bg) ─── */}
          <div className="rounded-xl p-4 space-y-4 mb-4 bg-surface-raised border border-border">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Caller Details</h2>
              <span className="text-[10px] text-text-muted">Search or enter manually</span>
            </div>

            {/* Clinic Search */}
            <div ref={clinicRef} className={fieldErrors.clinic ? 'ring-1 ring-red-500/50 rounded-lg' : ''}>
              <ClinicSearch onSelect={handleClinicSelect} onOpenTickets={handleOpenTickets} value={selectedClinic} />
            </div>

            {/* Open Ticket Banner — inline in form */}
            {showOpenTicketBanner && openTickets.length > 0 && selectedClinic && (
              <OpenTicketBanner
                tickets={openTickets}
                onAddToExisting={handleAddToExisting}
                onCreateNew={() => setShowOpenTicketBanner(false)}
              />
            )}

            {/* Clinic info card — visible on mobile, hidden on lg (shown in context panel) */}
            {selectedClinic && (
              <div className={`lg:hidden relative grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-surface-raised border border-border border-l-4 ${clinicBorderColor} rounded-xl shadow-theme-sm text-sm`}>
                <button
                  type="button"
                  onClick={() => setSelectedClinic(null)}
                  className="absolute -top-2.5 -right-2.5 p-1 text-text-secondary hover:text-text-primary bg-zinc-800 border border-zinc-600 rounded-full hover:bg-zinc-700 transition-colors"
                  title="Clear clinic"
                >
                  <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div>
                  <span className="text-text-tertiary text-xs">Code</span>
                  <p className="text-text-primary font-mono">{selectedClinic.clinic_code}</p>
                </div>
                <div>
                  <span className="text-text-tertiary text-xs">Phone</span>
                  <p className="text-text-primary">{selectedClinic.clinic_phone || '-'}</p>
                </div>
                <div>
                  <span className="text-text-tertiary text-xs">Product</span>
                  <p className="text-text-primary">{selectedClinic.product_type || '-'}</p>
                </div>
                <div>
                  <span className="text-text-tertiary text-xs">MTN Expiry</span>
                  <p className="text-text-primary flex items-center gap-2">
                    {selectedClinic.mtn_expiry ? selectedClinic.mtn_expiry.split('-').reverse().join('/') : '-'}
                    {selectedClinic.mtn_expiry && (() => {
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      const expiry = new Date(selectedClinic.mtn_expiry + 'T00:00:00')
                      const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
                      if (diffDays < 0) return <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">EXPIRED</span>
                      if (diffDays <= 30) return <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">EXPIRING</span>
                      return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium">ACTIVE</span>
                    })()}
                  </p>
                </div>
              </div>
            )}

            {/* Caller Tel */}
            <div>
              <Label>Caller Tel</Label>
              <Input
                type="tel"
                value={callerTel}
                onChange={(e) => setCallerTel(e.target.value)}
                placeholder="Phone number of whoever called"
              />
            </div>

            {/* PIC */}
            <div>
              <Label>Clinic PIC (Person In Charge)</Label>
              <Input
                type="text"
                value={pic}
                onChange={(e) => {
                  setPic(e.target.value)
                  if (e.target.value) setFieldErrors(prev => ({ ...prev, clinic: false }))
                }}
                placeholder="Contact person at the clinic"
                error={fieldErrors.clinic}
              />
              {selectedClinic?.registered_contact && (
                <p className="text-xs text-text-tertiary mt-1">
                  Registered contact: {selectedClinic.registered_contact}
                </p>
              )}
            </div>

            {/* Clinic WhatsApp */}
            <div>
              <Label>Clinic WhatsApp</Label>
              <div className="flex gap-2">
                <Input
                  type="tel"
                  value={clinicWa}
                  onChange={(e) => setClinicWa(e.target.value)}
                  placeholder="Clinic WhatsApp number"
                  className="flex-1"
                />
                {clinicWa.trim() && (
                  <a
                    href={`https://wa.me/${clinicWa.trim().replace(/\D/g, '').replace(/^0/, '60')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center px-3 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors shrink-0"
                    title="Chat on WhatsApp"
                  >
                    <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* ─── ZONE 2: Issue Details (main surface) ─── */}
          <div className="rounded-xl p-4 space-y-4 mb-6 card">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Issue Details</h2>
              <button
                type="button"
                onClick={loadKB}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors font-medium"
              >
                <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Fill from KB
              </button>
            </div>

            {/* Issue Category */}
            <div ref={issueCategoryRef} className={fieldErrors.issueCategory ? 'ring-1 ring-red-500/50 rounded-lg p-0.5 -m-0.5' : ''}>
              <PillSelector
                label="Category"
                required
                options={ISSUE_CATEGORIES.map(c => ({ value: c, label: c, colors: getIssueCategoryColor(c) }))}
                value={issueCategory}
                onChange={(v) => {
                  setIssueCategory(v)
                  setFieldErrors(prev => ({ ...prev, issueCategory: false }))
                }}
              />
            </div>

            {/* Issue Type */}
            <div ref={issueTypeRef} className={fieldErrors.issueType ? 'ring-1 ring-red-500/50 rounded-lg p-0.5 -m-0.5' : ''}>
              <IssueTypeSelect
                value={issueType}
                onChange={(v) => {
                  setIssueType(v)
                  setFieldErrors(prev => ({ ...prev, issueType: false }))
                }}
                required
              />
            </div>

            {/* Schedule fields */}
            {issueType === 'Schedule' && (
              <div className="space-y-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                <h4 className="text-sm font-medium text-blue-400 flex items-center gap-2">
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  Schedule Details
                </h4>
                {/* PIC Support — matches Schedule page */}
                <div>
                  <Label>PIC Support</Label>
                  <Input type="text" value={schedulePicSupport} onChange={(e) => setSchedulePicSupport(e.target.value)} placeholder="Support agent" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label required>Schedule Date</Label>
                    <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
                  </div>
                  <div>
                    <Label required>Schedule Time</Label>
                    <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label required>Schedule Type</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {SCHEDULE_TYPES.map((t) => {
                      const colors = SCHEDULE_TYPE_COLORS[t.value] || { bg: 'bg-zinc-500/20', text: 'text-zinc-400' }
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setScheduleType(scheduleType === t.value ? null : t.value)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                            scheduleType === t.value
                              ? `${colors.bg} ${colors.text} border-current/30`
                              : 'bg-surface-inset border-border text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          {t.label}
                          {t.duration && <span className="ml-1 opacity-60">({t.duration})</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {scheduleType === 'Others' && (
                  <div>
                    <Label>Custom Type</Label>
                    <Input type="text" value={customScheduleType} onChange={(e) => setCustomScheduleType(e.target.value)} placeholder="Describe the schedule type..." />
                  </div>
                )}
                <div>
                  <Label>Mode</Label>
                  <div className="flex gap-2">
                    {(['Onsite', 'Remote'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setScheduleMode(m)}
                        className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                          scheduleMode === m
                            ? m === 'Onsite'
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                            : 'bg-surface-inset border-border text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Schedule Notes */}
                <div>
                  <Label>Schedule Notes</Label>
                  <Textarea
                    value={scheduleNotes}
                    onChange={(e) => setScheduleNotes(e.target.value)}
                    rows={2}
                    placeholder="Additional notes for this schedule..."
                  />
                </div>
              </div>
            )}

            {/* Issue — required */}
            <div ref={issueRef}>
              <Label required>Issue</Label>
              <Textarea
                value={issue}
                onChange={(e) => {
                  setIssue(e.target.value)
                  if (e.target.value.trim()) setFieldErrors(prev => ({ ...prev, issue: false }))
                }}
                rows={3}
                placeholder="Describe the issue..."
                error={fieldErrors.issue}
              />
            </div>

            {/* Image Attachments */}
            <div>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || attachments.length >= MAX_ATTACHMENTS}
                  className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40"
                >
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                  {uploading ? 'Uploading...' : 'Attach Image'}
                </button>
                {attachments.length > 0 && (
                  <span className="text-xs text-text-tertiary">{attachments.length}/{MAX_ATTACHMENTS}</span>
                )}
                <span className="text-xs text-text-tertiary">or Ctrl+V to paste</span>
              </div>
              {(attachments.length > 0 || uploading) && (
                <div className="flex gap-2 mt-2">
                  {attachments.map((url, idx) => (
                    <div key={idx} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Attachment ${idx + 1}`}
                        className="size-16 object-cover rounded-lg border border-border cursor-pointer"
                        onClick={() => setLightboxUrl(url)}
                      />
                      <button
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {uploading && (
                    <div className="size-16 rounded-lg border border-border bg-surface-raised flex items-center justify-center animate-pulse">
                      <svg className="size-5 text-text-tertiary animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* My Response */}
            <div ref={myResponseRef} className={fieldErrors.myResponse ? 'ring-1 ring-red-500/50 rounded-lg p-0.5 -m-0.5' : ''}>
              <Label required>My Response</Label>
              <Textarea
                ref={responseRef}
                value={myResponse}
                onChange={(e) => {
                  setMyResponse(e.target.value)
                  setFieldErrors(prev => ({ ...prev, myResponse: false }))
                  const el = e.target
                  requestAnimationFrame(() => {
                    el.style.height = 'auto'
                    el.style.height = el.scrollHeight + 'px'
                  })
                }}
                rows={3}
                style={{ minHeight: '4.5rem', maxHeight: '20rem', overflow: 'auto' }}
                placeholder="What support did or told the clinic..."
                error={fieldErrors.myResponse}
              />
            </div>
          </div>

          {/* ─── ZONE 3: Logistics + Resolution (elevated) ─── */}
          <div className="rounded-xl p-4 space-y-5 mb-4 bg-surface-raised border border-border">
            <h2 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Logistics & Resolution</h2>

            {/* Call Duration */}
            <div ref={durationRef} className={fieldErrors.duration ? 'ring-1 ring-red-500/50 rounded-lg p-0.5 -m-0.5' : ''}>
              <Label required>Duration</Label>
              <div className="flex flex-wrap gap-1.5">
                {CALL_DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => {
                      setCallDuration(callDuration === d.value ? null : d.value)
                      if (callDuration !== d.value) setFieldErrors(prev => ({ ...prev, duration: false }))
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                      callDuration === d.value
                        ? 'bg-accent-muted border-accent/50 text-accent'
                        : 'bg-surface-inset border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Next Step */}
            <div>
              <Label>Next Step</Label>
              <Input type="text" value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="What happens next..." />
            </div>

            {/* Timeline from Customer */}
            <div>
              <Label>Timeline from Customer</Label>
              <Input type="text" value={timelineFromCustomer} onChange={(e) => setTimelineFromCustomer(e.target.value)} placeholder="Timeline stated by customer (optional)" />
            </div>

            {/* Internal Timeline */}
            <div>
              <Label>Internal Timeline</Label>
              <Input type="text" value={internalTimeline} onChange={(e) => setInternalTimeline(e.target.value)} placeholder='e.g. "By Hazleen: 06/04/2026" (optional)' />
            </div>

            {/* Need Team Check */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setNeedTeamCheck(!needTeamCheck)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  needTeamCheck ? 'bg-red-500' : 'bg-zinc-700'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  needTeamCheck ? 'translate-x-5' : ''
                }`} />
              </button>
              <span className={`text-sm ${needTeamCheck ? 'text-red-400 font-medium' : 'text-text-secondary'}`}>
                Need Team Check {needTeamCheck && '— NEEDS ATTENTION'}
              </span>
            </div>

            {/* Divider before Resolution */}
            <div className="pt-4 border-t border-border">
              <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-3">Resolution</h3>
            </div>

            {/* Status */}
            <div ref={statusRef} className={fieldErrors.status ? 'ring-1 ring-red-500/50 rounded-lg p-1 -m-1' : ''}>
              <PillSelector
                label="Status"
                required
                options={statusOptions}
                value={status}
                onChange={(v) => {
                  setStatus(v as TicketStatus)
                  setFieldErrors(prev => ({ ...prev, status: false }))
                }}
              />
            </div>

            {/* Jira Link */}
            {status === 'Escalated' && (
              <div ref={jiraLinkRef}>
                <Label required>Jira Link</Label>
                <Input
                  type="url"
                  value={jiraLink}
                  onChange={(e) => {
                    setJiraLink(e.target.value)
                    if (e.target.value.trim()) setFieldErrors(prev => ({ ...prev, jiraLink: false }))
                  }}
                  placeholder="https://medex.atlassian.net/browse/..."
                  error={fieldErrors.jiraLink}
                />
              </div>
            )}

            {/* Timeline Builder */}
            <TimelineBuilder
              agentName={userName}
              onChange={(data) => setTimelineData(data)}
              initialDate={callDate}
            />
          </div>

          {/* Desktop action buttons — sticky */}
          <div className="hidden md:flex gap-3 pt-4 sticky bottom-0 z-10 pb-2" style={{ background: 'linear-gradient(to top, var(--background) 60%, transparent)' }}>
            <Button onClick={handleSave} loading={saving} size="lg" className="flex-1">
              {saving ? 'Saving...' : 'Save Call Log'}
              <kbd className="ml-2 px-1.5 py-0.5 text-[10px] bg-white/10 rounded font-mono">Ctrl+Enter</kbd>
            </Button>
            <Button variant="ghost" size="lg" onClick={handleSaveDraft} className="border border-border">
              Draft
            </Button>
            <Button variant="secondary" size="lg" onClick={handleClear}>
              Clear
            </Button>
          </div>
        </div>

        {/* ═══════ RIGHT: Context Panel (desktop only) ═══════ */}
        <div className="hidden lg:block lg:col-span-2">
          <div className="sticky top-6 space-y-4">

            {/* Clinic Context Card */}
            {selectedClinic ? (
              <div className={`rounded-xl border border-border border-l-4 ${clinicBorderColor} p-4 space-y-3 bg-surface-raised`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Clinic Info</h3>
                  <button
                    type="button"
                    onClick={() => setSelectedClinic(null)}
                    className="text-text-muted hover:text-text-primary transition-colors p-0.5"
                    title="Clear clinic"
                  >
                    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div>
                  <p className="text-sm font-medium text-text-primary">{selectedClinic.clinic_name}</p>
                  <p className="text-xs text-text-tertiary font-mono mt-0.5">{selectedClinic.clinic_code}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-text-muted">Phone</span>
                    <p className="text-text-secondary">{selectedClinic.clinic_phone || '-'}</p>
                  </div>
                  <div>
                    <span className="text-text-muted">Product</span>
                    <p className="text-text-secondary">{selectedClinic.product_type || '-'}</p>
                  </div>
                  <div>
                    <span className="text-text-muted">MTN Start</span>
                    <p className="text-text-secondary">{selectedClinic.mtn_start ? selectedClinic.mtn_start.split('-').reverse().join('/') : '-'}</p>
                  </div>
                  <div>
                    <span className="text-text-muted">MTN Expiry</span>
                    <p className="text-text-secondary flex items-center gap-1">
                      {selectedClinic.mtn_expiry ? selectedClinic.mtn_expiry.split('-').reverse().join('/') : '-'}
                      {selectedClinic.mtn_expiry && (() => {
                        const today = new Date()
                        today.setHours(0, 0, 0, 0)
                        const expiry = new Date(selectedClinic.mtn_expiry + 'T00:00:00')
                        const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
                        if (diffDays < 0) return <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium text-[10px]">EXPIRED</span>
                        if (diffDays <= 30) return <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium text-[10px]">EXPIRING</span>
                        return <span className="px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-medium text-[10px]">ACTIVE</span>
                      })()}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-text-muted">Email</span>
                    <p className="text-text-secondary truncate">{selectedClinic.email_main || '-'}</p>
                  </div>
                  {selectedClinic.city && (
                    <div className="col-span-2">
                      <span className="text-text-muted">Location</span>
                      <p className="text-text-secondary">{selectedClinic.city}{selectedClinic.state ? `, ${selectedClinic.state}` : ''}</p>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCrmPanel(true)}
                    className="flex-1 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/10 hover:text-indigo-300 text-xs"
                  >
                    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                    </svg>
                    CRM
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLicenseKeyModal(true)}
                    className="flex-1 border border-blue-500/30 text-blue-400 hover:bg-blue-600/10 hover:text-blue-300 text-xs"
                  >
                    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                    </svg>
                    LK
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center bg-surface-raised">
                <svg className="size-8 mx-auto text-text-muted mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <p className="text-xs text-text-muted">Search a clinic to see details here</p>
              </div>
            )}

            {/* Recent activity for this clinic */}
            {selectedClinic && openTickets.length > 0 && (() => {
              const actualOpen = openTickets.filter(t => t.status !== 'Resolved').length
              const hasOpen = actualOpen > 0
              return (
                <div className={`rounded-xl border p-3 space-y-2 ${
                  hasOpen
                    ? 'border-amber-500/20'
                    : 'border-blue-500/15'
                }`} style={{ background: hasOpen ? 'rgba(245, 158, 11, 0.03)' : 'rgba(59, 130, 246, 0.03)' }}>
                  <h3 className={`text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
                    hasOpen ? 'text-amber-400' : 'text-blue-400'
                  }`}>
                    <span className={`size-1.5 rounded-full ${hasOpen ? 'bg-amber-400' : 'bg-blue-400'}`} />
                    {openTickets.length} Recent Record{openTickets.length !== 1 ? 's' : ''}
                    {hasOpen && <span className="text-amber-500">({actualOpen} open)</span>}
                  </h3>
                  {openTickets.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleAddToExisting(t.id)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors ${
                        hasOpen ? 'hover:bg-amber-500/10' : 'hover:bg-blue-500/10'
                      }`}
                    >
                      <p className="text-xs font-medium text-text-primary truncate">{t.issue}</p>
                      <p className="text-[10px] text-text-muted mt-0.5">
                        {t.ticket_ref} · {t.status} · {toProperCase(t.created_by_name)}
                      </p>
                    </button>
                  ))}
                </div>
              )
            })()}

            {/* Quick actions */}
            <div className="rounded-xl border border-border p-3 space-y-1.5 bg-surface-raised">
              <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Quick Actions</h3>
              <button
                type="button"
                onClick={loadKB}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-white/[0.03] transition-colors"
              >
                <svg className="size-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Load from Knowledge Base
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-white/[0.03] transition-colors"
              >
                <svg className="size-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                </svg>
                Save as Draft
              </button>
            </div>

            {/* Form progress */}
            <div className="rounded-xl border border-border p-3 bg-surface-raised">
              <h3 className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-2">Progress</h3>
              <div className="space-y-1.5">
                {[
                  { label: 'Clinic', filled: !!selectedClinic || !!pic },
                  { label: 'Issue Type', filled: !!issueType },
                  { label: 'Issue', filled: !!issue.trim() },
                  { label: 'Response', filled: !!myResponse.trim() },
                  { label: 'Status', filled: !!status },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-xs">
                    <span className={`size-1.5 rounded-full ${item.filled ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    <span className={item.filled ? 'text-text-secondary' : 'text-text-muted'}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile sticky action bar */}
      <div className="fixed bottom-16 left-0 right-0 md:hidden bg-background border-t border-border px-4 py-3 safe-bottom z-40">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <Button onClick={handleSave} loading={saving} size="lg" className="flex-1">
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button variant="ghost" size="lg" onClick={handleSaveDraft} className="border border-border px-3">
            Draft
          </Button>
          <Button variant="secondary" size="lg" onClick={handleClear} className="px-3">
            Clear
          </Button>
        </div>
      </div>

      {/* KB Modal */}
      {showKB && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="card rounded-2xl shadow-theme-lg w-full max-w-lg max-h-[85vh] sm:max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-text-primary">Knowledge Base</h3>
              <button onClick={() => setShowKB(false)} className="text-text-tertiary hover:text-text-primary p-2 -mr-2 transition-colors" aria-label="Close">
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-3 border-b border-border">
              <Input
                type="text"
                value={kbSearch}
                onChange={(e) => setKBSearch(e.target.value)}
                placeholder="Search KB..."
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredKB.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleKBSelect(entry)}
                  className="w-full text-left px-4 py-3 hover:bg-surface-raised border-b border-border/50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getIssueTypeColor(entry.issue_type).bg} ${getIssueTypeColor(entry.issue_type).text}`}>
                      {entry.issue_type}
                    </span>
                  </div>
                  <p className="text-sm text-text-primary">{entry.issue}</p>
                  <p className="text-xs text-text-tertiary mt-1">{entry.fix}</p>
                </button>
              ))}
              {filteredKB.length === 0 && (
                <p className="p-4 text-sm text-text-tertiary text-center">No entries found</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* License Key Request Modal */}
      {showLicenseKeyModal && selectedClinic && (
        <LicenseKeyModal
          clinic={selectedClinic}
          agentName={userName}
          onClose={() => setShowLicenseKeyModal(false)}
        />
      )}

      {/* CRM Profile Panel */}
      {showCrmPanel && selectedClinic && (
        <ClinicProfilePanel
          clinicCode={selectedClinic.clinic_code}
          onClose={() => setShowCrmPanel(false)}
          onClinicUpdated={() => {
            // Re-fetch clinic to update local state with CRM changes
            const refetch = async () => {
              const supabase = createClient()
              const { data } = await supabase.from('clinics').select('*').eq('clinic_code', selectedClinic.clinic_code).single()
              if (data) setSelectedClinic(data as Clinic)
            }
            refetch()
          }}
        />
      )}

      {/* Image Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Attachment preview"
            className="max-w-full max-h-[90vh] rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white"
          >
            <svg className="size-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
