import { format } from 'date-fns'
import type { Channel } from './types'

// WHY: Spec Section 8.4 — timeline entry builder generates a formatted string:
// "31/03/2026: Call (Zafran). Let customer know we can finish 06/04/2026."
// This is shown in an editable textarea so the agent can modify before saving.
export function formatTimelineString(
  date: Date,
  channel: Channel,
  agentName: string,
  notes: string
): string {
  const dateStr = format(date, 'dd/MM/yyyy')
  return `${dateStr}: ${channel} (${agentName}). ${notes}`
}
