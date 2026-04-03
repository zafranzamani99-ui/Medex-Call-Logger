import type { Ticket } from './types'

// WHY: Spec Section 5.4, BR-07 — a ticket is "stale" if:
// - status is In Progress OR Pending Customer OR Pending Team
// - last_activity_at is more than 7 days ago
// Resolved and Escalated tickets are excluded.
// This is used everywhere: Dashboard stale count, History table badge, Ticket detail.

const STALE_DAYS = 7

export function isStale(ticket: Ticket): boolean {
  // WHY: Only tickets can be stale. Calls are resolved immediately.
  if (ticket.record_type !== 'ticket') return false

  const staleStatuses = ['In Progress', 'Pending Customer', 'Pending Team']

  if (!staleStatuses.includes(ticket.status)) {
    return false
  }

  const lastActivity = new Date(ticket.last_activity_at)
  const now = new Date()
  const diffMs = now.getTime() - lastActivity.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  return diffDays > STALE_DAYS
}
