'use client'

import { useState, useEffect } from 'react'
import { ModalDialog } from '@/components/Modal'
import Button from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'

// WHY: Quick-add for custom public holidays straight from the schedule page —
// avoids the trip to Settings for one-off company off-days.

const SCOPE_OPTIONS = [
  { value: 'federal', label: 'Federal (nationwide)' },
  { value: 'SEL', label: 'Selangor' },
  { value: 'KUL', label: 'Kuala Lumpur' },
  { value: 'JHR', label: 'Johor' },
  { value: 'KDH', label: 'Kedah' },
  { value: 'KTN', label: 'Kelantan' },
  { value: 'MLK', label: 'Melaka' },
  { value: 'NSN', label: 'Negeri Sembilan' },
  { value: 'PHG', label: 'Pahang' },
  { value: 'PNG', label: 'Penang' },
  { value: 'PRK', label: 'Perak' },
  { value: 'PLS', label: 'Perlis' },
  { value: 'SBH', label: 'Sabah' },
  { value: 'SWK', label: 'Sarawak' },
  { value: 'TRG', label: 'Terengganu' },
  { value: 'LBN', label: 'Labuan' },
  { value: 'PJY', label: 'Putrajaya' },
] as const

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  prefilledDate?: string
}

export default function MarkHolidayModal({ open, onClose, onSaved, prefilledDate }: Props) {
  const supabase = createClient()
  const { toast } = useToast()
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [scope, setScope] = useState('federal')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setDate(prefilledDate || '')
      setName('')
      setScope('federal')
    }
  }, [open, prefilledDate])

  const handleSave = async () => {
    if (!date || !name.trim()) {
      toast('Date and name required', 'error')
      return
    }
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const { error } = await supabase.from('public_holidays').insert({
      holiday_date: date,
      name: name.trim(),
      scope,
      created_by: session?.user.id || null,
    })
    setSaving(false)
    if (error) {
      toast(error.message.includes('duplicate') ? 'Already exists for that date + scope' : `Failed: ${error.message}`, 'error')
      return
    }
    toast('Holiday added', 'success')
    onSaved()
    onClose()
  }

  return (
    <ModalDialog open={open} onClose={onClose} title="Add Public Holiday" size="sm">
      <div className="p-4 space-y-3">
        <div>
          <Label required>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label required>Name</Label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Company: MEDEX Anniversary"
          />
        </div>
        <div>
          <Label>Scope</Label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            {SCOPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="text-[11px] text-text-tertiary mt-1">
            Federal shows on every calendar. State holidays show on the calendar only if Selangor or Kuala Lumpur; otherwise they only warn when scheduling for a clinic in that state.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || !date || !name.trim()}>
            {saving ? 'Saving...' : 'Add Holiday'}
          </Button>
        </div>
      </div>
    </ModalDialog>
  )
}
