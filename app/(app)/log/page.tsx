'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Clinic, OpenTicketWarning, IssueType, TicketStatus, Channel, KnowledgeBaseEntry } from '@/lib/types'
import { STATUSES, STATUS_COLORS, getIssueTypeColor, CALL_DURATIONS, SCHEDULE_TYPES, SCHEDULE_TYPE_COLORS } from '@/lib/constants'
import ClinicSearch from '@/components/ClinicSearch'
import OpenTicketBanner from '@/components/OpenTicketBanner'
import TimelineBuilder from '@/components/TimelineBuilder'
import PillSelector from '@/components/PillSelector'
import IssueTypeSelect from '@/components/IssueTypeSelect'
import WADraftModal from '@/components/WADraftModal'
import LicenseKeyModal from '@/components/LicenseKeyModal'
import Button from '@/components/ui/Button'
import { Input, Textarea, Label } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { format } from 'date-fns'

// WHY: Log Call form — spec Section 8. The most-used page (~80 times/day).
// Every field from the spec is here. Mobile-first layout for phone logging after hours.

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
  issueType: string | null
  issue: string
  myResponse: string
  nextStep: string
  timelineFromCustomer: string
  internalTimeline: string
  needTeamCheck: boolean
  status: TicketStatus | null
  jiraLink: string
}

const DRAFTS_KEY = 'medex-call-drafts'
const AUTOSAVE_KEY = 'medex-call-autosave'
const MAX_ATTACHMENTS = 5
function loadDrafts(): CallLogDraft[] {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]') }
  catch { return [] }
}
function persistDrafts(drafts: CallLogDraft[]) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
}

