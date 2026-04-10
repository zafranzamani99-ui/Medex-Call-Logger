'use client'

import { useState, useEffect, useRef } from 'react'
import { createColumnHelper, type CellContext, type ColumnDef } from '@tanstack/react-table'
import type { Clinic, CustomColumn } from '@/lib/types'
import { RENEWAL_COLORS, toProperCase } from '@/lib/constants'

// WHY: Column definitions for the CRM data table.
// Cell renderers (EditableCell, MaskedCell, ToggleCell) are co-located here
// since they're small and tightly coupled to column definitions.

const columnHelper = createColumnHelper<Clinic>()

// ── Cell Renderers ──────────────────────────────────────────────────────

// Inline editable text cell — click to edit, blur/Enter saves, Escape cancels
function EditableCell({ getValue, row, column, table }: CellContext<Clinic, string | null>) {
  const initialValue = getValue() ?? ''
  const [value, setValue] = useState(initialValue)
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const mono = column.columnDef.meta?.mono

  useEffect(() => { setValue(getValue() ?? '') }, [getValue])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const commit = () => {
    setEditing(false)
    const trimmed = value.trim()
    if (trimmed !== initialValue) {
      table.options.meta?.updateData(row.original.clinic_code, column.id, trimmed || null)
    }
  }

  if (!editing) {
    return (
      <div
        className="group/cell flex items-center gap-1 min-h-[28px] px-1 -mx-1 rounded cursor-text hover:bg-surface-inset transition-colors"
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
      >
        <span className={`text-[13px] truncate ${initialValue ? 'text-text-primary' : 'text-text-muted italic'} ${mono ? 'font-mono' : ''}`}>
          {initialValue || '—'}
        </span>
        <svg className="size-3 text-text-muted opacity-0 group-hover/cell:opacity-100 ml-auto flex-shrink-0 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </div>
    )
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setValue(initialValue); setEditing(false) }
        e.stopPropagation()
      }}
      onClick={(e) => e.stopPropagation()}
      className={`w-full px-2 py-1 bg-surface-inset border border-accent/40 rounded text-[13px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent ${mono ? 'font-mono' : ''}`}
    />
  )
}

// Masked password cell — shows dots, eye icon to reveal, click to edit
function MaskedCell({ getValue, row, column, table }: CellContext<Clinic, string | null>) {
  const initialValue = getValue() ?? ''
  const [value, setValue] = useState(initialValue)
  const [editing, setEditing] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setValue(getValue() ?? '') }, [getValue])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const commit = () => {
    setEditing(false)
    const trimmed = value.trim()
    if (trimmed !== initialValue) {
      table.options.meta?.updateData(row.original.clinic_code, column.id, trimmed || null)
    }
  }

  if (!editing) {
    return (
      <div
        className="group/cell flex items-center gap-1 min-h-[28px] px-1 -mx-1 rounded cursor-text hover:bg-surface-inset transition-colors"
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
      >
        <span className="text-[13px] font-mono text-text-primary truncate">
          {initialValue ? (revealed ? initialValue : '••••••••') : <span className="text-text-muted italic">—</span>}
        </span>
        {initialValue && (
          <button
            onClick={(e) => { e.stopPropagation(); setRevealed(!revealed) }}
            className="text-text-muted hover:text-text-secondary p-0.5 flex-shrink-0 transition-colors"
          >
            <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {revealed ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              ) : (
                <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
              )}
            </svg>
          </button>
        )}
      </div>
    )
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setValue(initialValue); setEditing(false) }
        e.stopPropagation()
      }}
      onClick={(e) => e.stopPropagation()}
      className="w-full px-2 py-1 bg-surface-inset border border-accent/40 rounded text-[13px] text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent"
    />
  )
}

// Boolean toggle cell — click to toggle, saves immediately
function ToggleCell({ getValue, row, column, table }: CellContext<Clinic, boolean>) {
  const val = getValue()
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        table.options.meta?.updateData(row.original.clinic_code, column.id, !val)
      }}
      className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${val ? 'bg-accent' : 'bg-zinc-600'}`}
    >
      <span className={`inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform mt-[3px] ${val ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
    </button>
  )
}

