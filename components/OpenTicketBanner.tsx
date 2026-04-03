'use client'

import { format } from 'date-fns'
import type { OpenTicketWarning } from '@/lib/types'
import { IssueTypeBadge } from './FlagBadge'
import StatusBadge from './StatusBadge'

// WHY: Spec Section 5.1 — when a clinic is selected that has open tickets
// within 30 days, show a warning banner with options:
// [Add to existing] → navigate to that ticket's detail page
// [New ticket] → dismiss banner, continue with new ticket form
// This prevents duplicate tickets for the same ongoing issue.

interface OpenTicketBannerProps {
  clinicName: string
  tickets: OpenTicketWarning[]
  onAddToExisting: (ticketId: string) => void
  onCreateNew: () => void
}

export default function OpenTicketBanner({
  clinicName,
  tickets,
  onAddToExisting,
  onCreateNew,
}: OpenTicketBannerProps) {
  if (tickets.length === 0) return null

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-2">
        <span className="text-amber-400 text-lg">⚠️</span>
        <div className="flex-1">
          <p className="text-amber-200 text-sm font-medium">
            {clinicName} has {tickets.length} open ticket{tickets.length > 1 ? 's' : ''}
          </p>

          {/* List open tickets */}
          <div className="mt-2 space-y-2">
            {tickets.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between bg-amber-500/5 rounded-md px-3 py-2"
              >
                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                  <IssueTypeBadge issueType={t.issue_type} />
                  <span className="text-xs text-zinc-400 truncate">
                    {t.issue}
                  </span>
                  <span className="text-xs text-zinc-500 hidden sm:inline">
                    — {format(new Date(t.created_at), 'dd/MM')} by {t.created_by_name}
                  </span>
                  <StatusBadge status={t.status} />
                </div>
                <button
                  type="button"
                  onClick={() => onAddToExisting(t.id)}
                  className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap ml-2 px-2 py-1.5"
                >
                  Add to this →
                </button>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={onCreateNew}
              className="px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded-md transition-colors"
            >
              Create New Ticket
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
