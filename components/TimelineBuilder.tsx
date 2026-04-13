'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import PillSelector from './PillSelector'
import { CHANNELS, CHANNEL_COLORS } from '@/lib/constants'
import type { Channel } from '@/lib/types'

// WHY: Spec Section 8.4 — Timeline Entry Builder.
// Sub-section below the main ticket fields. Builds the first timeline entry.
// Auto-generates: "31/03/2026: Call (Zafran). Customer said..."
// The textarea is editable — agent can modify before saving.
// This component is reused in both Log Call form AND Add Update form.

interface TimelineBuilderProps {
  agentName: string
  onChange: (data: { entryDate: string; channel: Channel; notes: string; formattedString: string }) => void
  initialDate?: string
  initialChannel?: Channel
  initialNotes?: string
}

export default function TimelineBuilder({
  agentName,
  onChange,
  initialDate,
  initialChannel,
  initialNotes = '',
}: TimelineBuilderProps) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [entryDate, setEntryDate] = useState(initialDate || today)
  const [channel, setChannel] = useState<Channel | null>(initialChannel || null)
  const [notes, setNotes] = useState(initialNotes)
  const [formattedString, setFormattedString] = useState('')

  // Sync entryDate when parent changes call date (backdate support)
  useEffect(() => {
    if (initialDate) setEntryDate(initialDate)
  }, [initialDate])

  // Auto-generate the formatted timeline string
  useEffect(() => {
    if (entryDate && channel && notes) {
      const dateStr = format(new Date(entryDate + 'T00:00:00'), 'dd/MM/yyyy')
      const generated = `${dateStr}: ${channel} (${agentName}). ${notes}`
      setFormattedString(generated)
    }
  }, [entryDate, channel, notes, agentName])

  // Notify parent of changes
  useEffect(() => {
    if (channel) {
      onChange({
        entryDate,
        channel,
        notes,
        formattedString,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryDate, channel, notes, formattedString])

  const channelOptions = CHANNELS.map((c) => ({
    value: c,
    label: c,
    colors: CHANNEL_COLORS[c],
  }))

  return (
    <div className="space-y-3 p-4 bg-zinc-900/50 border border-border rounded-lg">
      <h4 className="text-sm font-medium text-zinc-300">Timeline Entry</h4>

      {/* Date */}
      <div>
        <label className="block text-xs text-text-tertiary mb-1">Date</label>
        <input
          type="date"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          className="px-3 py-2 bg-surface border border-border rounded-lg text-white text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </div>

      {/* Channel pill selector */}
      <PillSelector
        label="Channel"
        required
        options={channelOptions}
        value={channel}
        onChange={(v) => setChannel(v as Channel)}
      />

      {/* Notes */}
      <div>
        <label className="block text-xs text-text-tertiary mb-1">Notes</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What happened in this interaction..."
          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-white text-sm
                     placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </div>

      {/* Auto-generated formatted string — editable (spec: "textarea is editable") */}
      {formattedString && (
        <div>
          <label className="block text-xs text-text-tertiary mb-1">
            Generated Timeline (editable)
          </label>
          <textarea
            value={formattedString}
            onChange={(e) => setFormattedString(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-white
                       text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
      )}
    </div>
  )
}
