'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, parse } from 'date-fns'
import type { OTClaim, OTClaimEntry } from '@/lib/types'
import { toProperCase } from '@/lib/constants'
import { ModalDialog } from '@/components/Modal'
import { Label, Input } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import EmptyState, { EmptyIcons } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import OTClaimPrintLayout from '@/components/OTClaimPrintLayout'

interface Props {
  userId: string
  userName: string
  isAdmin: boolean
  canApprove: boolean
}

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Draft' },
  submitted: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Submitted' },
  approved: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Approved' },
  rejected: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Rejected' },
}

function calcHours(from: string, to: string): number {
  if (!from || !to) return 0
  const [fh, fm] = from.split(':').map(Number)
  const [th, tm] = to.split(':').map(Number)
  const diff = (th * 60 + tm) - (fh * 60 + fm)
  if (diff <= 0) return 0
  return Math.round(diff / 30) * 0.5
}

export default function OTClaimSection({ userId, userName, isAdmin, canApprove }: Props) {
  const supabase = createClient()
  const { toast } = useToast()

  const [claims, setClaims] = useState<OTClaim[]>([])
  const [adminClaims, setAdminClaims] = useState<OTClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [adminView, setAdminView] = useState(false)

  // Form
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formMonth, setFormMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [formDesignation, setFormDesignation] = useState('PROFESSIONAL SERVICE CONSULTANT')
  const [formDepartment, setFormDepartment] = useState('SUPPORT')
  const [formManager, setFormManager] = useState('HAZLEEN BT MOHD HADZIR')
  const [entries, setEntries] = useState<{ date: string; from: string; to: string; nature: string }[]>([])
  const [saving, setSaving] = useState(false)

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Reject
  const [rejectingClaim, setRejectingClaim] = useState<OTClaim | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const loadClaims = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('ot_claims').select('*').eq('user_id', userId).order('claim_month', { ascending: false })
    if (data) setClaims(data as OTClaim[])

    if (isAdmin) {
      const { data: all } = await supabase.from('ot_claims').select('*').in('status', ['submitted', 'approved', 'rejected']).order('submitted_at', { ascending: false })
      if (all) setAdminClaims(all as OTClaim[])
    }
    setLoading(false)
  }, [supabase, userId, isAdmin])

  useEffect(() => { loadClaims() }, [loadClaims])

  const openNewForm = () => {
    setEditingId(null)
    setFormMonth(format(new Date(), 'yyyy-MM'))
    setFormDesignation('PROFESSIONAL SERVICE CONSULTANT')
    setFormDepartment('SUPPORT')
    setFormManager('HAZLEEN BT MOHD HADZIR')
    setEntries([{ date: '', from: '', to: '', nature: '' }])
    setShowForm(true)
  }

  const openEditForm = (claim: OTClaim) => {
    setEditingId(claim.id)
    setFormMonth(claim.claim_month.slice(0, 7))
    setFormDesignation(claim.designation)
    setFormDepartment(claim.department)
    setFormManager(claim.reporting_manager)
    setEntries(claim.entries.map(e => ({ date: e.date, from: e.from, to: e.to, nature: e.nature })))
    setShowForm(true)
  }

  const addEntry = () => setEntries(prev => [...prev, { date: '', from: '', to: '', nature: '' }])
  const removeEntry = (idx: number) => setEntries(prev => prev.filter((_, i) => i !== idx))
  const updateEntry = (idx: number, field: string, value: string) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  const totalHours = entries.reduce((sum, e) => sum + calcHours(e.from, e.to), 0)

  const handleSave = async (submitNow: boolean) => {
    const validEntries = entries.filter(e => e.date && e.from && e.to && e.nature.trim())
    if (validEntries.length === 0) { toast('Add at least one OT entry', 'error'); return }

    const monthDate = `${formMonth}-01`
    const claimEntries: OTClaimEntry[] = validEntries.map(e => ({
      date: e.date,
      from: e.from,
      to: e.to,
      hours: calcHours(e.from, e.to),
      nature: e.nature.trim().toUpperCase(),
    }))
    const total = claimEntries.reduce((s, e) => s + e.hours, 0)

    setSaving(true)

    const payload: Record<string, unknown> = {
      user_id: userId,
      user_name: userName,
      designation: formDesignation,
      department: formDepartment,
      claim_month: monthDate,
      reporting_manager: formManager,
      entries: claimEntries,
      total_hours: total,
      status: submitNow ? 'submitted' : 'draft',
      submitted_at: submitNow ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }

    if (editingId) {
      payload.rejected_by = null
      payload.rejected_by_name = null
      payload.rejected_at = null
      payload.reject_reason = null
    }

    let error
    if (editingId) {
      ({ error } = await supabase.from('ot_claims').update(payload).eq('id', editingId))
    } else {
      ({ error } = await supabase.from('ot_claims').insert(payload))
    }

    if (error) {
      if (error.code === '23505') toast('You already have a claim for this month', 'error')
      else toast('Failed to save OT claim', 'error')
      setSaving(false)
      return
    }

    if (submitNow) {
      const { data: admins } = await supabase.from('profiles').select('id').in('role', ['admin', 'administrator']).eq('is_active', true)
      if (admins) {
        const monthLabel = format(parse(formMonth, 'yyyy-MM', new Date()), 'MMMM yyyy')
        const notifs = (admins as { id: string }[]).filter(a => a.id !== userId).map(a => ({
          user_id: a.id,
          type: 'ot_claim',
          title: 'OT Claim Submitted',
          body: `${toProperCase(userName)} submitted OT claim for ${monthLabel} (${total}h)`,
          link: '/shift?section=ot',
        }))
        if (notifs.length > 0) await supabase.from('notifications').insert(notifs)
      }
    }

    setSaving(false)
    setShowForm(false)
    toast(submitNow ? 'OT claim submitted' : 'OT claim saved as draft', 'success')
    loadClaims()
  }

  const handleDelete = async () => {
    if (!deletingId) return
    await supabase.from('ot_claims').delete().eq('id', deletingId)
    setDeletingId(null)
    toast('OT claim deleted', 'success')
    loadClaims()
  }

  const handleApprove = async (claim: OTClaim) => {
    const { error } = await supabase.from('ot_claims').update({
      status: 'approved',
      approved_by: userId,
      approved_by_name: userName,
      approved_at: new Date().toISOString(),
    }).eq('id', claim.id)
    if (error) { toast('Failed to approve', 'error'); return }

    await supabase.from('notifications').insert({
      user_id: claim.user_id,
      type: 'ot_claim',
      title: 'OT Claim Approved',
      body: `Your OT claim for ${format(new Date(claim.claim_month), 'MMMM yyyy')} has been approved by ${toProperCase(userName)}`,
      link: '/shift?section=ot',
    })

    toast('OT claim approved', 'success')
    loadClaims()
  }

  const handleReject = async () => {
    if (!rejectingClaim) return
    if (!rejectReason.trim()) { toast('Please provide a reason', 'error'); return }

    const { error } = await supabase.from('ot_claims').update({
      status: 'rejected',
      rejected_by: userId,
      rejected_by_name: userName,
      rejected_at: new Date().toISOString(),
      reject_reason: rejectReason.trim(),
    }).eq('id', rejectingClaim.id)
    if (error) { toast('Failed to reject', 'error'); return }

    await supabase.from('notifications').insert({
      user_id: rejectingClaim.user_id,
      type: 'ot_claim',
      title: 'OT Claim Rejected',
      body: `Your OT claim for ${format(new Date(rejectingClaim.claim_month), 'MMMM yyyy')} was rejected by ${toProperCase(userName)}: ${rejectReason.trim()}`,
      link: '/shift?section=ot',
    })

    setRejectingClaim(null)
    setRejectReason('')
    toast('OT claim rejected', 'success')
    loadClaims()
  }

  const handleSubmitExisting = async (claim: OTClaim) => {
    const { error } = await supabase.from('ot_claims').update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      rejected_by: null,
      rejected_by_name: null,
      rejected_at: null,
      reject_reason: null,
    }).eq('id', claim.id)
    if (error) { toast('Failed to submit', 'error'); return }

    const { data: admins } = await supabase.from('profiles').select('id').in('role', ['admin', 'administrator']).eq('is_active', true)
    if (admins) {
      const monthLabel = format(new Date(claim.claim_month), 'MMMM yyyy')
      const notifs = (admins as { id: string }[]).filter(a => a.id !== userId).map(a => ({
        user_id: a.id,
        type: 'ot_claim',
        title: 'OT Claim Submitted',
        body: `${toProperCase(userName)} submitted OT claim for ${monthLabel} (${claim.total_hours}h)`,
        link: '/shift?section=ot',
      }))
      if (notifs.length > 0) await supabase.from('notifications').insert(notifs)
    }

    toast('OT claim submitted', 'success')
    loadClaims()
  }

  const [printingClaim, setPrintingClaim] = useState<OTClaim | null>(null)

  const handlePrint = (claim: OTClaim) => {
    setPrintingClaim(claim)
    const monthLabel = format(new Date(claim.claim_month), 'MMMM yyyy')
    const prev = document.title
    document.title = `OT CLAIM - ${claim.user_name.toUpperCase()} (${monthLabel})`
    setTimeout(() => {
      window.print()
      document.title = prev
    }, 300)
  }

  // ── Render ──────────────────────────────────────────────────────────
  const displayClaims = adminView ? adminClaims : claims

  if (loading) return <div className="text-center py-12 text-text-tertiary text-sm">Loading...</div>

  return (
    <div className="max-w-4xl mx-auto">
      {/* ===== PRINT LAYOUT — hidden on screen, visible when printing ===== */}
      {printingClaim && (
        <div className="hidden print:block">
          <OTClaimPrintLayout claim={printingClaim} printMediaWrap />
        </div>
      )}

      {/* ===== INTERACTIVE CONTENT — visible on screen, hidden when printing ===== */}
      <div className="print:hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isAdmin && (
            <div className="flex gap-1 bg-surface-raised p-0.5 rounded-lg mr-3">
              <button onClick={() => setAdminView(false)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${!adminView ? 'bg-indigo-500/20 text-indigo-400' : 'text-text-tertiary hover:text-text-primary'}`}>My Claims</button>
              <button onClick={() => setAdminView(true)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${adminView ? 'bg-indigo-500/20 text-indigo-400' : 'text-text-tertiary hover:text-text-primary'}`}>All Submissions</button>
            </div>
          )}
        </div>
        {!adminView && (
          <Button size="sm" onClick={openNewForm}>
            <svg className="size-4 mr-1" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            New OT Claim
          </Button>
        )}
      </div>

      {/* Claims List */}
      {displayClaims.length === 0 ? (
        <EmptyState
          icon={EmptyIcons.clipboard}
          title={adminView ? 'No submissions yet' : 'No OT claims yet'}
          description={adminView ? 'Staff OT claims will appear here once submitted.' : 'Create your first OT claim to get started.'}
        />
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-raised text-text-tertiary text-xs uppercase">
                {adminView && <th className="px-4 py-3 text-left font-medium">Staff</th>}
                <th className="px-4 py-3 text-left font-medium">Month</th>
                <th className="px-4 py-3 text-left font-medium">Entries</th>
                <th className="px-4 py-3 text-left font-medium">Total Hours</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">{adminView ? 'Submitted' : 'Updated'}</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayClaims.map(c => {
                const badge = STATUS_BADGE[c.status] || STATUS_BADGE.draft
                return (
                  <tr key={c.id} className="hover:bg-surface-raised/50 transition-colors">
                    {adminView && <td className="px-4 py-3 font-medium text-text-primary">{toProperCase(c.user_name)}</td>}
                    <td className="px-4 py-3 text-text-primary font-medium">{format(new Date(c.claim_month), 'MMMM yyyy')}</td>
                    <td className="px-4 py-3 text-text-secondary">{c.entries.length}</td>
                    <td className="px-4 py-3 text-text-secondary">{c.total_hours}h</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                      {c.status === 'rejected' && c.reject_reason && (
                        <p className="text-[10px] text-red-400/80 mt-1 max-w-[160px] truncate" title={c.reject_reason}>{c.reject_reason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-tertiary text-xs">
                      {c.submitted_at ? format(new Date(c.submitted_at), 'dd/MM/yyyy') : format(new Date(c.updated_at), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => handlePrint(c)} className="px-2.5 py-1 rounded text-xs font-medium bg-surface-raised text-text-secondary hover:text-text-primary transition-colors">
                          <svg className="size-3.5 inline-block mr-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                          PDF
                        </button>
                        {!adminView && c.status !== 'approved' && (
                          <>
                            <button onClick={() => openEditForm(c)} className="px-2.5 py-1 rounded text-xs font-medium bg-surface-raised text-text-secondary hover:text-text-primary transition-colors">
                              Edit
                            </button>
                            {c.status !== 'submitted' && (
                              <button onClick={() => handleSubmitExisting(c)} className="px-2.5 py-1 rounded text-xs font-medium bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors">
                                {c.status === 'rejected' ? 'Resubmit' : 'Submit'}
                              </button>
                            )}
                            <button onClick={() => setDeletingId(c.id)} className="px-2.5 py-1 rounded text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                              Delete
                            </button>
                          </>
                        )}
                        {adminView && canApprove && c.status === 'submitted' && (
                          <>
                            <button onClick={() => handleApprove(c)} className="px-2.5 py-1 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors">
                              Approve
                            </button>
                            <button onClick={() => { setRejectingClaim(c); setRejectReason('') }} className="px-2.5 py-1 rounded text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                              Reject
                            </button>
                          </>
                        )}
                        {adminView && c.status === 'approved' && c.approved_by_name && (
                          <span className="text-[10px] text-text-muted">by {toProperCase(c.approved_by_name)}</span>
                        )}
                        {adminView && c.status === 'rejected' && c.rejected_by_name && (
                          <span className="text-[10px] text-red-400" title={c.reject_reason || ''}>Rejected by {toProperCase(c.rejected_by_name)}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── New / Edit Form Modal ──────────────────────────────────── */}
      <ModalDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingId ? 'Edit OT Claim' : 'New OT Claim'}
        size="xl"
      >
        <div className="space-y-4 p-5">
          {/* Month + Info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Month</Label>
              <Input type="month" value={formMonth} onChange={e => setFormMonth(e.target.value)} disabled={!!editingId} />
            </div>
            <div>
              <Label>Designation</Label>
              <Input value={formDesignation} onChange={e => setFormDesignation(e.target.value)} />
            </div>
            <div>
              <Label>Department</Label>
              <Input value={formDepartment} onChange={e => setFormDepartment(e.target.value)} />
            </div>
            <div>
              <Label>Reporting Manager / HOD</Label>
              <Input value={formManager} onChange={e => setFormManager(e.target.value)} />
            </div>
          </div>

          {/* Entries Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-text-primary">OT Entries</span>
              <button onClick={addEntry} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors">+ Add Entry</button>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-raised text-text-tertiary text-xs">
                    <th className="px-3 py-2 text-left font-medium w-[140px]">Date</th>
                    <th className="px-3 py-2 text-left font-medium w-[100px]">From</th>
                    <th className="px-3 py-2 text-left font-medium w-[100px]">To</th>
                    <th className="px-3 py-2 text-left font-medium w-[60px]">Hours</th>
                    <th className="px-3 py-2 text-left font-medium">Nature of Work</th>
                    <th className="px-3 py-2 w-[40px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((entry, idx) => (
                    <tr key={idx}>
                      <td className="px-2 py-1.5">
                        <Input type="date" value={entry.date} onChange={e => updateEntry(idx, 'date', e.target.value)} className="!text-xs !py-1" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="time" value={entry.from} onChange={e => updateEntry(idx, 'from', e.target.value)} className="!text-xs !py-1" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="time" value={entry.to} onChange={e => updateEntry(idx, 'to', e.target.value)} className="!text-xs !py-1" />
                      </td>
                      <td className="px-3 py-1.5 text-center text-text-secondary text-xs font-medium">
                        {calcHours(entry.from, entry.to) || '-'}
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={entry.nature} onChange={e => updateEntry(idx, 'nature', e.target.value)} placeholder="e.g. Support Call" className="!text-xs !py-1" />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {entries.length > 1 && (
                          <button onClick={() => removeEntry(idx)} className="text-red-400 hover:text-red-300 transition-colors">
                            <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-2">
              <span className="text-sm font-semibold text-text-primary">Total: {totalHours}h</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="secondary" size="sm" onClick={() => handleSave(false)} disabled={saving}>
              {saving ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button size="sm" onClick={() => handleSave(true)} disabled={saving}>
              {saving ? 'Submitting...' : 'Submit'}
            </Button>
          </div>
        </div>
      </ModalDialog>

      {/* ── Delete Confirm ──────────────────────────────────────── */}
      <ModalDialog open={!!deletingId} onClose={() => setDeletingId(null)} title="Delete OT Claim">
        <div className="p-5">
          <p className="text-sm text-text-secondary mb-4">Are you sure you want to delete this draft OT claim? This cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </ModalDialog>

      {/* ── Reject Modal ───────────────────────────────────────── */}
      <ModalDialog open={!!rejectingClaim} onClose={() => setRejectingClaim(null)} title="Reject OT Claim" size="sm">
        <div className="p-5 space-y-4">
          {rejectingClaim && (
            <p className="text-sm text-text-secondary">
              Reject <strong>{toProperCase(rejectingClaim.user_name)}</strong>&apos;s OT claim for <strong>{format(new Date(rejectingClaim.claim_month), 'MMMM yyyy')}</strong>?
            </p>
          )}
          <div>
            <Label required>Reason</Label>
            <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. Incomplete entries, wrong hours" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setRejectingClaim(null)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleReject}>Reject</Button>
          </div>
        </div>
      </ModalDialog>
      </div>{/* end print:hidden */}
    </div>
  )
}
