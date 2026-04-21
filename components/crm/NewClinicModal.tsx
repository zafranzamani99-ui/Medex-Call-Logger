'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModalDialog } from '@/components/Modal'
import Button from '@/components/ui/Button'
import { Input, Label, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'

// WHY: MEDEXCRM parity — lets admins add a single clinic directly,
// instead of only via the bulk CSV upload path.

interface NewClinicModalProps {
  open: boolean
  onClose: () => void
  onCreated: (clinicCode: string) => void
}

const RENEWAL_STATUSES = ['VALID MN', 'EXPIRING', 'EXPIRED', 'LONG EXPIRED']

// Malaysian states — matches what CRM uploads contain
const STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
  'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor',
  'Terengganu', 'Kuala Lumpur', 'Labuan', 'Putrajaya',
]

const EMPTY_FORM = {
  clinic_code: '',
  clinic_name: '',
  clinic_phone: '',
  state: '',
  product_type: '',
  renewal_status: '',
  mtn_expiry: '',
  registered_contact: '',
  email_main: '',
  company_name: '',
  company_reg: '',
  clinic_group: '',
  address1: '',
}

export default function NewClinicModal({ open, onClose, onCreated }: NewClinicModalProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const [form, setForm] = useState(EMPTY_FORM)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)

  // Reset form whenever modal re-opens
  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM)
      setShowAdvanced(false)
      setCodeError(null)
    }
  }, [open])

  const isDirty = Object.values(form).some(v => v.trim() !== '')
  const canSubmit = form.clinic_code.trim().length > 0 && form.clinic_name.trim().length > 0 && !saving

  const update = (key: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
    if (key === 'clinic_code') setCodeError(null)
  }

  const handleClose = () => {
    if (saving) return
    if (isDirty && !confirm('Discard this new clinic?')) return
    onClose()
  }

  const handleSubmit = async () => {
    const code = form.clinic_code.trim().toUpperCase()
    const name = form.clinic_name.trim()
    if (!code || !name) return

    setSaving(true)
    setCodeError(null)

    // Check current session for audit attribution
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id || null
    let userName = 'system'
    if (userId) {
      const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', userId).single()
      if (profile) userName = profile.display_name
    }

    // Build the insert payload — only include non-empty fields so defaults apply for the rest
    const payload: Record<string, string | null> = {
      clinic_code: code,
      clinic_name: name,
      last_updated_by: userId,
      last_updated_by_name: userName,
    }
    const optionalFields: Array<keyof typeof form> = [
      'clinic_phone', 'state', 'product_type', 'renewal_status', 'mtn_expiry',
      'registered_contact', 'email_main', 'company_name', 'company_reg',
      'clinic_group', 'address1',
    ]
    for (const key of optionalFields) {
      const val = form[key].trim()
      if (val) payload[key] = val
    }

    const { data: created, error } = await supabase
      .from('clinics')
      .insert(payload)
      .select('id, clinic_code')
      .single()

    if (error) {
      // Postgres unique_violation on clinic_code
      if (error.code === '23505') {
        setCodeError(`Clinic code "${code}" already exists`)
      } else {
        toast(`Failed to create clinic: ${error.message}`, 'error')
      }
      setSaving(false)
      return
    }

    // Manual audit write — the clinics trigger is UPDATE-only (migration 042)
    // to avoid flooding audit_log during CSV uploads. Manual creates get a manual entry.
    await supabase.from('audit_log').insert({
      table_name: 'clinics',
      record_id: created.id,
      action: 'INSERT',
      changed_by: userName,
      old_data: null,
      new_data: payload,
    })

    toast(`Clinic ${code} created`, 'success')
    setSaving(false)
    onCreated(created.clinic_code)
    onClose()
  }

  return (
    <ModalDialog open={open} onClose={handleClose} title="New Clinic" size="lg">
      <div className="p-4 space-y-4">
        {/* Required fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="new-clinic-code" required>Clinic Code (ACCT NO)</Label>
            <Input
              id="new-clinic-code"
              value={form.clinic_code}
              onChange={e => update('clinic_code', e.target.value)}
              placeholder="e.g. KL001"
              error={!!codeError}
              autoFocus
            />
            {codeError && <p className="text-[11px] text-red-400 mt-1">{codeError}</p>}
          </div>
          <div>
            <Label htmlFor="new-clinic-name" required>Clinic Name</Label>
            <Input
              id="new-clinic-name"
              value={form.clinic_name}
              onChange={e => update('clinic_name', e.target.value)}
              placeholder="e.g. Dr. Lim Dental Clinic"
            />
          </div>
        </div>

        {/* Recommended fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="new-clinic-phone">Phone</Label>
            <Input
              id="new-clinic-phone"
              value={form.clinic_phone}
              onChange={e => update('clinic_phone', e.target.value)}
              placeholder="03-1234 5678"
            />
          </div>
          <div>
            <Label htmlFor="new-clinic-state">State</Label>
            <Select id="new-clinic-state" value={form.state} onChange={e => update('state', e.target.value)}>
              <option value="">—</option>
              {STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="new-clinic-product">Product Type</Label>
            <Input
              id="new-clinic-product"
              value={form.product_type}
              onChange={e => update('product_type', e.target.value)}
              placeholder="e.g. CMS, MHIS"
            />
          </div>
          <div>
            <Label htmlFor="new-clinic-renewal">Renewal Status</Label>
            <Select id="new-clinic-renewal" value={form.renewal_status} onChange={e => update('renewal_status', e.target.value)}>
              <option value="">—</option>
              {RENEWAL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="new-clinic-mtn">MTN Expiry</Label>
            <Input
              id="new-clinic-mtn"
              type="date"
              value={form.mtn_expiry}
              onChange={e => update('mtn_expiry', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="new-clinic-contact">Registered Contact</Label>
            <Input
              id="new-clinic-contact"
              value={form.registered_contact}
              onChange={e => update('registered_contact', e.target.value)}
              placeholder="e.g. Dr. Lim"
            />
          </div>
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(v => !v)}
          className="text-[12px] text-accent hover:underline"
        >
          {showAdvanced ? '− Hide advanced' : '+ Show advanced fields'}
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <Label htmlFor="new-clinic-email">Email (Main)</Label>
              <Input
                id="new-clinic-email"
                type="email"
                value={form.email_main}
                onChange={e => update('email_main', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="new-clinic-company">Company Name</Label>
              <Input
                id="new-clinic-company"
                value={form.company_name}
                onChange={e => update('company_name', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="new-clinic-reg">Company Reg / BRN</Label>
              <Input
                id="new-clinic-reg"
                value={form.company_reg}
                onChange={e => update('company_reg', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="new-clinic-group">Group</Label>
              <Input
                id="new-clinic-group"
                value={form.clinic_group}
                onChange={e => update('clinic_group', e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="new-clinic-address">Address</Label>
              <Input
                id="new-clinic-address"
                value={form.address1}
                onChange={e => update('address1', e.target.value)}
              />
            </div>
          </div>
        )}

        <p className="text-[11px] text-text-muted leading-relaxed">
          After creation, the full profile panel will open so you can fill in company info,
          system details, remote access credentials, and feature flags.
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-surface-inset/30">
        <Button variant="ghost" onClick={handleClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit} loading={saving}>
          Create clinic
        </Button>
      </div>
    </ModalDialog>
  )
}
