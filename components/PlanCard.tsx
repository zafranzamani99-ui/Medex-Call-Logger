'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import type { Ticket, TicketPlan, TimelineEntry } from '@/lib/types'
import { toProperCase } from '@/lib/constants'
import Button from '@/components/ui/Button'
import PlanEditModal from '@/components/PlanEditModal'

// WHY: Dedicated card showing the current plan + a viewable history of every
// prior plan. Lives at the top of the right column on the ticket detail page.
// Plan changes never overwrite — every save is a new row in ticket_plans, and
// the prior active row is auto-superseded by a DB trigger.

interface PlanCardProps {
  ticket: Ticket
  planHistory: TicketPlan[]   // ordered set_at DESC
  userId: string
  userName: string
  onChange: () => void        // triggers parent fetchTicket()
  timelineEntries: TimelineEntry[]  // for "via [channel]" badge resolution
}

function formatPhone(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0/, '60')
}

function PlanContactPills({ pic, contact }: { pic: string | null; contact: string | null }) {
  if (!pic && !contact) return null
  const trimmed = contact?.trim() || ''
  return (
    <div className="flex items-center gap-2 flex-wrap text-sm">
      {pic && <span className="text-text-secondary">{pic}</span>}
      {pic && contact && <span className="text-text-muted">·</span>}
      {trimmed && (
        <div className="inline-flex items-center gap-1.5">
          <a
            href={`tel:${trimmed}`}
            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
            title="Call"
          >
            <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
            {trimmed}
          </a>
          <a
            href={`https://wa.me/${formatPhone(trimmed)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
            title="WhatsApp"
          >
            <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" />
              <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.29-1.243l-.307-.184-2.87.853.853-2.87-.184-.307A8 8 0 1112 20z" />
            </svg>
          </a>
        </div>
      )}
    </div>
  )
}

export default function PlanCard({ ticket, planHistory, userId, userName, onChange, timelineEntries }: PlanCardProps) {
  const [editOpen, setEditOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const current = planHistory.find(p => !p.superseded_at) || null
  const priorPlans = planHistory.filter(p => p.superseded_at)
  const hasCurrent = !!(current && (current.next_step || current.next_step_pic || current.next_step_contact))

  const linkedTimeline = current?.related_timeline_entry_id
    ? timelineEntries.find(t => t.id === current.related_timeline_entry_id)
    : null

  const scrollToTimelineEntry = (id: string) => {
    const el = document.getElementById(`timeline-entry-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-indigo-500/50')
      setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-500/50'), 1500)
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Plan / Next Step
        </h2>
        <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
          {hasCurrent ? 'Edit' : '+ Add plan'}
        </Button>
      </div>

      {hasCurrent && current ? (
        <div className="space-y-2">
          <p className="text-text-primary whitespace-pre-wrap text-[15px] leading-snug">
            {current.next_step || <span className="text-text-muted italic">No next step text</span>}
          </p>
          <PlanContactPills pic={current.next_step_pic} contact={current.next_step_contact} />
          <div className="flex items-center gap-2 flex-wrap text-xs text-text-tertiary pt-1">
            <span>
              Set {format(new Date(current.set_at), 'dd/MM HH:mm')}
              {current.set_by_name && (
                <> by <span className="text-text-secondary">{toProperCase(current.set_by_name)}</span></>
              )}
            </span>
            {linkedTimeline && (
              <button
                onClick={() => scrollToTimelineEntry(linkedTimeline.id)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 transition-colors"
                title="Jump to follow-up"
              >
                via {linkedTimeline.channel}
                <svg className="size-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            {current.reason && current.reason !== 'manual' && current.reason !== 'follow_up' && current.reason !== 'created' && (
              <span className="text-text-muted italic">— {current.reason}</span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted italic">No plan yet</p>
      )}

      {priorPlans.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => setHistoryOpen(prev => !prev)}
            className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors"
          >
            <svg
              className={`size-3.5 transition-transform ${historyOpen ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Plan history ({priorPlans.length})
          </button>

          {historyOpen && (
            <ol className="mt-3 space-y-3 pl-1">
              {priorPlans.map((p) => {
                const linked = p.related_timeline_entry_id
                  ? timelineEntries.find(t => t.id === p.related_timeline_entry_id)
                  : null
                return (
                  <li key={p.id} className="flex gap-2 text-xs">
                    <div className="flex flex-col items-center pt-1">
                      <div className="size-1.5 rounded-full bg-text-muted/60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-text-tertiary">
                        {format(new Date(p.set_at), 'dd/MM/yyyy HH:mm')}
                        {p.set_by_name && (
                          <> · <span className="text-text-secondary">{toProperCase(p.set_by_name)}</span></>
                        )}
                        {linked && (
                          <button
                            onClick={() => scrollToTimelineEntry(linked.id)}
                            className="ml-1.5 text-indigo-400 hover:text-indigo-300"
                          >
                            via {linked.channel}
                          </button>
                        )}
                      </div>
                      {p.next_step && (
                        <p className="text-text-secondary line-through whitespace-pre-wrap mt-0.5">
                          {p.next_step}
                        </p>
                      )}
                      {(p.next_step_pic || p.next_step_contact) && (
                        <p className="text-text-muted text-[11px] line-through">
                          {p.next_step_pic}
                          {p.next_step_pic && p.next_step_contact && ' · '}
                          {p.next_step_contact}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}

      <PlanEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        ticketId={ticket.id}
        current={{
          next_step: current?.next_step ?? ticket.next_step,
          next_step_pic: current?.next_step_pic ?? ticket.next_step_pic,
          next_step_contact: current?.next_step_contact ?? ticket.next_step_contact,
        }}
        userId={userId}
        userName={userName}
        onSaved={onChange}
      />
    </div>
  )
}