// Renewal status badge — read-only color pill
function RenewalCell({ getValue }: CellContext<Clinic, string | null>) {
  const status = getValue()
  if (!status) return <span className="text-text-muted text-[13px]">—</span>
  const color = RENEWAL_COLORS[status]
  if (!color) return <span className="text-[13px] text-text-secondary">{status}</span>
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${color.bg} ${color.text}`}>
      {status}
    </span>
  )
}

// ── Column Definitions ──────────────────────────────────────────────────

// Extend column meta for our custom properties
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    mono?: boolean
    group?: string
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData> {
    updateData: (clinicCode: string, columnId: string, value: string | boolean | null) => void
  }
}

// Column order follows the Excel CRM file sequence:
// ACCT NO → CLINIC NAME → PHONE → MTN START → MTN END → PC TOTAL →
// CUSTOMER STATUS → RENEWAL STATUS → PRODUCT TYPE → WA → E-INV → VERSION →
// LKEY Lines → Address/State → Contact → Email → Support Name →
// then operational fields (not in Excel)

export const columns: ColumnDef<Clinic, unknown>[] = [
  // ── Excel CRM sequence ──

  // 1. ACCT NO
  columnHelper.accessor('clinic_code', {
    header: 'Acct No',
    size: 100,
    enableHiding: false,
    meta: { mono: true, group: 'CRM' },
    cell: ({ getValue }) => (
      <span className="font-mono text-[13px] text-indigo-400 font-medium">{getValue()}</span>
    ),
  }),
  // 2. CLINIC NAME
  columnHelper.accessor('clinic_name', {
    header: 'Clinic Name',
    size: 220,
    meta: { group: 'CRM' },
    cell: EditableCell,
  }),
  // 3. PHONE
  columnHelper.accessor('clinic_phone', {
    header: 'Phone',
    size: 130,
    meta: { mono: true, group: 'CRM' },
    cell: EditableCell,
  }),
  // 4. CMS/MHIS MTN START DATE
  columnHelper.accessor('mtn_start', {
    header: 'MTN Start',
    size: 110,
    meta: { group: 'CRM' },
    cell: ({ getValue }) => {
      const v = getValue()
      return <span className="text-[13px] text-text-secondary tabular-nums">{v ? v.split('-').reverse().join('/') : '—'}</span>
    },
  }),
  // 5. CMS/MHIS MTN END DATE
  columnHelper.accessor('mtn_expiry', {
    header: 'MTN End',
    size: 110,
    meta: { group: 'CRM' },
    cell: ({ getValue }) => {
      const v = getValue()
      return <span className="text-[13px] text-text-secondary tabular-nums">{v ? v.split('-').reverse().join('/') : '—'}</span>
    },
  }),
  // 6. CLOUD START DATE
  columnHelper.accessor('cloud_start', {
    header: 'Cloud Start',
    size: 110,
    meta: { group: 'CRM Dates' },
    cell: ({ getValue }) => {
      const v = getValue()
      return <span className="text-[13px] text-text-secondary tabular-nums">{v ? v.split('-').reverse().join('/') : '—'}</span>
    },
  }),
  // 7. CLOUD END DATE
  columnHelper.accessor('cloud_end', {
    header: 'Cloud End',
    size: 110,
    meta: { group: 'CRM Dates' },
    cell: ({ getValue }) => {
      const v = getValue()
      return <span className="text-[13px] text-text-secondary tabular-nums">{v ? v.split('-').reverse().join('/') : '—'}</span>
    },
  }),
  // 8. PC TOTAL
  columnHelper.accessor('workstation_count', {
    header: 'PC Total',
    size: 90,
    meta: { group: 'System' },
    cell: EditableCell,
  }),
  // 9. M1G/DEALER CASE
  columnHelper.accessor('m1g_dealer_case', {
    header: 'M1G/Dealer',
    size: 120,
    meta: { group: 'Other CRM' },
    cell: EditableCell,
  }),
  // 10. PASS TO DEALER/M1G
  columnHelper.accessor('pass_to_dealer', {
    header: 'Pass to Dealer',
    size: 120,
    meta: { group: 'Other CRM' },
    cell: EditableCell,
  }),
  // 11. CUSTOMER STATUS 2
  columnHelper.accessor('customer_status', {
    header: 'Cust Status',
    size: 120,
    meta: { group: 'CRM' },
    cell: ({ getValue }) => (
      <span className="text-[13px] text-text-secondary">{getValue() || '—'}</span>
    ),
  }),
  // 8. RENEWAL STATUS 2
  columnHelper.accessor('renewal_status', {
    header: 'Renewal',
    size: 130,
    meta: { group: 'CRM' },
    cell: RenewalCell,
    filterFn: (row, _columnId, filterValue: string[]) => {
      if (!filterValue || filterValue.length === 0) return true
      return filterValue.includes(row.getValue('renewal_status') as string)
    },
  }),
  // 13. PRODUCT
  columnHelper.accessor('product', {
    header: 'Product',
    size: 120,
    meta: { group: 'Billing' },
    cell: EditableCell,
  }),
  // 14. PRODUCT TYPE
  columnHelper.accessor('product_type', {
    header: 'Product Type',
    size: 120,
    meta: { group: 'CRM' },
    cell: ({ getValue }) => (
      <span className="text-[13px] text-text-secondary">{getValue() || '—'}</span>
    ),
    filterFn: (row, _columnId, filterValue: string[]) => {
      if (!filterValue || filterValue.length === 0) return true
      return filterValue.includes(row.getValue('product_type') as string)
    },
  }),
  // 15. Signed-up
  columnHelper.accessor('signed_up', {
    header: 'Signed-up',
    size: 100,
    meta: { group: 'Billing' },
    cell: EditableCell,
  }),
  // 16. WHATSAPP TRACKING STATUS
  columnHelper.accessor('has_whatsapp', {
    header: 'WA',
    size: 70,
    meta: { group: 'Features' },
    cell: ToggleCell,
  }),
  // 11. E-INV TRACKING STATUS
  columnHelper.accessor('has_e_invoice', {
    header: 'e-Inv',
    size: 70,
    meta: { group: 'Features' },
    cell: ToggleCell,
  }),
  // 12. UPGRADE VERSION
  columnHelper.accessor('current_program_version', {
    header: 'Version',
    size: 100,
    meta: { mono: true, group: 'System' },
    cell: EditableCell,
  }),
  // 19. CMS RUNNING NO. QUOTATION/PO
  columnHelper.accessor('cms_running_no', {
    header: 'CMS Running No',
    size: 140,
    meta: { group: 'Billing' },
    cell: EditableCell,
  }),
  // 20. GROUP
  columnHelper.accessor('clinic_group', {
    header: 'Group',
    size: 120,
    meta: { group: 'Company' },
    cell: EditableCell,
  }),
  // 21. COMPANY NAME
  columnHelper.accessor('company_name', {
    header: 'Company Name',
    size: 180,
    meta: { group: 'Company' },
    cell: EditableCell,
  }),
  // 22. CO. REG & BRN
  columnHelper.accessor('company_reg', {
    header: 'Co. Reg & BRN',
    size: 140,
    meta: { group: 'Company' },
    cell: EditableCell,
  }),
  // 23. Remark (rate for additional pc)
  columnHelper.accessor('remark_additional_pc', {
    header: 'Remark (PC Rate)',
    size: 160,
    meta: { group: 'Other CRM' },
    cell: EditableCell,
  }),
  // 24. Customer ID- Certificate No.
  columnHelper.accessor('customer_cert_no', {
    header: 'Customer ID/Cert',
    size: 140,
    meta: { group: 'Billing' },
    cell: EditableCell,
  }),
  // 25. CMS INSTALL DATE/LIVE DATE
  columnHelper.accessor('cms_install_date', {
    header: 'CMS Install Date',
    size: 120,
    meta: { group: 'CRM Dates' },
    cell: ({ getValue }) => {
      const v = getValue()
      return <span className="text-[13px] text-text-secondary tabular-nums">{v ? v.split('-').reverse().join('/') : '—'}</span>
    },
  }),
  // 26-30. LKEY Lines
  columnHelper.accessor('lkey_line1', {
    header: 'LKEY 1',
    size: 180,
    meta: { group: 'LKEY' },
    cell: EditableCell,
  }),
  columnHelper.accessor('lkey_line2', {
    header: 'LKEY 2',
    size: 180,
    meta: { group: 'LKEY' },
    cell: EditableCell,
  }),
  columnHelper.accessor('lkey_line3', {
    header: 'LKEY 3',
    size: 180,
    meta: { group: 'LKEY' },
    cell: EditableCell,
  }),
  columnHelper.accessor('lkey_line4', {
    header: 'LKEY 4',
    size: 180,
    meta: { group: 'LKEY' },
    cell: EditableCell,
  }),
  columnHelper.accessor('lkey_line5', {
    header: 'LKEY 5',
    size: 180,
    meta: { group: 'LKEY' },
    cell: EditableCell,
  }),
  // 31. Address1
  columnHelper.accessor('address1', {
    header: 'Address 1',
    size: 180,
    meta: { group: 'Address' },
    cell: EditableCell,
  }),
  // 32. Address2 (City)
  columnHelper.accessor('city', {
    header: 'City',
    size: 120,
    meta: { group: 'CRM' },
    cell: ({ getValue }) => (
      <span className="text-[13px] text-text-secondary">{getValue() || '—'}</span>
    ),
  }),
  // 33. Address3
  columnHelper.accessor('address3', {
    header: 'Address 3',
    size: 180,
    meta: { group: 'Address' },
    cell: EditableCell,
  }),
  // 34. Address4
  columnHelper.accessor('address4', {
    header: 'Address 4',
    size: 180,
    meta: { group: 'Address' },
    cell: EditableCell,
  }),
  // 35. State
  columnHelper.accessor('state', {
    header: 'State',
    size: 100,
    meta: { group: 'CRM' },
    cell: ({ getValue }) => (
      <span className="text-[13px] text-text-secondary">{getValue() || '—'}</span>
    ),
    filterFn: (row, _columnId, filterValue: string[]) => {
      if (!filterValue || filterValue.length === 0) return true
      return filterValue.includes(row.getValue('state') as string)
    },
  }),
  // 20. Contact Name
  columnHelper.accessor('registered_contact', {
    header: 'Contact Name',
    size: 140,
    meta: { group: 'CRM' },
    cell: EditableCell,
  }),
  // 37. Contact Tel1
  columnHelper.accessor('contact_tel', {
    header: 'Contact Tel',
    size: 130,
    meta: { mono: true, group: 'Location' },
    cell: EditableCell,
  }),
  // 38. EMAIL ID MAIN
  columnHelper.accessor('email_main', {
    header: 'Email',
    size: 180,
    meta: { group: 'CRM' },
    cell: EditableCell,
  }),
  // 22. EMAIL ID 2
  columnHelper.accessor('email_secondary', {
    header: 'Email 2',
    size: 180,
    meta: { group: 'CRM' },
    cell: EditableCell,
  }),
  // 40. RACE
  columnHelper.accessor('race', {
    header: 'Race',
    size: 80,
    meta: { group: 'Other CRM' },
    cell: ({ getValue }) => (
      <span className="text-[13px] text-text-secondary">{getValue() || '—'}</span>
    ),
  }),
  // 41. InvoiceNo-CMS/MTN/CLD
  columnHelper.accessor('invoice_no', {
    header: 'Invoice No',
    size: 140,
    meta: { group: 'Billing' },
    cell: EditableCell,
  }),
  // 42. Billing Address / AAMS ACC NO
  columnHelper.accessor('billing_address', {
    header: 'Billing Address',
    size: 180,
    meta: { group: 'Address' },
    cell: EditableCell,
  }),
  // 43. Account Manager
  columnHelper.accessor('account_manager', {
    header: 'Acc Manager',
    size: 120,
    meta: { group: 'Billing' },
    cell: ({ getValue }) => (
      <span className="text-[13px] text-text-secondary">{getValue() || '—'}</span>
    ),
  }),
  // 44. Support Name
  columnHelper.accessor('support_name', {
    header: 'Support Name',
    size: 120,
    meta: { group: 'CRM' },
    cell: ({ getValue }) => (
      <span className="text-[13px] text-text-secondary">{getValue() || '—'}</span>
    ),
  }),

  // 45. Info
  columnHelper.accessor('info', {
    header: 'Info',
    size: 140,
    meta: { group: 'Other CRM' },
    cell: EditableCell,
  }),
  // 46. Type
  columnHelper.accessor('clinic_type', {
    header: 'Type',
    size: 100,
    meta: { group: 'Company' },
    cell: EditableCell,
  }),
  // 47. Reason not using E-INV
  columnHelper.accessor('einv_no_reason', {
    header: 'E-INV Reason',
    size: 140,
    meta: { group: 'Other CRM' },
    cell: EditableCell,
  }),
  // 48. STATUS RENEWAL
  columnHelper.accessor('status_renewal', {
    header: 'Status Renewal',
    size: 120,
    meta: { group: 'Other CRM' },
    cell: EditableCell,
  }),
  // 49. REMARKS - FOLLOW UP
  columnHelper.accessor('remarks_followup', {
    header: 'Remarks/Follow Up',
    size: 200,
    meta: { group: 'Other CRM' },
    cell: EditableCell,
  }),

  // ── Operational fields (agent-managed, not in Excel) ──

  columnHelper.accessor('main_pc_name', {
    header: 'Main PC',
    size: 120,
    meta: { mono: true, group: 'System' },
    cell: EditableCell,
  }),
  columnHelper.accessor('current_db_version', {
    header: 'DB Ver',
    size: 80,
    meta: { mono: true, group: 'System' },
    cell: EditableCell,
  }),
  columnHelper.accessor('db_size', {
    header: 'DB Size',
    size: 80,
    meta: { mono: true, group: 'System' },
    cell: EditableCell,
  }),
  columnHelper.accessor('ram', {
    header: 'RAM',
    size: 80,
    meta: { group: 'System' },
    cell: EditableCell,
  }),
  columnHelper.accessor('processor', {
    header: 'Processor',
    size: 120,
    meta: { group: 'System' },
    cell: EditableCell,
  }),
  columnHelper.accessor('ultraviewer_id', {
    header: 'UV ID',
    size: 120,
    meta: { mono: true, group: 'Remote' },
    cell: EditableCell,
  }),
  columnHelper.accessor('ultraviewer_pw', {
    header: 'UV PW',
    size: 120,
    meta: { group: 'Remote' },
    cell: MaskedCell,
  }),
  columnHelper.accessor('anydesk_id', {
    header: 'AD ID',
    size: 120,
    meta: { mono: true, group: 'Remote' },
    cell: EditableCell,
  }),
  columnHelper.accessor('anydesk_pw', {
    header: 'AD PW',
    size: 120,
    meta: { group: 'Remote' },
    cell: MaskedCell,
  }),
  columnHelper.accessor('has_sst', {
    header: 'SST',
    size: 70,
    meta: { group: 'Features' },
    cell: ToggleCell,
  }),
  columnHelper.accessor('has_backup', {
    header: 'Backup',
    size: 70,
    meta: { group: 'Features' },
    cell: ToggleCell,
  }),
  columnHelper.accessor('has_ext_hdd', {
    header: 'Ext HDD',
    size: 80,
    meta: { group: 'Features' },
    cell: ToggleCell,
  }),
  columnHelper.accessor('clinic_notes', {
    header: 'Notes',
    size: 200,
    meta: { group: 'Other' },
    cell: EditableCell,
  }),
  columnHelper.accessor('last_updated_by_name', {
    header: 'Updated By',
    size: 120,
    meta: { group: 'Other' },
    cell: ({ getValue }) => {
      const v = getValue()
      return <span className="text-[13px] text-text-secondary">{v ? toProperCase(v) : '—'}</span>
    },
  }),
] as ColumnDef<Clinic, unknown>[]

// Default column visibility — key columns visible, rest togglable
export const DEFAULT_COLUMN_VISIBILITY: Record<string, boolean> = {
  // Core CRM columns (visible by default)
  clinic_code: true,
  clinic_name: true,
  clinic_phone: true,
  mtn_start: false,
  mtn_expiry: true,
  cloud_start: false,
  cloud_end: false,
  workstation_count: true,
  m1g_dealer_case: false,
  pass_to_dealer: false,
  customer_status: false,
  renewal_status: true,
  product: false,
  product_type: true,
  signed_up: false,
  has_whatsapp: false,
  has_e_invoice: false,
  current_program_version: true,
  cms_running_no: false,
  // Company (hidden)
  clinic_group: false,
  company_name: false,
  company_reg: false,
  clinic_type: false,
  remark_additional_pc: false,
  customer_cert_no: false,
  cms_install_date: false,
  // LKEY (hidden — too wide for default view)
  lkey_line1: false,
  lkey_line2: false,
  lkey_line3: false,
  lkey_line4: false,
  lkey_line5: false,
  // Address & Location
  address1: false,
  city: false,
  address3: false,
  address4: false,
  state: true,
  registered_contact: false,
  contact_tel: false,
  email_main: false,
  email_secondary: false,
  race: false,
  // Billing
  invoice_no: false,
  billing_address: false,
  account_manager: false,
  support_name: false,
  // Other CRM
  info: false,
  einv_no_reason: false,
  status_renewal: false,
  remarks_followup: false,
  // Operational (selectively visible)
  main_pc_name: true,
  current_db_version: false,
  db_size: false,
  ram: false,
  processor: false,
  ultraviewer_id: true,
  ultraviewer_pw: false,
  anydesk_id: false,
  anydesk_pw: false,
  has_sst: false,
  has_backup: false,
  has_ext_hdd: false,
  clinic_notes: false,
  last_updated_by_name: true,
}

// Column groups for the visibility menu
export const COLUMN_GROUPS = [
  { label: 'CRM (Core)', columns: ['clinic_code', 'clinic_name', 'clinic_phone', 'mtn_start', 'mtn_expiry', 'customer_status', 'renewal_status', 'product_type'] },
  { label: 'CRM Dates', columns: ['cloud_start', 'cloud_end', 'cms_install_date'] },
  { label: 'Company', columns: ['company_name', 'company_reg', 'clinic_group', 'clinic_type'] },
  { label: 'LKEY', columns: ['lkey_line1', 'lkey_line2', 'lkey_line3', 'lkey_line4', 'lkey_line5'] },
  { label: 'Address', columns: ['address1', 'city', 'address3', 'address4', 'billing_address'] },
  { label: 'Location', columns: ['state', 'registered_contact', 'contact_tel', 'email_main', 'email_secondary', 'support_name'] },
  { label: 'Billing', columns: ['product', 'cms_running_no', 'invoice_no', 'account_manager', 'signed_up', 'customer_cert_no'] },
  { label: 'System', columns: ['workstation_count', 'main_pc_name', 'current_program_version', 'current_db_version', 'db_size', 'ram', 'processor'] },
  { label: 'Remote', columns: ['ultraviewer_id', 'ultraviewer_pw', 'anydesk_id', 'anydesk_pw'] },
  { label: 'Features', columns: ['has_whatsapp', 'has_e_invoice', 'has_sst', 'has_backup', 'has_ext_hdd'] },
  { label: 'Other CRM', columns: ['m1g_dealer_case', 'pass_to_dealer', 'remark_additional_pc', 'race', 'info', 'einv_no_reason', 'status_renewal', 'remarks_followup'] },
  { label: 'Other', columns: ['clinic_notes', 'last_updated_by_name'] },
]

// Build columns array with dynamic custom columns appended
export function buildColumns(customCols: CustomColumn[]): ColumnDef<Clinic, unknown>[] {
  if (!customCols || customCols.length === 0) return columns

  const dynamicCols: ColumnDef<Clinic, unknown>[] = customCols
    .sort((a, b) => a.display_order - b.display_order)
    .map((cc) => ({
      id: `custom_${cc.column_key}`,
      header: cc.column_name,
      size: 140,
      meta: { group: 'Custom' },
      accessorFn: (row: Clinic) => (row.custom_data as Record<string, unknown>)?.[cc.column_key] ?? null,
      cell: cc.column_type === 'toggle'
        ? ToggleCell
        : EditableCell,
    }))

  return [...columns, ...dynamicCols] as ColumnDef<Clinic, unknown>[]
}
