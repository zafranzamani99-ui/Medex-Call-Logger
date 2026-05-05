'use client'

import { useEffect, useState } from 'react'
import { ModalDialog } from '@/components/Modal'
import { Input, Textarea, Label } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import type { TimelineEntry, Channel } from '@/lib/types'
import { CHANNEL_COLORS } from '@/lib/constants'

// WHY: The Add Update form collects ~6 fields per follow-up. Today the inline
// edit only shows the notes textarea, so the response addition, customer/
// internal timeline updates, and jira link the agent typed in are invisible
// and uneditable after save. This modal lets the agent edit any field that
// was captured on the entry. status_from/status_to are read-only — to alter
// status semantics, an agent should add a new follow-up.
//
// Phase-1 scope: edits update the timeline_entries row only. The mirrored
// scalar columns on `tickets` (my_response, timeline_from_customer, etc.) do
// NOT get re-synced — that would require regex-rebuilding which we can layer
// in later. The banner inside the modal makes this explicit.

const CHANNELS: Channel[] = ['Call', 'WhatsApp', 'Email', 'Internal']

interface TimelineEntryEditModalProps {
  open: boolean
  onClose: () => void
  entry: TimelineEntry | null
  onSaved: () => void
}

export default function TimelineEntryEditModal({ open, onClose, entry, onSaved }: TimelineEntryEditModalProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const [entryDate, setEntryDate] = useState('')
  const [channel, setChannel] = useState<Channel>('Call')
  const [notes, setNotes] = useState('')
  const [responseAdded, setResponseAdded] = useState('')
  const [customerTimeline, setCustomerTimeline] = useState('')
  const [internalTimeline, setInternalTimeline] = useState('')
  const [jiraLink, setJiraLink] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && entry) {
      setEntryDate(entry.entry_date)
      setChannel(entry.channel)
      setNotes(entry.notes)
      setResponseAdded(entry.response_added || '')
      setCustomerTimeline(entry.customer_timeline_update || '')
      setInternalTimeline(entry.internal_timeline_update || '')
      setJiraLink(entry.jira_link || '')
    }
  }, [open, entry])

  if (!entry) return null

  const handleSave = async () => {
    if (saving) return
    if (!notes.trim()) {
      toast('Notes cannot be empty', 'error')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('timeline_entries')
      .update({
        entry_date: entryDate,
        channel,
        notes: notes.trim(),
        response_added: responseAdded.trim() || null,
        customer_timeline_update: customerTimeline.trim() || null,
        internal_timeline_update: internalTimeline.trim() || null,
        jira_link: jiraLink.trim() || null,
      })
      .eq('id', entry.id)
    setSaving(false)
    if (error) {
      toast('Failed to update entry: ' + error.message, 'error')
      return
    }
    toast('Entry updated', 'success')
    onSaved()
    onClose()
  }

  const showStatusBlock = !!(entry.status_from && entry.status_to)
  const channelPill = CHANNEL_COLORS[channel] || { bg: 'bg-gray-500/20', text: 'text-gray-400' }

  return (
    <ModalDialog open={open} onClose={onClose} title="Edit Follow-up" size="lg">
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Channel</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {CHANNELS.map(c => {
                const colors = CHANNEL_COLORS[c]
                const active = channel === c
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannel(c)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      active ? `${colors.bg} ${colors.text} ring-1 ring-current/40` : 'bg-surface-inset text-text-tertiary hover:text-text-primary'
                    }`}
                  >
                    {c}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div>
          <Label required>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What happened in this interaction..."
          />
        </div>

        <div>
          <Label>Added to response</Label>
          <Textarea
            value={responseAdded}
            onChange={(e) => setResponseAdded(e.target.value)}
            rows={2}
            placeholder="Additional response text recorded with this follow-up"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Customer timeline</Label>
            <Input
              value={customerTimeline}
              onChange={(e) => setCustomerTimeline(e.target.value)}
              placeholder="Timeline stated by customer"
            />
          </div>
          <div>
            <Label>Internal timeline</Label>
            <Input
              value={internalTimeline}
              onChange={(e) => setInternalTimeline(e.target.value)}
              placeholder='e.g. "By Hazleen: 06/05/2026"'
            />
          </div>
        </div>

        <div>
          <Label>Jira link</Label>
          <Input
            value={jiraLink}
            onChange={(e) => setJiraLink(e.target.value)}
            placeholder="https://medex.atlassian.net/browse/..."
          />
        </div>

        {showStatusBlock && (
          <div className="rounded-lg bg-surface-inset border border-border px-3 py-2">
            <p className="text-[11px] text-text-tertiary mb-1">Status change recorded with this follow-up (read-only)</p>
            <div className="flex items-center gap-2 text-sm">
              <span className="px-2 py-0.5 rounded-full bg-zinc-700/40 text-zinc-300 text-xs">{entry.status_from}</span>
              <span className="text-text-muted">→</span>
              <span className={`px-2 py-0.5 rounded-full ${channelPill.bg} ${channelPill.text} text-xs`}>{entry.status_to}</span>
            </div>
          </div>
        )}

        {entry.attachment_urls && entry.attachment_urls.length > 0 && (
          <div>
            <Label>Attachments</Label>
            <div className="flex flex-wrap gap-2">
              {entry.attachment_urls.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={url} alt={`Attachment ${i + 1}`} className="size-16 object-cover rounded-lg border border-border" />
              ))}
            </div>
            <p className="text-[11px] text-text-tertiary mt-1">Attachments are read-only here. Add a new follow-up to attach more.</p>
          </div>
        )}

        <p className="text-[11px] text-text-tertiary">
          Edits update this entry only — the &quot;My Response&quot; field at the top of the ticket reflects the original append.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} loading={saving}>Save changes</Button>
        </div>
      </div>
    </ModalDialog>
  )
}
