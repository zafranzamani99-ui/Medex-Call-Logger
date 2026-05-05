'use client'

import { useEffect, useState } from 'react'
import { ModalDialog } from '@/components/Modal'
import { Input, Textarea, Label } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'

// WHY: Standalone plan edit. Inserts into ticket_plans (history), then
// denormalises latest values onto tickets so existing readers (CSV export,
// KB gen, WA draft, my-log) keep working untouched. The DB trigger on
// ticket_plans atomically marks any prior active row as superseded.

interface PlanEditModalProps {
  open: boolean
  onClose: () => void
  ticketId: string
  current: {
    next_step: string | null
    next_step_pic: string | null
    next_step_contact: string | null
  }
  userId: string
  userName: string
  onSaved: () => void
}

export default function PlanEditModal({ open, onClose, ticketId, current, userId, userName, onSaved }: PlanEditModalProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const [nextStep, setNextStep] = useState('')
  const [nextStepPic, setNextStepPic] = useState('')
  const [nextStepContact, setNextStepContact] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  // Re-pre-fill every time the modal opens
  useEffect(() => {
    if (open) {
      setNextStep(current.next_step || '')
      setNextStepPic(current.next_step_pic || '')
      setNextStepContact(current.next_step_contact || '')
      setReason('')
    }
  }, [open, current.next_step, current.next_step_pic, current.next_step_contact])

  const handleSave = async () => {
    if (saving) return
    setSaving(true)

    const trimmedStep = nextStep.trim()
    const trimmedPic = nextStepPic.trim()
    const trimmedContact = nextStepContact.trim()

    // 1. Insert ticket_plans row — DB trigger auto-supersedes prior active row
    const { error: planErr } = await supabase.from('ticket_plans').insert({
      ticket_id: ticketId,
      next_step: trimmedStep || null,
      next_step_pic: trimmedPic || null,
      next_step_contact: trimmedContact || null,
      set_by: userId,
      set_by_name: userName,
      reason: reason.trim() || 'manual',
    })
    if (planErr) {
      toast('Failed to save plan: ' + planErr.message, 'error')
      setSaving(false)
      return
    }

    // 2. Denormalise to tickets so existing readers see the new current
    const { error: ticketErr } = await supabase.from('tickets').update({
      next_step: trimmedStep || null,
      next_step_pic: trimmedPic || null,
      next_step_contact: trimmedContact || null,
      last_updated_by: userId,
      last_updated_by_name: userName,
      last_change_note: 'Plan updated',
      last_activity_at: new Date().toISOString(),
    }).eq('id', ticketId)
    if (ticketErr) {
      toast('Plan saved but ticket sync failed: ' + ticketErr.message, 'error')
      setSaving(false)
      return
    }

    setSaving(false)
    toast('Plan updated', 'success')
    onSaved()
    onClose()
  }

  return (
    <ModalDialog open={open} onClose={onClose} title="Update Plan / Next Step" size="md">
      <div className="p-4 space-y-3">
        <div>
          <Label>Next Step</Label>
          <Textarea
            value={nextStep}
            onChange={(e) => setNextStep(e.target.value)}
            rows={3}
            placeholder="What's the plan?"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>PIC</Label>
            <Input
              value={nextStepPic}
              onChange={(e) => setNextStepPic(e.target.value)}
              placeholder="Who to follow up with"
            />
          </div>
          <div>
            <Label>Contact</Label>
            <Input
              value={nextStepContact}
              onChange={(e) => setNextStepContact(e.target.value)}
              placeholder="Phone / WhatsApp"
            />
          </div>
        </div>
        <div>
          <Label>Reason (optional)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why is the plan changing?"
          />
        </div>
        <p className="text-xs text-text-muted">
          The previous plan will be preserved in history.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} loading={saving}>Save plan</Button>
        </div>
      </div>
    </ModalDialog>
  )
}
