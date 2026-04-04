'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import EmptyState, { EmptyIcons } from '@/components/ui/EmptyState'

// WHY: Activity Log page — shows every data change across the system.
// Reads from audit_log table which is auto-populated by DB triggers.
// Tamper-proof: no one can edit or delete audit entries (INSERT-only via RLS).

interface AuditEntry {
  id: string
  table_name: string
  record_id: string
  action: string
  changed_by: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  created_at: string
}

const PAGE_SIZE = 30

// Describe what changed in human terms
function describeChange(entry: AuditEntry): string {
  const { action, table_name, old_data, new_data } = entry

  // --- INSERT ---
  if (action === 'INSERT') {
    if (table_name === 'tickets') {
      const d = new_data!
      const type = d.record_type === 'ticket' ? 'ticket' : 'call log'
      return `New ${type} ${d.ticket_ref || ''} — ${d.clinic_name || 'Unknown'} (${d.issue_type || ''})`
    }
    if (table_name === 'timeline_entries') {
      return `Follow-up added via ${new_data?.channel || 'unknown'}: "${(new_data?.notes as string || '').slice(0, 60)}..."`
    }
    if (table_name === 'knowledge_base') {
      return `KB article created: "${(new_data?.issue as string || '').slice(0, 60)}" (${new_data?.status || 'draft'})`
    }
    if (table_name === 'license_key_requests') {
      return `LK request created for ${new_data?.clinic_name || new_data?.clinic_code || 'Unknown'}`
    }
    if (table_name === 'schedules') {
      const d = new_data!
      const type = d.schedule_type === 'Others' && d.custom_type ? d.custom_type : d.schedule_type
      return `New schedule: ${d.clinic_name || 'Unknown'} — ${type || ''} on ${d.schedule_date || ''} at ${d.schedule_time || ''} (${d.agent_name || ''})`
    }
    return `Created ${table_name} record`
  }

  // --- DELETE ---
  if (action === 'DELETE') {
    if (table_name === 'tickets') {
      return `Deleted ${old_data?.record_type === 'ticket' ? 'ticket' : 'call log'} ${old_data?.ticket_ref || ''} — ${old_data?.clinic_name || 'Unknown'}`
    }
    if (table_name === 'timeline_entries') {
      return `Timeline entry deleted (${old_data?.channel || 'unknown'})`
    }
    if (table_name === 'knowledge_base') {
      return `KB article discarded: "${(old_data?.issue as string || '').slice(0, 60)}"`
    }
    if (table_name === 'license_key_requests') {
      return `LK request deleted for ${old_data?.clinic_name || old_data?.clinic_code || 'Unknown'}`
    }
    if (table_name === 'schedules') {
      return `Schedule deleted: ${old_data?.clinic_name || 'Unknown'} — ${old_data?.schedule_date || ''}`
    }
    return `Deleted ${table_name} record`
  }

  // --- UPDATE ---
  if (action === 'UPDATE' && table_name === 'tickets' && old_data && new_data) {
    const changes: string[] = []

    if (old_data.status !== new_data.status) {
      changes.push(`Status: ${old_data.status} → ${new_data.status}`)
    }
    if (old_data.record_type !== new_data.record_type) {
      const from = old_data.record_type === 'call' ? 'Call Log' : 'Ticket'
      const to = new_data.record_type === 'call' ? 'Call Log' : 'Ticket'
      changes.push(`${from} → ${to}`)
    }
    if (old_data.ticket_ref !== new_data.ticket_ref) {
      changes.push(`Ref: ${old_data.ticket_ref} → ${new_data.ticket_ref}`)
    }
    if (old_data.need_team_check !== new_data.need_team_check) {
      changes.push(new_data.need_team_check ? 'Flagged for attention' : 'Flag removed')
    }
    if (old_data.issue !== new_data.issue) changes.push('Issue updated')
    if (old_data.my_response !== new_data.my_response) changes.push('Response updated')
    if (old_data.next_step !== new_data.next_step) changes.push('Next step updated')
    if (old_data.assigned_to !== new_data.assigned_to) changes.push('Assigned to changed')
    if (old_data.jira_link !== new_data.jira_link) changes.push('Jira link updated')
    if (old_data.caller_tel !== new_data.caller_tel) changes.push('Caller tel updated')
    if (old_data.pic !== new_data.pic) changes.push('PIC updated')

    const ref = (new_data.ticket_ref || old_data.ticket_ref || '') as string
    const clinic = (new_data.clinic_name || old_data.clinic_name || '') as string

    if (changes.length === 0) return `Updated ${ref} — ${clinic}`
    return `${ref} — ${changes.join(', ')}`
  }

  if (action === 'UPDATE' && table_name === 'knowledge_base' && old_data && new_data) {
    if (old_data.status !== new_data.status) {
      return `KB article "${(new_data.issue as string || '').slice(0, 40)}": ${old_data.status} → ${new_data.status}`
    }
    return `KB article updated: "${(new_data.issue as string || '').slice(0, 60)}"`
  }

  if (action === 'UPDATE' && table_name === 'schedules' && old_data && new_data) {
    const clinic = (new_data.clinic_name || old_data.clinic_name || 'Unknown') as string
    if (old_data.status !== new_data.status) {
      const status = (new_data.status === 'no_answer' ? 'no answer' : new_data.status) as string
      return `Schedule ${clinic}: ${old_data.status} → ${status}`
    }
    return `Schedule updated: ${clinic}`
  }

  if (action === 'UPDATE' && table_name === 'timeline_entries') {
    return `Timeline entry modified`
  }

  return `${action} on ${table_name}`
}

