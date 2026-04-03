'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import type { Ticket, TimelineEntry, TicketStatus, Channel } from '@/lib/types'
import { STATUSES, STATUS_COLORS, CHANNEL_COLORS, getDurationLabel } from '@/lib/constants'
import { isStale } from '@/lib/staleDetection'
import StatusBadge from '@/components/StatusBadge'
import RecordTypeBadge from '@/components/RecordTypeBadge'
import { NeedsAttentionBadge, StaleBadge, IssueTypeBadge } from '@/components/FlagBadge'
import PillSelector from '@/components/PillSelector'
import TimelineBuilder from '@/components/TimelineBuilder'
import WADraftModal from '@/components/WADraftModal'
import { DetailSkeleton } from '@/components/Skeleton'
import Button from '@/components/ui/Button'
import { Input, Textarea, Label } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'

// WHY: Ticket Detail — spec Section 9.
// UPGRADE: Breadcrumb nav, two-column layout on lg, redesigned vertical timeline.

// Channel dot color mapping for timeline
const CHANNEL_DOT_COLORS: Record<string, string> = {
  Call: 'bg-blue-400',
  WhatsApp: 'bg-green-400',
  Email: 'bg-purple-400',
  Internal: 'bg-gray-400',
}

export default function TicketDetailPage() {
  const router = useRouter()
  const params = useParams()
  const ticketId = params.id as string
  const supabase = createClient()

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')

  // UI state
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [showAddUpdate, setShowAddUpdate] = useState(false)
  const timelineDataRef = useRef<{ entryDate: string; channel: Channel; notes: string; formattedString: string } | null>(null)
  const [showWADraft, setShowWADraft] = useState(false)
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

  // Timeline entry edit/delete state
  const [editingTimelineId, setEditingTimelineId] = useState<string | null>(null)
  const [editTimelineNotes, setEditTimelineNotes] = useState('')

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
  }, [])

  const fetchTicket = async () => {
    const [ticketRes, timelineRes] = await Promise.all([
      supabase.from('tickets').select('*').eq('id', ticketId).single(),
      supabase.from('timeline_entries').select('*').eq('ticket_id', ticketId)
        .order('entry_date', { ascending: true })
        .order('created_at', { ascending: true }),
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
    }

    if (timelineRes.data) setTimeline(timelineRes.data as TimelineEntry[])
    setLoading(false)
  }

  useEffect(() => { fetchTicket() }, [ticketId])

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
    setSaving(true)

    const changes: string[] = []
    if (editStatus !== ticket.status) changes.push(`Status: ${ticket.status} → ${editStatus}`)
    if (editIssue !== ticket.issue) changes.push('Issue updated')
    if ((editResponse || null) !== ticket.my_response) changes.push('Response updated')
    if ((editNextStep || null) !== ticket.next_step) changes.push('Next step updated')
    if (editNeedCheck !== ticket.need_team_check) changes.push(editNeedCheck ? 'Flagged for attention' : 'Flag removed')

    const { error } = await supabase
      .from('tickets')
      .update({
        issue: editIssue,
        my_response: editResponse || null,
        next_step: editNextStep || null,
        status: editStatus,
        need_team_check: editNeedCheck,
        jira_link: editStatus === 'Escalated' ? editJiraLink : ticket.jira_link,
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
    })
    await supabase
      .from('tickets')
      .update({
        last_activity_at: new Date().toISOString(),
        last_updated_by: userId,
        last_updated_by_name: userName,
        last_change_note: `Timeline update added (${data.channel})`,
      })
      .eq('id', ticket.id)
    setShowAddUpdate(false)
    fetchTicket()
    setSaving(false)
    toast('Timeline update added')
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

  const handleDelete = async () => {
    if (!ticket) return
    if (!confirm(`Delete ticket ${ticket.ticket_ref}? This cannot be undone.`)) return
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

  return (
    <div className="max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm mb-5">
        <button onClick={() => router.back()} className="text-text-tertiary hover:text-text-primary transition-colors">
          History
        </button>
        <svg className="size-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-text-primary font-medium">{ticket.clinic_name}</span>
      </nav>

      {/* Header — clinic name is primary, ticket ref is secondary */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-mono text-sm text-accent">[{ticket.clinic_code}]</span>
          <h1 className="text-xl font-bold text-text-primary">{ticket.clinic_name}</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-sm text-text-tertiary">{ticket.ticket_ref}</span>
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
          <div className="bg-surface border border-border rounded-lg p-4">
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
                <p className="text-text-primary mt-1">{getDurationLabel(ticket.call_duration)}</p>
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
                      <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={`Attachment ${idx + 1}`} className="size-20 object-cover rounded-lg border border-border hover:border-accent transition-colors" />
                      </a>
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
                <p className="text-text-primary mt-1">{ticket.created_by_name}</p>
              </div>
              {ticket.timeline_from_customer && (
                <div>
                  <span className="text-text-tertiary text-xs">Timeline from Customer</span>
                  <p className="text-text-primary mt-1">{ticket.timeline_from_customer}</p>
                </div>
              )}
              {ticket.internal_timeline && (
                <div>
                  <span className="text-text-tertiary text-xs">Internal Timeline</span>
                  <p className="text-text-primary mt-1">{ticket.internal_timeline}</p>
                </div>
              )}
              {ticket.jira_link && (
                <div className="sm:col-span-2">
                  <span className="text-text-tertiary text-xs">Jira Link</span>
                  <p className="mt-1">
                    <a href={ticket.jira_link} target="_blank" rel="noopener noreferrer"
                      className="text-accent hover:text-accent-hover text-sm underline break-all">
                      {ticket.jira_link}
                    </a>
                  </p>
                </div>
              )}
            </div>

            {/* Status + flag toggle in edit mode */}
            {editing && (
              <div className="mt-4 space-y-3 pt-4 border-t border-border">
                <PillSelector label="Status" options={statusOptions} value={editStatus}
                  onChange={(v) => setEditStatus(v as TicketStatus)} />
                {editStatus === 'Escalated' && (
                  <div>
                    <Label>Jira Link</Label>
                    <Input value={editJiraLink} onChange={(e) => setEditJiraLink(e.target.value)}
                      placeholder="https://medex.atlassian.net/browse/..." />
                  </div>
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

          {/* Timeline Section — redesigned with vertical line */}
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-text-secondary">
                Timeline ({timeline.length})
              </h2>
              <Button size="sm" onClick={() => setShowAddUpdate(!showAddUpdate)}>
                {showAddUpdate ? 'Cancel' : 'Add Update'}
              </Button>
            </div>

            {/* Add Update form */}
            {showAddUpdate && (
              <div className="mb-4 p-3 bg-surface-raised border border-border rounded-lg">
                <TimelineBuilder
                  agentName={userName}
                  onChange={(data) => {
                    timelineDataRef.current = data
                  }}
                />
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
                  Save Update
                </Button>
              </div>
            )}

            {/* Timeline entries — vertical line design */}
            {timeline.length === 0 ? (
              <div className="text-center py-6">
                <div className="text-2xl mb-2">📝</div>
                <p className="text-sm text-text-tertiary">No timeline entries yet</p>
                <p className="text-xs text-text-muted mt-1">Click &quot;Add Update&quot; to record an interaction</p>
              </div>
            ) : (
              <div className="relative">
                {/* Vertical connecting line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />

                <div className="space-y-4">
                  {timeline.map((entry, i) => {
                    const channelColor = CHANNEL_COLORS[entry.channel as Channel] || { bg: 'bg-gray-500/20', text: 'text-gray-400' }
                    const dotColor = CHANNEL_DOT_COLORS[entry.channel] || 'bg-gray-400'

                    // Check if this is a new date compared to previous entry
                    const prevDate = i > 0 ? format(new Date(timeline[i - 1].entry_date), 'yyyy-MM-dd') : null
                    const thisDate = format(new Date(entry.entry_date), 'yyyy-MM-dd')
                    const showDateBadge = thisDate !== prevDate

                    return (
                      <div key={entry.id}>
                        {/* Date separator badge */}
                        {showDateBadge && (
                          <div className="relative flex items-center mb-3 ml-6">
                            <span className="text-xs font-medium text-text-tertiary bg-surface px-2 py-0.5 rounded border border-border">
                              {format(new Date(entry.entry_date), 'dd MMM yyyy')}
                            </span>
                          </div>
                        )}

                        <div className="flex gap-3 relative">
                          {/* Colored dot */}
                          <div className="flex-shrink-0 mt-1.5 z-10">
                            <div className={`w-3.5 h-3.5 rounded-full ${dotColor} ring-2 ring-surface`} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 pb-1 group">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${channelColor.bg} ${channelColor.text} font-medium`}>
                                {entry.channel}
                              </span>
                              <span className="text-xs text-text-muted">by {entry.added_by_name}</span>
                              <span className="text-xs text-text-muted tabular-nums">
                                {format(new Date(entry.created_at), 'HH:mm')}
                              </span>
                              {/* Edit/Delete buttons — visible on hover */}
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ml-auto">
                                <button
                                  onClick={() => { setEditingTimelineId(entry.id); setEditTimelineNotes(entry.notes) }}
                                  className="p-1 text-text-muted hover:text-text-primary rounded hover:bg-zinc-700/50 transition-colors"
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
                              <div className="mt-1">
                                <input
                                  type="text"
                                  value={editTimelineNotes}
                                  onChange={(e) => setEditTimelineNotes(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTimeline(entry.id); if (e.key === 'Escape') setEditingTimelineId(null) }}
                                  className="w-full px-2 py-1 bg-surface border border-border rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                  autoFocus
                                />
                                <div className="flex gap-2 mt-1">
                                  <Button size="sm" onClick={() => handleSaveTimeline(entry.id)}>Save</Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingTimelineId(null)}>Cancel</Button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-text-primary mt-1 whitespace-pre-wrap">{entry.notes}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column (40%) — Status, Actions, Audit */}
        <div className="lg:w-2/5 space-y-4">

          {/* Quick Status Change */}
          {!editing && (
            <div className="bg-surface border border-border rounded-lg p-4">
              <PillSelector
                label="Quick Status Change"
                options={statusOptions}
                value={ticket.status}
                onChange={handleStatusChange}
              />
            </div>
          )}

          {/* Actions */}
          <div className="bg-surface border border-border rounded-lg p-4 space-y-2">
            <h2 className="text-sm font-medium text-text-secondary mb-3">Actions</h2>
            {ticket.record_type === 'call' && (
              <Button variant="secondary" size="sm" onClick={handlePromoteToTicket} className="w-full justify-start">
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                Escalate to Ticket
              </Button>
            )}
            <Button variant="success" size="sm" onClick={() => setShowWADraft(true)} className="w-full justify-start">
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Generate WA Draft
            </Button>
            {ticket.issue && (
              <Button variant="secondary" size="sm" onClick={() => triggerKBGeneration(ticket)} className="w-full justify-start">
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                Generate KB Draft
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={handleDelete} className="w-full justify-start">
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete {ticket.record_type === 'ticket' ? 'Ticket' : 'Call Log'}
            </Button>
          </div>

          {/* Audit Info */}
          <div className="bg-surface border border-border rounded-lg p-4">
            <h2 className="text-sm font-medium text-text-secondary mb-3">Audit Trail</h2>
            <div className="space-y-2 text-xs text-text-tertiary tabular-nums">
              <div className="flex items-center gap-2">
                <svg className="size-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>Created {format(new Date(ticket.created_at), 'dd/MM/yyyy HH:mm')} by <span className="text-text-secondary">{ticket.created_by_name}</span></span>
              </div>
              {ticket.last_updated_by_name && (
                <div className="flex items-start gap-2">
                  <svg className="size-3.5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <div>
                    <span>Updated {format(new Date(ticket.updated_at), 'dd/MM/yyyy HH:mm')} by <span className="text-text-secondary">{ticket.last_updated_by_name}</span></span>
                    {ticket.last_change_note && (
                      <p className="text-text-muted mt-0.5">{ticket.last_change_note}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* WA Draft Modal */}
      {showWADraft && (
        <WADraftModal
          ticket={{
            clinic_name: ticket.clinic_name,
            clinic_code: ticket.clinic_code,
            clinic_phone: ticket.clinic_phone,
            pic: ticket.pic,
            ticket_ref: ticket.ticket_ref,
            issue_type: ticket.issue_type,
            issue: ticket.issue,
            my_response: ticket.my_response,
            next_step: ticket.next_step,
            status: ticket.status,
          }}
          agentName={userName}
          onClose={() => setShowWADraft(false)}
        />
      )}
    </div>
  )
}
