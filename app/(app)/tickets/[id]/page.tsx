'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import type { Ticket, TimelineEntry, TicketStatus, Channel } from '@/lib/types'
import { STATUSES, STATUS_COLORS, CHANNEL_COLORS, getDurationLabel, formatWorkDuration, CALL_DURATIONS, ISSUE_CATEGORIES, ISSUE_TYPES, getIssueCategoryColor, toProperCase } from '@/lib/constants'
import { isStale } from '@/lib/staleDetection'
import StatusBadge from '@/components/StatusBadge'
import RecordTypeBadge from '@/components/RecordTypeBadge'
import { NeedsAttentionBadge, StaleBadge, IssueTypeBadge, IssueCategoryBadge } from '@/components/FlagBadge'
import PillSelector from '@/components/PillSelector'
import TimelineBuilder from '@/components/TimelineBuilder'

import { DetailSkeleton } from '@/components/Skeleton'
import Button from '@/components/ui/Button'
import { Input, Textarea, Label } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'

// WHY: Ticket Detail — spec Section 9.
// UPGRADE: Breadcrumb nav, two-column layout on lg, redesigned vertical timeline.

export default function TicketDetailPage() {
  const router = useRouter()
  const params = useParams()
  const ticketId = params.id as string
  const supabase = createClient()

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [auditEntries, setAuditEntries] = useState<{ action: string; changed_by: string; created_at: string; old_data: Record<string, unknown>; new_data: Record<string, unknown> }[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')
  const [linkedSchedule, setLinkedSchedule] = useState<{ actual_duration_minutes: number | null; duration_estimate: string | null } | null>(null)

  // UI state
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [showAddUpdate, setShowAddUpdate] = useState(false)
  const timelineDataRef = useRef<{ entryDate: string; channel: Channel; notes: string; formattedString: string } | null>(null)

  const [saving, setSaving] = useState(false)

  // Edit fields
  const [editIssue, setEditIssue] = useState('')
  const [editResponse, setEditResponse] = useState('')
  const [editNextStep, setEditNextStep] = useState('')
  const [editStatus, setEditStatus] = useState<TicketStatus | null>(null)
  const [editNeedCheck, setEditNeedCheck] = useState(false)
  const [editJiraLink, setEditJiraLink] = useState('')
  const [editPic, setEditPic] = useState('')
  const [editCallerTel, setEditCallerTel] = useState('')
  const [editTimelineFromCustomer, setEditTimelineFromCustomer] = useState('')
  const [editInternalTimeline, setEditInternalTimeline] = useState('')
  const [editIssueCategory, setEditIssueCategory] = useState<string | null>(null)
  const [editIssueType, setEditIssueType] = useState('')
  const [editDuration, setEditDuration] = useState<number | null>(null)

  // Timeline entry edit/delete state
  const [editingTimelineId, setEditingTimelineId] = useState<string | null>(null)
  const [editTimelineNotes, setEditTimelineNotes] = useState('')

  // Follow-up image attachments
  const MAX_UPDATE_ATTACHMENTS = 5
  const [updateAttachments, setUpdateAttachments] = useState<string[]>([])
  const [updateUploading, setUpdateUploading] = useState(false)
  const updateFileInputRef = useRef<HTMLInputElement>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  useEffect(() => {
    async function getUser() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      setUserId(session.user.id)
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', session.user.id)
        .single()
      if (profile) setUserName(profile.display_name)
    }
    getUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchTicket = async () => {
    const [ticketRes, timelineRes, auditRes] = await Promise.all([
      supabase.from('tickets').select('*').eq('id', ticketId).single(),
      supabase.from('timeline_entries').select('*').eq('ticket_id', ticketId)
        .order('entry_date', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase.from('audit_log').select('action, changed_by, created_at, old_data, new_data')
        .eq('record_id', ticketId).eq('table_name', 'tickets')
        .order('created_at', { ascending: false }),
    ])

    if (ticketRes.data) {
      const t = ticketRes.data
      setTicket(t as Ticket)
      setEditIssue(t.issue)
      setEditResponse(t.my_response || '')
      setEditNextStep(t.next_step || '')
      setEditStatus(t.status as TicketStatus)
      setEditNeedCheck(t.need_team_check)
      setEditJiraLink(t.jira_link || '')
      setEditPic(t.pic || '')
      setEditCallerTel(t.caller_tel || '')
      setEditTimelineFromCustomer(t.timeline_from_customer || '')
      setEditInternalTimeline(t.internal_timeline || '')
      setEditIssueCategory(t.issue_category || null)
      setEditIssueType(t.issue_type || '')
      setEditDuration(t.call_duration || null)
    }

    if (timelineRes.data) setTimeline(timelineRes.data as TimelineEntry[])
    if (auditRes.data) setAuditEntries(auditRes.data)

    // Fetch linked schedule (if this ticket was created from a schedule)
    const { data: schedData } = await supabase
      .from('schedules')
      .select('actual_duration_minutes, duration_estimate')
      .eq('source_ticket_id', ticketId)
      .limit(1)
      .maybeSingle()
    setLinkedSchedule(schedData)

    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo(0, 0); fetchTicket() }, [ticketId])

  // KB generation via AI
  const triggerKBGeneration = async (t: Ticket) => {
    if (!t.issue || !t.my_response) return
    toast('AI is generating KB article...', 'info')
    try {
      const res = await fetch('/api/generate-kb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: t.id, issue_type: t.issue_type,
          issue: t.issue, my_response: t.my_response,
          next_step: t.next_step, agent_name: userName,
        }),
      })
      toast(res.ok ? 'KB draft created! Review it in Knowledge Base.' : 'KB generation failed — you can add it manually.', res.ok ? 'success' : 'error')
    } catch {
      toast('KB generation failed — you can add it manually.', 'error')
    }
  }

  const handleSaveEdit = async () => {
    if (!ticket) return

    // Require Jira link when escalating
    if (editStatus === 'Escalated' && !editJiraLink.trim()) {
      toast('Jira link is required when escalating a ticket', 'error')
      return
    }

    setSaving(true)

    const changes: string[] = []
    if (editStatus !== ticket.status) changes.push(`Status: ${ticket.status} → ${editStatus}`)
    if (editIssue !== ticket.issue) changes.push('Issue updated')
    if ((editResponse || null) !== ticket.my_response) changes.push('Response updated')
    if ((editNextStep || null) !== ticket.next_step) changes.push('Next step updated')
    if ((editTimelineFromCustomer || null) !== ticket.timeline_from_customer) changes.push('Timeline updated')
    if ((editInternalTimeline || null) !== ticket.internal_timeline) changes.push('Internal timeline updated')
    if (editNeedCheck !== ticket.need_team_check) changes.push(editNeedCheck ? 'Flagged for attention' : 'Flag removed')
    if ((editIssueCategory || null) !== (ticket.issue_category || null)) changes.push(`Category: ${ticket.issue_category || 'None'} → ${editIssueCategory || 'None'}`)
    if (editIssueType !== ticket.issue_type) changes.push(`Type: ${ticket.issue_type} → ${editIssueType}`)
    if ((editDuration || null) !== (ticket.call_duration || null)) changes.push(`Duration: ${getDurationLabel(ticket.call_duration)} → ${getDurationLabel(editDuration)}`)

    const { error } = await supabase
      .from('tickets')
      .update({
        issue: editIssue,
        my_response: editResponse || null,
        next_step: editNextStep || null,
        timeline_from_customer: editTimelineFromCustomer || null,
        internal_timeline: editInternalTimeline || null,
        status: editStatus,
        need_team_check: editNeedCheck,
        issue_category: editIssueCategory || null,
        issue_type: editIssueType,
        call_duration: editDuration,
        jira_link: editJiraLink || null,
        pic: editPic || null,
        caller_tel: editCallerTel || null,
        last_updated_by: userId,
        last_updated_by_name: userName,
        last_change_note: changes.join(', ') || 'Details edited',
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', ticket.id)

    if (!error) {
      if (editStatus === 'Resolved' && ticket.status !== 'Resolved') {
        triggerKBGeneration({ ...ticket, issue: editIssue, my_response: editResponse || null, next_step: editNextStep || null })
      }
      setEditing(false)
      fetchTicket()
      toast('Ticket updated')
    } else {
      toast('Failed to save changes', 'error')
    }
    setSaving(false)
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!ticket) return
    // Block quick-escalate without Jira link — force edit mode
    if (newStatus === 'Escalated' && !ticket.jira_link?.trim()) {
      setEditing(true)
      setEditStatus('Escalated')
      toast('Please add a Jira link before escalating', 'error')
      return
    }
    await supabase
      .from('tickets')
      .update({
        status: newStatus,
        last_updated_by: userId,
        last_updated_by_name: userName,
        last_change_note: `Status: ${ticket.status} → ${newStatus}`,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', ticket.id)
    if (newStatus === 'Resolved' && ticket.status !== 'Resolved') {
      triggerKBGeneration(ticket)
    }
    fetchTicket()
  }

  // Follow-up fields (shown in Add Update form)
  const [followUpStatus, setFollowUpStatus] = useState<TicketStatus | null>(null)
  const [followUpResponse, setFollowUpResponse] = useState('')
  const [followUpTimeline, setFollowUpTimeline] = useState('')
  const [followUpInternal, setFollowUpInternal] = useState('')

  const handleAddUpdate = async (data: {
    entryDate: string; channel: Channel; notes: string; formattedString: string
  }) => {
    if (!ticket || !data.channel || !data.notes) return
    setSaving(true)
    await supabase.from('timeline_entries').insert({
      ticket_id: ticket.id,
      entry_date: data.entryDate,
      channel: data.channel,
      notes: data.formattedString || data.notes,
      added_by: userId,
      added_by_name: userName,
      attachment_urls: updateAttachments.length > 0 ? updateAttachments : [],
    })
    // Build ticket update — always update activity + audit
    const ticketUpdate: Record<string, unknown> = {
      last_activity_at: new Date().toISOString(),
      last_updated_by: userId,
      last_updated_by_name: userName,
      last_change_note: `Timeline update added (${data.channel})`,
    }
    // Optional: update status if agent changed it
    if (followUpStatus && followUpStatus !== ticket.status) {
      ticketUpdate.status = followUpStatus
      ticketUpdate.last_change_note = `Status → ${followUpStatus} (${data.channel})`
    }
    // Optional: append to my_response if agent added follow-up notes
    if (followUpResponse.trim()) {
      const existing = ticket.my_response || ''
      const timestamp = format(new Date(), 'dd/MM HH:mm')
      ticketUpdate.my_response = existing
        ? `${existing}\n\n[${timestamp} - ${userName}] ${followUpResponse.trim()}`
        : `[${timestamp} - ${userName}] ${followUpResponse.trim()}`
    }
    // Optional: update timeline fields
    if (followUpTimeline.trim()) {
      ticketUpdate.timeline_from_customer = followUpTimeline.trim()
    }
    if (followUpInternal.trim()) {
      ticketUpdate.internal_timeline = followUpInternal.trim()
    }
    // Append follow-up images to ticket's attachment_urls
    if (updateAttachments.length > 0) {
      const existing = ticket.attachment_urls || []
      ticketUpdate.attachment_urls = [...existing, ...updateAttachments]
    }
    await supabase.from('tickets').update(ticketUpdate).eq('id', ticket.id)
    setShowAddUpdate(false)
    setFollowUpStatus(null)
    setFollowUpResponse('')
    setFollowUpTimeline('')
    setFollowUpInternal('')
    setUpdateAttachments([])
    fetchTicket()
    setSaving(false)
    toast('Follow-up added')
  }

  const handleDeleteTimeline = async (entryId: string) => {
    if (!confirm('Delete this timeline entry?')) return
    const { error } = await supabase.from('timeline_entries').delete().eq('id', entryId)
    if (error) {
      toast('Failed to delete entry', 'error')
    } else {
      fetchTicket()
      toast('Timeline entry deleted')
    }
  }

  const handleSaveTimeline = async (entryId: string) => {
    if (!editTimelineNotes.trim()) return
    const { error } = await supabase.from('timeline_entries').update({ notes: editTimelineNotes.trim() }).eq('id', entryId)
    if (error) {
      toast('Failed to update entry', 'error')
    } else {
      setEditingTimelineId(null)
      fetchTicket()
      toast('Timeline entry updated')
    }
  }

  // ─── Follow-up image upload ───
  const uploadUpdateFile = useCallback(async (file: File) => {
    if (updateAttachments.length >= MAX_UPDATE_ATTACHMENTS) {
      toast(`Maximum ${MAX_UPDATE_ATTACHMENTS} images allowed`, 'error')
      return
    }
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg']
    if (!allowedTypes.includes(file.type)) {
      toast('Only PNG and JPG images are allowed', 'error')
      return
    }
    setUpdateUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { toast(data.error || 'Upload failed', 'error'); return }
      setUpdateAttachments(prev => [...prev, data.url])
      toast('Image attached', 'success')
    } catch {
      toast('Upload failed', 'error')
    } finally {
      setUpdateUploading(false)
    }
  }, [updateAttachments.length, toast])

  const handleUpdateFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadUpdateFile(file)
    if (updateFileInputRef.current) updateFileInputRef.current.value = ''
  }

  const removeUpdateAttachment = (idx: number) => {
    setUpdateAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  // Paste handler — only active when Add Update form is open
  useEffect(() => {
    if (!showAddUpdate) return
    const handlePaste = (e: ClipboardEvent) => {
      if (lightboxUrl) return
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault()
          const file = items[i].getAsFile()
          if (file) uploadUpdateFile(file)
          return
        }
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [showAddUpdate, lightboxUrl, uploadUpdateFile])

  const handleDelete = async () => {
    if (!ticket) return
    if (!confirm(`Delete ticket ${ticket.ticket_ref}? This cannot be undone.`)) return
    // Also delete any linked schedule that references this ticket
    await supabase.from('schedules').delete().eq('source_ticket_id', ticket.id)
    await supabase.from('tickets').delete().eq('id', ticket.id)
    router.push('/tickets')
  }

  const handlePromoteToTicket = async () => {
    if (!ticket) return
    if (!confirm(`Escalate ${ticket.ticket_ref} to a Ticket? The ref will change from CLG- to TKT-.`)) return
    const { error } = await supabase.rpc('promote_to_ticket', { p_ticket_id: ticket.id })
    if (error) { alert('Failed to promote: ' + error.message); return }
    if (ticket.status === 'Resolved') {
      await supabase.from('tickets').update({
        status: 'In Progress',
        last_updated_by: userId,
        last_updated_by_name: userName,
        last_activity_at: new Date().toISOString(),
      }).eq('id', ticket.id)
    }
    fetchTicket()
  }

  if (loading) return <DetailSkeleton />

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="text-3xl">🔍</div>
        <p className="text-text-secondary">Ticket not found</p>
        <Button variant="secondary" size="sm" onClick={() => router.push('/tickets')}>Go to History</Button>
      </div>
    )
  }

  const statusOptions = STATUSES.map((s) => ({
    value: s, label: s, colors: STATUS_COLORS[s],
  }))

  // Hero banner tint based on status
  const statusBannerStyle = (() => {
    switch (ticket.status) {
      case 'Escalated':
        return { background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.06) 0%, rgba(239, 68, 68, 0.02) 100%)', border: '1px solid rgba(239, 68, 68, 0.1)' }
      case 'Resolved':
        return { background: 'linear-gradient(135deg, rgba(52, 211, 153, 0.06) 0%, rgba(52, 211, 153, 0.02) 100%)', border: '1px solid rgba(52, 211, 153, 0.08)' }
      case 'In Progress':
        return { background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.06) 0%, rgba(99, 102, 241, 0.02) 100%)', border: '1px solid rgba(99, 102, 241, 0.08)' }
      default:
        return { background: 'var(--surface-raised)', border: '1px solid var(--border)' }
    }
  })()

  return (
    <div className="max-w-5xl mx-auto pb-20 md:pb-0">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm mb-4">
        <button onClick={() => router.back()} className="text-text-tertiary hover:text-text-primary transition-colors">
          History
        </button>
        <svg className="size-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-text-primary font-medium">{ticket.clinic_name}</span>
      </nav>

      {/* Hero banner header — status-tinted */}
      <div className="rounded-xl p-5 mb-6" style={statusBannerStyle}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-indigo-400">{ticket.clinic_code}</span>
              <span className="font-mono text-xs text-text-muted">{ticket.ticket_ref}</span>
            </div>
            <h1 className="text-2xl font-bold text-text-primary">{ticket.clinic_name}</h1>
          </div>
          {/* Inline status change */}
          {!editing && (
            <div className="flex-shrink-0">
              <select
                value={ticket.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="text-sm font-medium rounded-lg px-3 py-1.5 bg-surface-inset border border-border text-text-primary cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap mt-3">
          <button
            onClick={async () => {
              if (ticket.record_type === 'call') {
                if (!confirm(`Escalate to Ticket? The ref will change from CLG- to TKT-.`)) return
                const { error } = await supabase.rpc('promote_to_ticket', { p_ticket_id: ticket.id })
                if (error) { alert('Failed: ' + error.message); return }
              } else {
                if (!confirm(`Revert to Call Log? The ref will change from TKT- to CLG-.`)) return
                const { error } = await supabase.rpc('demote_to_call', { p_ticket_id: ticket.id })
                if (error) { alert('Failed: ' + error.message); return }
              }
              const changeLabel = ticket.record_type === 'call' ? 'Escalated to Ticket' : 'Reverted to Call Log'
              await supabase.from('tickets').update({
                last_updated_by: userId, last_updated_by_name: userName,
                last_change_note: changeLabel, last_activity_at: new Date().toISOString(),
              }).eq('id', ticket.id)
              fetchTicket()
            }}
            title="Click to toggle Call Log / Ticket"
            className="cursor-pointer"
          >
            <RecordTypeBadge recordType={ticket.record_type} />
          </button>
          <StatusBadge status={ticket.status} />
          {ticket.issue_category && <IssueCategoryBadge category={ticket.issue_category} />}
          <IssueTypeBadge issueType={ticket.issue_type} />
          {ticket.need_team_check && <NeedsAttentionBadge />}
          {isStale(ticket) && <StaleBadge />}
        </div>
        <div className="flex items-center gap-3 mt-2 text-sm text-text-secondary flex-wrap">
          {(ticket.city || ticket.state) && (
            <span className="text-text-tertiary">{[ticket.city, ticket.state].filter(Boolean).join(', ')}</span>
          )}
          {ticket.mtn_expiry && (() => {
            const today = new Date(); today.setHours(0, 0, 0, 0)
            const expiry = new Date(ticket.mtn_expiry + 'T00:00:00')
            const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
            const label = diffDays < 0 ? 'EXPIRED' : diffDays <= 30 ? 'EXPIRING' : 'ACTIVE'
            const color = diffDays < 0 ? 'bg-red-500/20 text-red-400' : diffDays <= 30 ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'
            return (
              <>
                <span className="text-text-tertiary">MTN: {ticket.mtn_expiry.split('-').reverse().join('/')}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span>
              </>
            )
          })()}
        </div>
      </div>

      {/* Two-column layout on lg */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* Left column (60%) — Issue details + Timeline */}
        <div className="flex-1 lg:w-3/5 space-y-4">

          {/* Details Section */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-text-secondary">Details</h2>
              {!editing ? (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveEdit} loading={saving}>Save</Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-text-tertiary text-xs">Caller Tel</span>
                {editing ? (
                  <Input value={editCallerTel} onChange={(e) => setEditCallerTel(e.target.value)} className="mt-1" />
                ) : (
                  <p className="text-text-primary mt-1">{ticket.caller_tel || '-'}</p>
                )}
              </div>
              <div>
                <span className="text-text-tertiary text-xs">PIC</span>
                {editing ? (
                  <Input value={editPic} onChange={(e) => setEditPic(e.target.value)} className="mt-1" />
                ) : (
                  <p className="text-text-primary mt-1">{ticket.pic || '-'}</p>
                )}
              </div>
              <div>
                <span className="text-text-tertiary text-xs">Phone</span>
                <p className="text-text-primary mt-1">{ticket.clinic_phone || '-'}</p>
              </div>
              <div>
                <span className="text-text-tertiary text-xs">Duration</span>
                {editing ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {CALL_DURATIONS.map(d => (
                      <button key={d.value} type="button" onClick={() => setEditDuration(editDuration === d.value ? null : d.value)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${editDuration === d.value ? 'bg-violet-500/20 text-violet-300 border-violet-500/50' : 'bg-surface border-border text-text-secondary hover:border-violet-500/30'}`}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                ) : linkedSchedule?.actual_duration_minutes ? (
                  <div className="mt-1">
                    <p className="text-text-primary">{formatWorkDuration(linkedSchedule.actual_duration_minutes)}</p>
                    {linkedSchedule.duration_estimate && (
                      <p className="text-xs text-text-muted">Est: {linkedSchedule.duration_estimate}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-text-primary mt-1">{getDurationLabel(ticket.call_duration)}</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <span className="text-text-tertiary text-xs">Issue</span>
                {editing ? (
                  <Textarea value={editIssue} onChange={(e) => setEditIssue(e.target.value)} rows={3} className="mt-1" />
                ) : (
                  <p className="text-text-primary mt-1 whitespace-pre-wrap">{ticket.issue}</p>
                )}
                {!editing && ticket.attachment_urls?.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {ticket.attachment_urls.map((url, idx) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={idx} src={url} alt={`Attachment ${idx + 1}`} className="size-20 object-cover rounded-lg border border-border hover:border-accent transition-colors cursor-pointer" onClick={() => setLightboxUrl(url)} />
                    ))}
                  </div>
                )}
              </div>
              <div className="sm:col-span-2">
                <span className="text-text-tertiary text-xs">My Response</span>
                {editing ? (
                  <Textarea value={editResponse} onChange={(e) => setEditResponse(e.target.value)} rows={3} className="mt-1" />
                ) : (
                  <p className="text-text-primary mt-1 whitespace-pre-wrap">{ticket.my_response || '-'}</p>
                )}
              </div>
              <div>
                <span className="text-text-tertiary text-xs">Next Step</span>
                {editing ? (
                  <Input value={editNextStep} onChange={(e) => setEditNextStep(e.target.value)} className="mt-1" />
                ) : (
                  <p className="text-text-primary mt-1">{ticket.next_step || '-'}</p>
                )}
              </div>
              <div>
                <span className="text-text-tertiary text-xs">Logged By</span>
                <p className="text-text-primary mt-1">{toProperCase(ticket.created_by_name)}</p>
              </div>
              <div>
                <span className="text-text-tertiary text-xs">Timeline from Customer</span>
                {editing ? (
                  <Input value={editTimelineFromCustomer} onChange={(e) => setEditTimelineFromCustomer(e.target.value)} className="mt-1" placeholder="Timeline stated by customer" />
                ) : (
                  <p className="text-text-primary mt-1">{ticket.timeline_from_customer || '-'}</p>
                )}
              </div>
              <div>
                <span className="text-text-tertiary text-xs">Internal Timeline</span>
                {editing ? (
                  <Input value={editInternalTimeline} onChange={(e) => setEditInternalTimeline(e.target.value)} className="mt-1" placeholder='e.g. "By Hazleen: 06/04/2026"' />
                ) : (
                  <p className="text-text-primary mt-1">{ticket.internal_timeline || '-'}</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <span className="text-text-tertiary text-xs">Jira Link</span>
                {editing ? (
                  <Input value={editJiraLink} onChange={(e) => setEditJiraLink(e.target.value)} className="mt-1" placeholder="https://medex.atlassian.net/browse/..." />
                ) : ticket.jira_link ? (
                  <p className="mt-1">
                    <a href={ticket.jira_link} target="_blank" rel="noopener noreferrer"
                      className="text-accent hover:text-accent-hover text-sm underline break-all">
                      {ticket.jira_link}
                    </a>
                  </p>
                ) : (
                  <p className="text-text-primary mt-1">-</p>
                )}
              </div>
            </div>

            {/* Status + flag toggle in edit mode */}
            {editing && (
              <div className="mt-4 space-y-3 pt-4 border-t border-border">
                {/* Issue Category */}
                <div>
                  <Label>Issue Category</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <button
                      onClick={() => setEditIssueCategory(null)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        !editIssueCategory ? 'bg-zinc-500/30 text-zinc-300 ring-1 ring-zinc-500/50' : 'bg-surface-raised text-text-tertiary hover:text-text-primary'
                      }`}
                    >
                      None
                    </button>
                    {ISSUE_CATEGORIES.map(cat => {
                      const colors = getIssueCategoryColor(cat)
                      return (
                        <button
                          key={cat}
                          onClick={() => setEditIssueCategory(cat)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                            editIssueCategory === cat ? `${colors.bg} ${colors.text} ring-1 ring-current/30` : 'bg-surface-raised text-text-tertiary hover:text-text-primary'
                          }`}
                        >
                          {cat}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {/* Issue Type */}
                <div>
                  <Label>Issue Type</Label>
                  <select
                    value={editIssueType}
                    onChange={(e) => setEditIssueType(e.target.value)}
                    className="mt-1 w-full px-3 py-1.5 bg-surface-inset border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {ISSUE_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <PillSelector label="Status" options={statusOptions} value={editStatus}
                  onChange={(v) => setEditStatus(v as TicketStatus)} />
                {editStatus === 'Escalated' && !editJiraLink.trim() && (
                  <p className="text-xs text-red-400">Jira link is required when escalating</p>
                )}
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setEditNeedCheck(!editNeedCheck)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${editNeedCheck ? 'bg-red-500' : 'bg-zinc-700'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${editNeedCheck ? 'translate-x-5' : ''}`} />
                  </button>
                  <span className={`text-sm ${editNeedCheck ? 'text-red-400' : 'text-text-secondary'}`}>
                    Need Team Check
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Timeline — visual centerpiece, chat-log feel */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-text-secondary tracking-wide uppercase">
                Timeline
                <span className="ml-2 text-text-muted font-normal normal-case tracking-normal">
                  {timeline.length} {timeline.length === 1 ? 'entry' : 'entries'}
                </span>
              </h2>
              <Button size="sm" onClick={() => setShowAddUpdate(!showAddUpdate)}>
                {showAddUpdate ? 'Cancel' : '+ Add Update'}
              </Button>
            </div>

            {/* Add Follow-up form */}
            {showAddUpdate && (
              <div className="mb-5 p-4 rounded-xl border border-indigo-500/20" style={{ background: 'rgba(99, 102, 241, 0.04)' }}>
                <TimelineBuilder
                  agentName={userName}
                  onChange={(data) => {
                    timelineDataRef.current = data
                  }}
                />
                {/* Optional: Update status */}
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-xs text-text-muted mb-2">Update status? <span className="text-text-tertiary">(optional)</span></p>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUSES.map((s) => {
                      const colors = STATUS_COLORS[s]
                      const isActive = followUpStatus === s
                      const isCurrent = ticket.status === s && !followUpStatus
                      return (
                        <button key={s} type="button"
                          onClick={() => setFollowUpStatus(isActive ? null : s)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                            isActive ? `${colors.bg} ${colors.text} ring-1 ring-current` :
                            isCurrent ? `${colors.bg} ${colors.text} opacity-50` :
                            'bg-zinc-800/50 text-zinc-400 hover:opacity-80'
                          }`}
                        >
                          {s}{isCurrent ? ' (current)' : ''}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {/* Optional: Append to response */}
                <div className="mt-3">
                  <p className="text-xs text-text-muted mb-1">Add to response <span className="text-text-tertiary">(optional)</span></p>
                  <textarea
                    value={followUpResponse}
                    onChange={(e) => setFollowUpResponse(e.target.value)}
                    placeholder="Additional response or notes to append..."
                    rows={2}
                    className="w-full px-3 py-2 bg-surface-inset border border-border rounded-lg text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-indigo-500/50 resize-none"
                  />
                </div>
                {/* Image attachments */}
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => updateFileInputRef.current?.click()}
                      disabled={updateAttachments.length >= MAX_UPDATE_ATTACHMENTS || updateUploading}
                      className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-1 disabled:opacity-40 transition-colors"
                    >
                      <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                      Attach Image
                    </button>
                    <span className="text-xs text-text-muted">or Ctrl+V to paste</span>
                    {updateAttachments.length > 0 && (
                      <span className="text-xs text-text-tertiary">{updateAttachments.length}/{MAX_UPDATE_ATTACHMENTS}</span>
                    )}
                    <input ref={updateFileInputRef} type="file" accept="image/*" hidden onChange={handleUpdateFileUpload} />
                  </div>
                  {(updateAttachments.length > 0 || updateUploading) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {updateAttachments.map((url, i) => (
                        <div key={i} className="relative group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`Attachment ${i + 1}`} className="w-16 h-16 rounded-lg object-cover cursor-pointer border border-border hover:border-accent transition-colors" onClick={() => setLightboxUrl(url)} />
                          <button onClick={() => removeUpdateAttachment(i)} className="absolute -top-1.5 -right-1.5 size-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            &times;
                          </button>
                        </div>
                      ))}
                      {updateUploading && <div className="w-16 h-16 rounded-lg skeleton" />}
                    </div>
                  )}
                </div>
                {/* Optional: Timeline fields */}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-text-muted mb-1">Timeline from customer <span className="text-text-tertiary">(optional)</span></p>
                    <input
                      value={followUpTimeline}
                      onChange={(e) => setFollowUpTimeline(e.target.value)}
                      placeholder="Timeline stated by customer"
                      className="w-full px-3 py-2 bg-surface-inset border border-border rounded-lg text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-text-muted mb-1">Internal timeline <span className="text-text-tertiary">(optional)</span></p>
                    <input
                      value={followUpInternal}
                      onChange={(e) => setFollowUpInternal(e.target.value)}
                      placeholder='e.g. "By Hazleen: 06/04/2026"'
                      className="w-full px-3 py-2 bg-surface-inset border border-border rounded-lg text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    />
                  </div>
                </div>
                <Button
                  onClick={() => {
                    const data = timelineDataRef.current
                    if (!data || !data.channel || !data.notes) {
                      toast('Please select a channel and enter notes', 'error')
                      return
                    }
                    handleAddUpdate(data)
                  }}
                  loading={saving}
                  size="sm"
                  className="mt-3"
                >
                  Save Follow-up
                </Button>
              </div>
            )}

            {/* Timeline entries — channel-colored left border, chat-log style */}
            {timeline.length === 0 ? (
              <div className="text-center py-10 rounded-xl border border-dashed border-border">
                <svg className="size-8 text-text-muted mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-sm text-text-tertiary">No timeline entries yet</p>
                <p className="text-xs text-text-muted mt-1">Click &quot;+ Add Update&quot; to record an interaction</p>
              </div>
            ) : (
              <div className="space-y-2">
                {timeline.map((entry, i) => {
                  const channelColor = CHANNEL_COLORS[entry.channel as Channel] || { bg: 'bg-gray-500/20', text: 'text-gray-400' }

                  // Channel-specific left border color
                  const borderColor = (() => {
                    switch (entry.channel) {
                      case 'Call': return 'border-l-blue-400/60'
                      case 'WhatsApp': return 'border-l-green-400/60'
                      case 'Email': return 'border-l-purple-400/60'
                      case 'Internal': return 'border-l-gray-400/40'
                      default: return 'border-l-gray-400/40'
                    }
                  })()

                  // Check if this is a new date compared to previous entry
                  const prevDate = i > 0 ? format(new Date(timeline[i - 1].entry_date), 'yyyy-MM-dd') : null
                  const thisDate = format(new Date(entry.entry_date), 'yyyy-MM-dd')
                  const showDateBadge = thisDate !== prevDate

                  return (
                    <div key={entry.id}>
                      {/* Date separator */}
                      {showDateBadge && (
                        <div className={`flex items-center gap-3 ${i > 0 ? 'mt-4' : ''} mb-2`}>
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                            {format(new Date(entry.entry_date), 'dd MMM yyyy')}
                          </span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      )}

                      {/* Entry — card with channel-colored left border */}
                      <div className={`group rounded-lg border-l-[3px] ${borderColor} transition-colors bg-surface-raised`}>
                        <div className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${channelColor.bg} ${channelColor.text} font-medium`}>
                              {entry.channel}
                            </span>
                            <span className="text-xs text-text-muted">{toProperCase(entry.added_by_name)}</span>
                            <span className="text-xs text-text-muted tabular-nums ml-auto">
                              {format(new Date(entry.created_at), 'HH:mm')}
                            </span>
                            {/* Edit/Delete buttons — visible on hover */}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                              <button
                                onClick={() => { setEditingTimelineId(entry.id); setEditTimelineNotes(entry.notes) }}
                                className="p-1 text-text-muted hover:text-text-primary rounded hover:bg-surface-inset transition-colors"
                                title="Edit"
                              >
                                <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDeleteTimeline(entry.id)}
                                className="p-1 text-text-muted hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"
                                title="Delete"
                              >
                                <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          {editingTimelineId === entry.id ? (
                            <div className="mt-2">
                              <input
                                type="text"
                                value={editTimelineNotes}
                                onChange={(e) => setEditTimelineNotes(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTimeline(entry.id); if (e.key === 'Escape') setEditingTimelineId(null) }}
                                className="w-full px-2 py-1.5 bg-surface-inset border border-border rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                autoFocus
                              />
                              <div className="flex gap-2 mt-2">
                                <Button size="sm" onClick={() => handleSaveTimeline(entry.id)}>Save</Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingTimelineId(null)}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-text-primary mt-1.5 whitespace-pre-wrap leading-relaxed">{entry.notes}</p>
                          )}
                          {entry.attachment_urls && entry.attachment_urls.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {entry.attachment_urls.map((url, imgIdx) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={imgIdx} src={url} alt={`Attachment ${imgIdx + 1}`} className="w-12 h-12 rounded object-cover cursor-pointer border border-border hover:border-accent transition-colors" onClick={() => setLightboxUrl(url)} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column (40%) — Status, Actions, Audit */}
        <div className="lg:w-2/5 space-y-4">

          {/* Status Quick Change — pill selector for desktop */}
          {!editing && (
            <div className="hidden lg:block card p-4">
              <PillSelector
                label="Status"
                options={statusOptions}
                value={ticket.status}
                onChange={handleStatusChange}
              />
            </div>
          )}

          {/* Actions — desktop only (mobile uses fixed bar) */}
          <div className="hidden md:block card p-4 space-y-2">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Actions</h2>
            <Button variant="secondary" size="sm" onClick={() => {
              sessionStorage.setItem('clinic_prefill', JSON.stringify({
                clinic_code: ticket.clinic_code,
                caller_tel: ticket.caller_tel,
                pic: ticket.pic,
              }))
              router.push('/log')
            }} className="w-full justify-start">
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Same Clinic, New Issue
            </Button>
            {ticket.record_type === 'call' && (
              <Button variant="secondary" size="sm" onClick={handlePromoteToTicket} className="w-full justify-start">
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                Escalate to Ticket
              </Button>
            )}
            <a
              href={ticket.caller_tel?.trim()
                ? `https://wa.me/${ticket.caller_tel.trim().replace(/\D/g, '').replace(/^0/, '60')}`
                : undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={`w-full justify-center inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 border ${
                ticket.caller_tel?.trim()
                  ? 'bg-surface border-border text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 shadow-theme-sm active:translate-y-px cursor-pointer'
                  : 'bg-surface border-border text-text-muted cursor-not-allowed opacity-50'
              }`}
              onClick={(e) => { if (!ticket.caller_tel?.trim()) e.preventDefault() }}
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.29-1.243l-.307-.184-2.87.853.853-2.87-.184-.307A8 8 0 1112 20z"/>
              </svg>
              WhatsApp
            </a>
            {ticket.issue && (
              <Button variant="secondary" size="sm" onClick={() => triggerKBGeneration(ticket)} className="w-full justify-start">
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                KB Draft
              </Button>
            )}
            <div className="pt-2 border-t border-border mt-2">
              <Button variant="danger" size="sm" onClick={handleDelete} className="w-full justify-start">
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </Button>
            </div>
          </div>

          {/* Audit Info — queries actual audit_log table for full history */}
          <div className="card p-4">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Audit Trail</h2>
            <div className="space-y-3 text-xs text-text-tertiary max-h-64 overflow-y-auto">
              {auditEntries.length > 0 ? (
                auditEntries.map((entry, i) => {
                  const isInsert = entry.action === 'INSERT'
                  const isDelete = entry.action === 'DELETE'
                  let summary = ''
                  if (isInsert) {
                    summary = 'Ticket created'
                  } else if (isDelete) {
                    summary = 'Ticket deleted'
                  } else if (entry.old_data && entry.new_data) {
                    const changes: string[] = []
                    if (entry.old_data.status !== entry.new_data.status) {
                      changes.push(`Status: ${entry.old_data.status} → ${entry.new_data.status}`)
                    }
                    if (entry.old_data.my_response !== entry.new_data.my_response) {
                      changes.push('Response updated')
                    }
                    if (entry.old_data.next_step !== entry.new_data.next_step) {
                      changes.push('Next step updated')
                    }
                    if (entry.old_data.issue !== entry.new_data.issue) {
                      changes.push('Issue updated')
                    }
                    if (entry.old_data.need_team_check !== entry.new_data.need_team_check) {
                      changes.push(entry.new_data.need_team_check ? 'Flagged for team check' : 'Team check flag removed')
                    }
                    if (entry.old_data.jira_link !== entry.new_data.jira_link) {
                      changes.push('Jira link updated')
                    }
                    if (entry.old_data.timeline_from_customer !== entry.new_data.timeline_from_customer) {
                      changes.push('Customer timeline updated')
                    }
                    if (entry.old_data.internal_timeline !== entry.new_data.internal_timeline) {
                      changes.push('Internal timeline updated')
                    }
                    summary = changes.length > 0 ? changes.join(', ') : 'Details edited'
                  } else {
                    summary = (entry.new_data?.last_change_note as string) || 'Updated'
                  }
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <div className={`size-1.5 rounded-full flex-shrink-0 mt-1 ${isInsert ? 'bg-green-400/60' : isDelete ? 'bg-red-400/60' : 'bg-blue-400/60'}`} />
                      <div>
                        <span>{format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm')} by <span className="text-text-secondary">{toProperCase(entry.changed_by)}</span></span>
                        <p className="text-text-muted mt-0.5">{summary}</p>
                      </div>
                    </div>
                  )
                })
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="size-1.5 rounded-full bg-green-400/60 flex-shrink-0" />
                    <span>Created {format(new Date(ticket.created_at), 'dd/MM/yyyy HH:mm')} by <span className="text-text-secondary">{toProperCase(ticket.created_by_name)}</span></span>
                  </div>
                  {ticket.last_updated_by_name && (
                    <div className="flex items-start gap-2">
                      <div className="size-1.5 rounded-full bg-blue-400/60 flex-shrink-0 mt-1" />
                      <div>
                        <span>Updated {format(new Date(ticket.updated_at), 'dd/MM/yyyy HH:mm')} by <span className="text-text-secondary">{toProperCase(ticket.last_updated_by_name!)}</span></span>
                        {ticket.last_change_note && (
                          <p className="text-text-muted mt-0.5">{ticket.last_change_note}</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile fixed action bar */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden z-30 border-t border-border"
        style={{ background: 'rgba(11, 13, 20, 0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
        <div className="flex items-center justify-around px-2 py-2 max-w-lg mx-auto">
          <button onClick={() => setEditing(true)} className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-text-tertiary hover:text-text-primary transition-colors">
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span className="text-[10px]">Edit</span>
          </button>
          <button onClick={() => setShowAddUpdate(true)} className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-indigo-400 hover:text-indigo-300 transition-colors">
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="text-[10px] font-medium">Update</span>
          </button>
          {ticket.caller_tel?.trim() ? (
            <a
              href={`https://wa.me/${ticket.caller_tel.trim().replace(/\D/g, '').replace(/^0/, '60')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.29-1.243l-.307-.184-2.87.853.853-2.87-.184-.307A8 8 0 1112 20z"/>
              </svg>
              <span className="text-[10px]">WhatsApp</span>
            </a>
          ) : (
            <button disabled className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-text-muted opacity-50 cursor-not-allowed">
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.29-1.243l-.307-.184-2.87.853.853-2.87-.184-.307A8 8 0 1112 20z"/>
              </svg>
              <span className="text-[10px]">WhatsApp</span>
            </button>
          )}
          <button onClick={() => {
            sessionStorage.setItem('clinic_prefill', JSON.stringify({
              clinic_code: ticket.clinic_code,
              caller_tel: ticket.caller_tel,
              pic: ticket.pic,
            }))
            router.push('/log')
          }} className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-[10px]">New Issue</span>
          </button>
          <button onClick={handleDelete} className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-text-muted hover:text-red-400 transition-colors">
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span className="text-[10px]">Delete</span>
          </button>
        </div>
      </div>


      {/* Image lightbox overlay */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Attachment preview" className="max-w-full max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl">&times;</button>
        </div>
      )}
    </div>
  )
}