// Section header — groups related fields with subtle dividers
function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="pt-2 pb-1">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">{title}</h2>
      {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
    </div>
  )
}

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
  const [issueType, setIssueType] = useState<IssueType | null>(null)
  const [issue, setIssue] = useState('')
  const [myResponse, setMyResponse] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [timelineFromCustomer, setTimelineFromCustomer] = useState('')
  const [internalTimeline, setInternalTimeline] = useState('')
  const [needTeamCheck, setNeedTeamCheck] = useState(false)
  // WHY: Calls default to 'Resolved' — most calls are resolved on the spot.
  const [status, setStatus] = useState<TicketStatus | null>('Resolved')
  const [jiraLink, setJiraLink] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Schedule fields — shown when issueType === 'Schedule'
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduleType, setScheduleType] = useState<string | null>(null)
  const [customScheduleType, setCustomScheduleType] = useState('')
  const [scheduleMode, setScheduleMode] = useState<'Remote' | 'Onsite'>('Remote')

  // Timeline entry
  const [timelineData, setTimelineData] = useState<{
    entryDate: string; channel: Channel; notes: string; formattedString: string
  } | null>(null)

  // UI state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({})
  const [showWADraft, setShowWADraft] = useState(false)
  const [showLicenseKeyModal, setShowLicenseKeyModal] = useState(false)
  const responseRef = useRef<HTMLTextAreaElement>(null)
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
        // Auto-expand textarea after prefill renders
        requestAnimationFrame(() => {
          if (responseRef.current) {
            responseRef.current.style.height = 'auto'
            responseRef.current.style.height = responseRef.current.scrollHeight + 'px'
          }
        })
      }
      sessionStorage.removeItem('kb_prefill')
    }

    // Load saved drafts from localStorage
    setDrafts(loadDrafts())

    // Check for auto-saved form data (crash/tab close recovery)
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY)
      if (saved) {
        const data = JSON.parse(saved) as CallLogDraft
        // Only restore if there's meaningful data
        if (data.selectedClinic || data.pic || data.issue || data.callerTel) {
          setShowAutoRestore(true)
        }
      }
    } catch { /* ignore corrupt autosave */ }
  }, [])

  // Auto-restore handler
  const handleAutoRestore = (restore: boolean) => {
    if (restore) {
      try {
        const saved = localStorage.getItem(AUTOSAVE_KEY)
        if (saved) {
          const draft = JSON.parse(saved) as CallLogDraft
          setSelectedClinic(draft.selectedClinic)
          setCallerTel(draft.callerTel)
          setPic(draft.pic)
          setClinicWa(draft.clinicWa || '')
          setCallDuration(draft.callDuration)
          setIssueType(draft.issueType as IssueType | null)
          setIssue(draft.issue)
          setMyResponse(draft.myResponse)
          setNextStep(draft.nextStep)
          setTimelineFromCustomer(draft.timelineFromCustomer)
          setInternalTimeline(draft.internalTimeline)
          setNeedTeamCheck(draft.needTeamCheck)
          setStatus(draft.status)
          setJiraLink(draft.jiraLink)
          toast('Form restored')
        }
      } catch { /* ignore */ }
    }
    localStorage.removeItem(AUTOSAVE_KEY)
    setShowAutoRestore(false)
  }

  // Auto-save: debounce to localStorage every 5 seconds + save on beforeunload/visibilitychange
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Collect current form state into a draft-like object (for auto-save)
  const getFormSnapshot = useCallback((): CallLogDraft | null => {
    if (!selectedClinic && !pic && !issue && !callerTel) return null
    return {
      id: 'autosave',
      label: 'autosave',
      savedAt: new Date().toISOString(),
      selectedClinic, callerTel, pic, clinicWa,
      callDuration, issueType, issue, myResponse,
      nextStep, timelineFromCustomer, internalTimeline,
      needTeamCheck, status, jiraLink,
    }
  }, [selectedClinic, callerTel, pic, clinicWa, callDuration, issueType, issue,
      myResponse, nextStep, timelineFromCustomer, internalTimeline, needTeamCheck, status, jiraLink])

  // Debounced auto-save effect
  useEffect(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(() => {
      const snapshot = getFormSnapshot()
      if (snapshot) {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot))
      } else {
        localStorage.removeItem(AUTOSAVE_KEY)
      }
    }, 5000)
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current) }
  }, [getFormSnapshot])

  // Save immediately on tab close / visibility change
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

  // Handle clinic selection
  const handleClinicSelect = (clinic: Clinic) => {
    setSelectedClinic(clinic)
    setShowOpenTicketBanner(true)
    // Clear clinic-related field error
    setFieldErrors(prev => ({ ...prev, clinic: false }))
  }

  // Handle open ticket detection
  const handleOpenTickets = (tickets: OpenTicketWarning[]) => {
    setOpenTickets(tickets)
    setShowOpenTicketBanner(tickets.length > 0)
  }

  // Navigate to existing ticket
  const handleAddToExisting = (ticketId: string) => {
    router.push(`/tickets/${ticketId}`)
  }

  // Load KB entries
  const loadKB = async () => {
    const { data } = await supabase
      .from('knowledge_base')
      .select('*')
      .eq('status', 'published')
      .order('issue_type')
    if (data) setKBEntries(data)
    setShowKB(true)
  }

  // KB quick-fill — spec Section 8.5
  const handleKBSelect = (entry: KnowledgeBaseEntry) => {
    setIssue(entry.issue)
    setMyResponse(entry.fix)
    setIssueType(entry.issue_type)
    setShowKB(false)
    setFieldErrors(prev => ({ ...prev, issueType: false, issue: false }))
  }

  // WHY: useMemo prevents re-filtering 200+ KB entries on every keystroke render
  const filteredKB = useMemo(() => kbEntries.filter((e) =>
    kbSearch === '' ||
    e.issue.toLowerCase().includes(kbSearch.toLowerCase()) ||
    e.fix.toLowerCase().includes(kbSearch.toLowerCase()) ||
    e.issue_type.toLowerCase().includes(kbSearch.toLowerCase())
  ), [kbEntries, kbSearch])

  // Core upload logic — reusable for file input and clipboard paste
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

  // File input handler — thin wrapper around uploadFile
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await uploadFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  // Clipboard paste support — Ctrl+V screenshot uploads automatically
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Skip if a modal is open (lightbox, WA draft, license key, KB)
      if (lightboxUrl || showWADraft || showLicenseKeyModal || showKB) return
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
  }, [lightboxUrl, showWADraft, showLicenseKeyModal, showKB, uploadFile])

  // Save ticket
  const handleSave = useCallback(async () => {
    setError('')
    const errors: Record<string, boolean> = {}

    // Validate required fields with inline highlighting
    if (!selectedClinic && !pic) errors.clinic = true
    if (!issueType) errors.issueType = true
    if (!issue.trim()) errors.issue = true
    if (!status) errors.status = true
    if (status === 'Escalated' && !jiraLink.trim()) errors.jiraLink = true

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      // Build helpful error message
      const missing: string[] = []
      if (errors.clinic) missing.push('clinic or clinic PIC')
      if (errors.issueType) missing.push('issue type')
      if (errors.issue) missing.push('issue description')
      if (errors.status) missing.push('status')
      if (errors.jiraLink) missing.push('Jira link')
      setError(`Required: ${missing.join(', ')}`)
      return
    }

    setFieldErrors({})
    setSaving(true)

    // Insert record
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

    // Insert first timeline entry if data provided
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

    // Auto-save to schedules table when issue type is Schedule
    if (issueType === 'Schedule' && scheduleDate && scheduleTime && scheduleType) {
      const duration = SCHEDULE_TYPES.find(t => t.value === scheduleType)?.duration || ''
      await supabase.from('schedules').insert({
        clinic_code: selectedClinic?.clinic_code || 'MANUAL',
        clinic_name: selectedClinic?.clinic_name || pic || 'Unknown',
        pic: pic || null,
        schedule_date: scheduleDate,
        schedule_time: scheduleTime,
        schedule_type: scheduleType,
        custom_type: scheduleType === 'Others' ? customScheduleType || null : null,
        duration_estimate: duration || null,
        mode: scheduleMode,
        agent_name: userName,
        agent_id: userId,
        notes: issue.trim() || null,
        clinic_wa: clinicWa.trim() || null,
        source_ticket_id: ticket.id,
      })
    }

    // Auto-remove draft if this was loaded from one
    if (activeDraftId) {
      const updated = drafts.filter(d => d.id !== activeDraftId)
      persistDrafts(updated)
      setDrafts(updated)
    }

    // Clear auto-save on successful submit
    localStorage.removeItem(AUTOSAVE_KEY)

    // Redirect to ticket detail page (spec Section 8.6)
    router.push(`/tickets/${ticket.id}`)
  }, [selectedClinic, pic, issueType, issue, status, jiraLink, callerTel, callDuration,
      myResponse, nextStep, timelineFromCustomer, internalTimeline, needTeamCheck,
      timelineData, userId, userName, router, supabase, activeDraftId, drafts,
      scheduleDate, scheduleTime, scheduleType, customScheduleType, attachments])

  // Ctrl+Enter keyboard shortcut to save
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

  // Clear form (spec Section 8.6)
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
    setTimelineData(null)
    setError('')
    setFieldErrors({})
    setActiveDraftId(null)
    localStorage.removeItem(AUTOSAVE_KEY)
  }

  // Draft handlers — save partial forms for simultaneous calls
  const resetFormSilent = () => {
    setSelectedClinic(null)
    setOpenTickets([])
    setCallerTel('')
    setPic('')
    setClinicWa('')
    setCallDuration(null)
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
    setTimelineData(null)
    setError('')
    setFieldErrors({})
    setActiveDraftId(null)
  }

  const handleSaveDraft = () => {
    if (!selectedClinic && !pic && !issue && !callerTel) {
      toast('Nothing to save — form is empty', 'error')
      return
    }
    const draft: CallLogDraft = {
      id: crypto.randomUUID(),
      label: selectedClinic?.clinic_name || pic || 'Draft',
      savedAt: new Date().toISOString(),
      selectedClinic,
      callerTel,
      pic,
      clinicWa,
      callDuration,
      issueType,
      issue,
      myResponse,
      nextStep,
      timelineFromCustomer,
      internalTimeline,
      needTeamCheck,
      status,
      jiraLink,
    }
    const updated = [draft, ...drafts].slice(0, 10)
    persistDrafts(updated)
    setDrafts(updated)
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
    setIssueType(draft.issueType as IssueType | null)
    setIssue(draft.issue)
    setMyResponse(draft.myResponse)
    setNextStep(draft.nextStep)
    setTimelineFromCustomer(draft.timelineFromCustomer)
    setInternalTimeline(draft.internalTimeline)
    setNeedTeamCheck(draft.needTeamCheck)
    setStatus(draft.status)
    setJiraLink(draft.jiraLink)
    setActiveDraftId(draftId)
    setError('')
    setFieldErrors({})
  }

  const handleDeleteDraft = (draftId: string) => {
    const updated = drafts.filter(d => d.id !== draftId)
    persistDrafts(updated)
    setDrafts(updated)
    if (activeDraftId === draftId) setActiveDraftId(null)
  }

  const statusOptions = STATUSES.map((s) => ({
    value: s,
    label: s,
    colors: STATUS_COLORS[s],
  }))

  // Compute clinic info card left border color from MTN expiry
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

  return (
    <div className="max-w-2xl mx-auto pb-28 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold text-text-primary">Log Call</h1>
        <div className="text-sm text-text-secondary">
          Logged by: <span className="text-text-primary font-medium">{userName}</span>
        </div>
      </div>

      {/* Saved drafts — small pills below header */}
      {drafts.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-xs text-text-muted">Drafts:</span>
          {drafts.map(draft => (
            <button
              key={draft.id}
              onClick={() => handleLoadDraft(draft.id)}
              className={`inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium transition-colors ${
                activeDraftId === draft.id
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'bg-zinc-800 text-text-secondary border border-zinc-700 hover:border-zinc-500 hover:text-text-primary'
              }`}
            >
              <span>{draft.label}</span>
              <span className="text-text-muted">{format(new Date(draft.savedAt), 'HH:mm')}</span>
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); handleDeleteDraft(draft.id) }}
                className="p-0.5 rounded-full hover:bg-zinc-600/50 hover:text-red-400 transition-colors"
              >
                <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      )}
      {drafts.length === 0 && !showAutoRestore && <div className="mb-3" />}

      {/* Auto-restore banner — shown when auto-saved data exists from crash/tab close */}
      {showAutoRestore && (
        <div className="flex items-center justify-between gap-3 mb-4 px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
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

      <div className="space-y-5">

        {/* ─── SECTION: Caller Details ─── */}
        <SectionHeader title="Caller Details" description="Search clinic or enter manually" />

        {/* Clinic Search */}
        <div className={fieldErrors.clinic ? 'ring-1 ring-red-500/50 rounded-lg' : ''}>
          <ClinicSearch onSelect={handleClinicSelect} onOpenTickets={handleOpenTickets} value={selectedClinic} />
        </div>

        {/* Open Ticket Banner */}
        {showOpenTicketBanner && openTickets.length > 0 && selectedClinic && (
          <OpenTicketBanner
            clinicName={selectedClinic.clinic_name}
            tickets={openTickets}
            onAddToExisting={handleAddToExisting}
            onCreateNew={() => setShowOpenTicketBanner(false)}
          />
        )}

        {/* Clinic info display (after selection) */}
        {selectedClinic && (
          <div className={`relative grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-surface-raised border border-border border-l-4 ${clinicBorderColor} rounded-lg text-sm`}>
            <button
              type="button"
              onClick={() => setSelectedClinic(null)}
              className="absolute -top-2.5 -right-2.5 p-1 text-zinc-400 hover:text-white bg-zinc-800 border border-zinc-600 rounded-full hover:bg-zinc-700 transition-colors"
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
              <span className="text-text-tertiary text-xs">MTN Start</span>
              <p className="text-text-primary">{selectedClinic.mtn_start ? selectedClinic.mtn_start.split('-').reverse().join('/') : '-'}</p>
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
                  if (diffDays < 0) return <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">EXPIRED</span>
                  if (diffDays <= 30) return <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">EXPIRING</span>
                  return <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">ACTIVE</span>
                })()}
              </p>
            </div>
            <div>
              <span className="text-text-tertiary text-xs">Email</span>
              <p className="text-text-primary truncate" title={selectedClinic.email_main || undefined}>{selectedClinic.email_main || '-'}</p>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLicenseKeyModal(true)}
                className="w-full border border-blue-500/30 text-blue-400 hover:bg-blue-600/10 hover:text-blue-300"
              >
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
                Create License Key Request
              </Button>
            </div>
          </div>
        )}

        {/* Caller Tel — manual always (BR-02) */}
        <div>
          <Label>Caller Tel</Label>
          <Input
            type="tel"
            value={callerTel}
            onChange={(e) => setCallerTel(e.target.value)}
            placeholder="Phone number of whoever called"
          />
        </div>

        {/* PIC — manual always, registered_contact as hint (BR-02) */}
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
          {/* WHY hint: Spec says registered_contact shown as grey hint — NOT auto-filled */}
          {selectedClinic?.registered_contact && (
            <p className="text-xs text-text-tertiary mt-1">
              Registered contact: {selectedClinic.registered_contact}
            </p>
          )}
        </div>

        {/* Clinic WhatsApp */}
        <div>
          <Label>Clinic WhatsApp</Label>
          <Input
            type="tel"
            value={clinicWa}
            onChange={(e) => setClinicWa(e.target.value)}
            placeholder="Clinic WhatsApp number"
          />
        </div>

        {/* ─── SECTION: Issue Details ─── */}
        <div className="border-t border-border" />
        <SectionHeader title="Issue Details" />

        {/* Issue Type — searchable dropdown with custom type support */}
        <div className={fieldErrors.issueType ? 'ring-1 ring-red-500/50 rounded-lg p-0.5 -m-0.5' : ''}>
          <IssueTypeSelect
            value={issueType}
            onChange={(v) => {
              setIssueType(v)
              setFieldErrors(prev => ({ ...prev, issueType: false }))
            }}
            required
          />
        </div>

        {/* Schedule fields — auto-detect when issueType is Schedule */}
        {issueType === 'Schedule' && (
          <div className="space-y-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <h4 className="text-sm font-medium text-blue-400 flex items-center gap-2">
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              Schedule Details
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label required>Schedule Date</Label>
                <Input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                />
              </div>
              <div>
                <Label required>Schedule Time</Label>
                <Input
                  type="text"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  placeholder="e.g. 10AM, 2:30PM"
                />
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        scheduleType === t.value
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
            {scheduleType === 'Others' && (
              <div>
                <Label>Custom Type</Label>
                <Input
                  type="text"
                  value={customScheduleType}
                  onChange={(e) => setCustomScheduleType(e.target.value)}
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
                    onClick={() => setScheduleMode(m)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      scheduleMode === m
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
          </div>
        )}

        {/* KB Quick-fill button (spec Section 8.5) */}
        <div>
          <button
            type="button"
            onClick={loadKB}
            className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 transition-colors"
          >
            <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Load from Knowledge Base
          </button>
        </div>

        {/* KB Modal */}
        {showKB && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-2 sm:p-4">
            <div className="bg-surface border border-border rounded-xl w-full max-w-lg max-h-[85vh] sm:max-h-[80vh] flex flex-col">
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

        {/* Issue — textarea, required */}
        <div>
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
            <span className="text-xs text-text-tertiary">or Ctrl+V to paste screenshot</span>
          </div>
          {(attachments.length > 0 || uploading) && (
            <div className="flex gap-2 mt-2">
              {attachments.map((url, idx) => (
                <div key={idx} className="relative group">
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
        <div>
          <Label>My Response</Label>
          <Textarea
            ref={responseRef}
            value={myResponse}
            onChange={(e) => {
              setMyResponse(e.target.value)
              const el = e.target
              requestAnimationFrame(() => {
                el.style.height = 'auto'
                el.style.height = el.scrollHeight + 'px'
              })
            }}
            rows={3}
            style={{ minHeight: '4.5rem', maxHeight: '20rem', overflow: 'auto' }}
            placeholder="What support did or told the clinic..."
          />
        </div>

        {/* ─── SECTION: Logistics ─── */}
        <div className="border-t border-border" />
        <SectionHeader title="Logistics" />

        {/* Call Duration */}
        <div>
          <Label>Duration</Label>
          <div className="flex flex-wrap gap-1.5">
            {CALL_DURATIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setCallDuration(callDuration === d.value ? null : d.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  callDuration === d.value
                    ? 'bg-accent-muted border-accent/50 text-accent'
                    : 'bg-surface border-border text-text-secondary hover:text-text-primary'
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
          <Input
            type="text"
            value={nextStep}
            onChange={(e) => setNextStep(e.target.value)}
            placeholder="What happens next..."
          />
        </div>

        {/* Timeline from Customer */}
        <div>
          <Label>Timeline from Customer</Label>
          <Input
            type="text"
            value={timelineFromCustomer}
            onChange={(e) => setTimelineFromCustomer(e.target.value)}
            placeholder="Timeline stated by customer (optional)"
          />
        </div>

        {/* Internal Timeline */}
        <div>
          <Label>Internal Timeline</Label>
          <Input
            type="text"
            value={internalTimeline}
            onChange={(e) => setInternalTimeline(e.target.value)}
            placeholder='e.g. "By Hazleen: 06/04/2026" (optional)'
          />
        </div>

        {/* Need Team Check toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setNeedTeamCheck(!needTeamCheck)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              needTeamCheck ? 'bg-red-500' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                needTeamCheck ? 'translate-x-5' : ''
              }`}
            />
          </button>
          <span className={`text-sm ${needTeamCheck ? 'text-red-400 font-medium' : 'text-text-secondary'}`}>
            Need Team Check {needTeamCheck && '— NEEDS ATTENTION'}
          </span>
        </div>

        {/* ─── SECTION: Resolution ─── */}
        <div className="border-t border-border" />
        <SectionHeader title="Resolution" />

        {/* Status — pill select */}
        <div className={fieldErrors.status ? 'ring-1 ring-red-500/50 rounded-lg p-1 -m-1' : ''}>
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

        {/* Jira Link — only visible when Escalated (spec BR-06) */}
        {status === 'Escalated' && (
          <div>
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
        />

        {/* Desktop action buttons */}
        <div className="hidden md:flex gap-3 pt-4 border-t border-border">
          <Button onClick={handleSave} loading={saving} size="lg" className="flex-1">
            {saving ? 'Saving...' : 'Save Call Log'}
            <kbd className="ml-2 px-1.5 py-0.5 text-[10px] bg-white/10 rounded font-mono">Ctrl+Enter</kbd>
          </Button>
          <Button variant="ghost" size="lg" onClick={handleSaveDraft} className="border border-border">
            Save Draft
          </Button>
          <Button variant="success" size="lg" onClick={() => setShowWADraft(true)}>
            WA Draft
          </Button>
          <Button variant="secondary" size="lg" onClick={handleClear}>
            Clear
          </Button>
        </div>
      </div>

      {/* Mobile sticky action bar — stays visible when scrolling */}
      <div className="fixed bottom-16 left-0 right-0 md:hidden bg-background border-t border-border px-4 py-3 safe-bottom z-40">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <Button onClick={handleSave} loading={saving} size="lg" className="flex-1">
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button variant="ghost" size="lg" onClick={handleSaveDraft} className="border border-border px-3">
            Draft
          </Button>
          <Button variant="success" size="lg" onClick={() => setShowWADraft(true)} className="px-4">
            WA
          </Button>
          <Button variant="secondary" size="lg" onClick={handleClear} className="px-3">
            Clear
          </Button>
        </div>
      </div>

      {/* WA Draft Modal */}
      {showWADraft && (
        <WADraftModal
          ticket={{
            clinic_name: selectedClinic?.clinic_name || 'N/A',
            clinic_code: selectedClinic?.clinic_code || 'N/A',
            clinic_phone: selectedClinic?.clinic_phone,
            pic,
            issue_type: issueType || 'Others',
            issue: issue || 'N/A',
            my_response: myResponse,
            next_step: nextStep,
            status: status || 'In Progress',
          }}
          agentName={userName}
          onClose={() => setShowWADraft(false)}
          scheduleData={issueType === 'Schedule' && scheduleDate && scheduleTime ? {
            schedule_date: scheduleDate,
            schedule_time: scheduleTime,
            duration_estimate: SCHEDULE_TYPES.find(t => t.value === scheduleType)?.duration || 'TBD',
          } : undefined}
        />
      )}

      {/* License Key Request Modal */}
      {showLicenseKeyModal && selectedClinic && (
        <LicenseKeyModal
          clinic={selectedClinic}
          agentName={userName}
          onClose={() => setShowLicenseKeyModal(false)}
        />
      )}

      {/* Image Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
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