function getActionColor(action: string) {
  switch (action) {
    case 'DELETE': return 'bg-red-500/20 text-red-400'
    case 'UPDATE': return 'bg-blue-500/20 text-blue-400'
    case 'INSERT': return 'bg-green-500/20 text-green-400'
    default: return 'bg-zinc-500/20 text-zinc-400'
  }
}

function getTableLabel(table: string) {
  switch (table) {
    case 'tickets': return 'Ticket'
    case 'timeline_entries': return 'Timeline'
    case 'knowledge_base': return 'KB'
    case 'clinics': return 'Clinic'
    default: return table
  }
}

export default function ActivityPage() {
  const supabase = createClient()
  const router = useRouter()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [agentFilter, setAgentFilter] = useState<string>('')
  const [agents, setAgents] = useState<string[]>([])

  useEffect(() => {
    fetchEntries()
  }, [page, actionFilter, agentFilter])

  const fetchEntries = async () => {
    setLoading(true)

    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })

    if (actionFilter !== 'all') {
      query = query.eq('action', actionFilter)
    }
    if (agentFilter) {
      query = query.eq('changed_by', agentFilter)
    }

    query = query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    const { data, count } = await query

    if (data) {
      setEntries(data as AuditEntry[])
      setTotal(count || 0)

      // Extract unique agents on first load
      if (agents.length === 0) {
        const { data: allAgents } = await supabase
          .from('audit_log')
          .select('changed_by')
        if (allAgents) {
          const unique = Array.from(new Set(allAgents.map((a: { changed_by: string }) => a.changed_by))).sort() as string[]
          setAgents(unique)
        }
      }
    }
    setLoading(false)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Activity Log</h1>
          <p className="text-[13px] text-text-tertiary mt-0.5">Audit trail for all actions</p>
        </div>
        <span className="text-xs text-text-tertiary tabular-nums">{total.toLocaleString()} entries</span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
          className="px-3 py-1.5 bg-surface border border-border rounded-lg text-sm text-text-primary"
        >
          <option value="all">All Actions</option>
          <option value="INSERT">Created</option>
          <option value="UPDATE">Updated</option>
          <option value="DELETE">Deleted</option>
        </select>
        <select
          value={agentFilter}
          onChange={(e) => { setAgentFilter(e.target.value); setPage(1) }}
          className="px-3 py-1.5 bg-surface border border-border rounded-lg text-sm text-text-primary"
        >
          <option value="">All Staff</option>
          {agents.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Entries */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 skeleton rounded-lg" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={EmptyIcons.clipboard}
          title="No activity logged yet"
          description="Changes to tickets, KB, and LK requests will appear here"
        />
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden divide-y divide-border">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`px-4 py-3 hover:bg-surface-raised transition-colors ${
                entry.table_name === 'tickets' ? 'cursor-pointer' : ''
              }`}
              onClick={() => {
                if (entry.table_name === 'tickets' && entry.action !== 'DELETE') {
                  router.push(`/tickets/${entry.record_id}`)
                }
              }}
            >
              {/* Row 1: Action + Description */}
              <div className="flex items-start gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${getActionColor(entry.action)}`}>
                  {entry.action}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-700/50 text-zinc-400 flex-shrink-0">
                  {getTableLabel(entry.table_name)}
                </span>
                <span className="text-sm text-text-primary flex-1">{describeChange(entry)}</span>
              </div>

              {/* Row 2: Agent + Timestamp */}
              <div className="flex items-center gap-3 mt-1.5 text-xs">
                <span className="bg-accent-muted text-accent font-medium px-1.5 py-0.5 rounded">
                  {entry.changed_by}
                </span>
                <span className="text-text-tertiary tabular-nums">
                  {format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm:ss')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs bg-surface border border-border rounded-lg disabled:opacity-30 text-text-secondary hover:text-text-primary transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-text-tertiary tabular-nums">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-xs bg-surface border border-border rounded-lg disabled:opacity-30 text-text-secondary hover:text-text-primary transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
