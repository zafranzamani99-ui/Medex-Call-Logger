'use client'

import { useState, useEffect } from 'react'
import { ModalDialog } from '@/components/Modal'
import Button from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import StaffPicker from '@/components/StaffPicker'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'

// WHY: Quick "Mark Leave" entry — picks a staff member + date(s) and creates
// staff_leave rows. Per user direction, no approval flow; just a calendar overlay.

const REASONS = ['Annual', 'Medical', 'Emergency', 'Replacement', 'Other'] as const

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  agents: { id: string; name: string }[]
  prefilledDate?: string  // YYYY-MM-DD
}

export default function MarkLeaveModal({ open, onClose, onSaved, agents, prefilledDate }: Props) {
  const supabase = createClient()
  const { toast } = useToast()
  const [staffId, setStaffId] = useState<string | null>(null)
  const [staffName, setStaffName] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')  // optional — if set, creates a range
  const [reason, setReason] = useState<string>('Annual')
  const [otherReason, setOtherReason] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset on open
  useEffect(() => {
    if (open) {
      setStaffId(null)
      setStaffName(null)
      setStartDate(prefilledDate || '')
      setEndDate('')
      setReason('Annual')
      setOtherReason('')
    }
  }, [open, prefilledDate])

  const expandRange = (start: string, end: string): string[] => {
    if (!end || end <= start) return [start]
    const dates: string[] = []
    const cur = new Date(start)
    const stop = new Date(end)
    while (cur <= stop) {
      dates.push(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
    return dates
  }

  const handleSave = async () => {
    if (!staffId || !startDate) {
      toast('Pick a staff member and a date', 'error')
      return
    }
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const finalReason = reason === 'Other' ? (otherReason.trim() || 'Other') : reason
    const dates = expandRange(startDate, endDate)
    const rows = dates.map(d => ({
      staff_id: staffId,
      leave_date: d,
      reason: finalReason,
      created_by: session?.user.id || null,
    }))
    const { error } = await supabase
      .from('staff_leave')
      .upsert(rows, { onConflict: 'staff_id,leave_date', ignoreDuplicates: true })

    setSaving(false)
    if (error) {
      toast('Failed to save: ' + error.message, 'error')
      return
    }
    toast(
      dates.length === 1
        ? `${staffName} marked on leave`
        : `${staffName} marked on leave for ${dates.length} days`,
      'success'
    )
    onSaved()
    onClose()
  }

  return (
    <ModalDialog open={open} onClose={onClose} title="Mark Leave" size="sm">
      <div className="p-4 space-y-3">
        <div>
          <Label required>Staff</Label>
          <StaffPicker
            hideLabel
            agents={agents}
            value={staffId}
            displayValue={staffName}
            onChange={(id, name) => { setStaffId(id); setStaffName(name) }}
            placeholder="Search staff..."
            allowCustom={false}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label required>From</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>To <span className="text-text-muted text-xs">(optional)</span></Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate || undefined} />
          </div>
        </div>

        <div>
          <Label>Reason</Label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
          >
            {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {reason === 'Other' && (
          <div>
            <Label>Specify</Label>
            <Input
              type="text"
              value={otherReason}
              onChange={(e) => setOtherReason(e.target.value)}
              placeholder="e.g. Course / Training"
            />
          </div>
        )}

        {startDate && endDate && endDate > startDate && (
          <p className="text-xs text-text-tertiary">
            Will create {expandRange(startDate, endDate).length} leave entries.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || !staffId || !startDate}>
            {saving ? 'Saving...' : 'Mark Leave'}
          </Button>
        </div>
      </div>
    </ModalDialog>
  )
}
