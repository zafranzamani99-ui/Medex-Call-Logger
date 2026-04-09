'use client'

import { format } from 'date-fns'
import type { OpenTicketWarning } from '@/lib/types'
import { toProperCase } from '@/lib/constants'
import { IssueTypeBadge } from './FlagBadge'
import StatusBadge from './StatusBadge'

// WHY: Spec Section 5.1 — when a clinic is selected, show recent activity:
// 1. All of today's calls/tickets (even resolved) — context for repeat callers
// 2. Unresolved tickets from last 30 days — needs attention
// Agent can [Add follow-up] to existing or [Create new] ticket.

interface OpenTicketBannerProps {
  tickets: OpenTicketWarning[]
  onAddToExisting: (ticketId: string) => void
  onCreateNew: () => void
}

export default function OpenTicketBanner(props: OpenTicketBannerProps) {
  const { tickets, onAddToExisting, onCreateNew } = props
  if (tickets.length === 0) return null

  const openCount = tickets.filter(t => t.status !== 'Resolved').length
  const hasOpen = openCount > 0

  return (
    <div className={`rounded-xl overflow-hidden mb-4 ${
      hasOpen
        ? 'bg-amber-950/40 border border-amber-500/25'
        : 'bg-blue-950/30 border border-blue-500/20'
    }`}
      style={{ boxShadow: hasOpen
        ? '0 0 0 1px rgba(245,158,11,0.05), 0 4px 12px -2px rgba(245,158,11,0.1)'
        : '0 0 0 1px rgba(59,130,246,0.05), 0 4px 12px -2px rgba(59,130,246,0.08)'
      }}
    >
      {/* Header bar */}
      <div className={`flex items-center justify-between px-4 py-2.5 ${
        hasOpen
          ? 'bg-amber-500/10 border-b border-amber-500/15'
          : 'bg-blue-500/8 border-b border-blue-500/10'
      }`}>
        <div className="flex items-center gap-2.5">
          {hasOpen ? (
            <svg className="size-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          ) : (
            <svg className="size-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0Zm-9-3.75h.008v.008H12V8.25Z" />
            </svg>
          )}
          <span className={`text-xs font-semibold tracking-wide ${hasOpen ? 'text-amber-300' : 'text-blue-300'}`}>
            {tickets.length} recent record{tickets.length > 1 ? 's' : ''}
            {hasOpen && <span className="text-amber-400 ml-1">({openCount} open)</span>}
          </span>
        </div>
        <button
          type="button"
          onClick={onCreateNew}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-all active:translate-y-px ${
            hasOpen
              ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 hover:text-amber-200'
              : 'bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 hover:text-blue-200'
          }`}
        >
          <svg className="size-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Issue
        </button>
      </div>

      {/* Ticket list */}
      <div className="divide-y divide-white/[0.04]">
        {tickets.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onAddToExisting(t.id)}
            className="w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {/* Row 1: Badge + status */}
                <div className="flex items-center gap-2 mb-1">
                  <IssueTypeBadge issueType={t.issue_type} />
                  <StatusBadge status={t.status} />
                  <span className="text-[11px] text-text-tertiary ml-auto shrink-0">
                    {format(new Date(t.created_at), 'dd/MM HH:mm')}
                  </span>
                </div>
                {/* Row 2: Issue text */}
                <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2">
                  {t.issue}
                </p>
                {/* Row 3: Agent */}
                <p className="text-[11px] text-text-tertiary mt-1">
                  by {toProperCase(t.created_by_name)}
                </p>
              </div>
              {/* Action arrow */}
              <div className={`shrink-0 mt-1 flex items-center gap-1 text-[11px] font-medium transition-colors ${
                t.status === 'Resolved'
                  ? 'text-text-tertiary group-hover:text-text-secondary'
                  : 'text-blue-400 group-hover:text-blue-300'
              }`}>
                <span className="hidden sm:inline">
                  {t.status === 'Resolved' ? 'Reopen' : 'Follow-up'}
                </span>
                <svg className="size-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
