'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Clinic } from '@/lib/types'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

// WHY: MEDEXCRM parity — Reports tab with three sub-reports:
// Maintenance (MTN expiry), Cloud Backup, E-Invoice adoption.
// Each shows summary cards + a detail table with export buttons.

type ReportTab = 'maintenance' | 'cloud' | 'einvoice'

const TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'cloud', label: 'Cloud Backup' },
  { id: 'einvoice', label: 'E-Invoice' },
]

// ─ Utility helpers ──────────────────────────────────────────────

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const ms = d.getTime() - Date.now()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

function safeDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toISOString().slice(0, 10)
}

// ─ Export helpers ──────────────────────────────────────────────

async function exportToExcel(filename: string, headers: string[], rows: string[][]) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Report')
  XLSX.writeFile(wb, `${filename}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

async function exportToPDF(elementId: string, filename: string) {
  const el = document.getElementById(elementId)
  if (!el) return
  const html2pdf = (await import('html2pdf.js')).default
  await html2pdf()
    .from(el)
    .set({
      filename: `${filename}-${new Date().toISOString().slice(0, 10)}.pdf`,
      margin: 10,
      jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4' },
      html2canvas: { scale: 2 },
    })
    .save()
}

// ─ Summary Card ─────────────────────────────────────────────────

function StatCard({ label, value, tone = 'default' }: {
  label: string
  value: number | string
  tone?: 'default' | 'green' | 'amber' | 'red' | 'indigo'
}) {
  const toneColor = {
    default: 'text-text-primary',
    green: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    indigo: 'text-indigo-400',
  }[tone]

  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <p className="text-[11px] text-text-muted uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${toneColor}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  )
}

// ─ Table primitives ─────────────────────────────────────────────

function ReportTable({ headers, rows, emptyMessage = 'No records' }: {
  headers: string[]
  rows: React.ReactNode[][]
  emptyMessage?: string
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 420px)' }}>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="bg-surface-raised">
              {headers.map(h => (
                <th key={h} className="sticky top-0 bg-surface-raised px-3 py-2 text-[11px] font-semibold text-text-muted uppercase tracking-wider border-b border-border whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="px-4 py-12 text-center text-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-surface-raised/50">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─ Maintenance Report ───────────────────────────────────────────

function MaintenanceReport({ clinics }: { clinics: Clinic[] }) {
  const { toast } = useToast()

  const rows = useMemo(() => {
    return clinics
      .map(c => ({ ...c, _days: daysUntil(c.mtn_expiry) }))
      .filter(c => c.mtn_expiry)
      .sort((a, b) => {
        if (a._days === null) return 1
        if (b._days === null) return -1
        return a._days - b._days
      })
  }, [clinics])

  const stats = useMemo(() => {
    let active = 0, expiring = 0, expired = 0
    for (const r of rows) {
      if (r._days === null) continue
      if (r._days < 0) expired++
      else if (r._days <= 30) expiring++
      else active++
    }
    return { active, expiring, expired, total: rows.length }
  }, [rows])

  const handleExportExcel = () => {
    const headers = ['Acct No', 'Clinic Name', 'State', 'MTN Start', 'MTN Expiry', 'Days Left', 'Status']
    const data = rows.map(r => [
      r.clinic_code,
      r.clinic_name,
      r.state || '',
      safeDate(r.mtn_start),
      safeDate(r.mtn_expiry),
      r._days === null ? '' : String(r._days),
      r._days === null ? '' : r._days < 0 ? 'Expired' : r._days <= 30 ? 'Expiring' : 'Active',
    ])
    exportToExcel('maintenance-report', headers, data)
    toast('Excel exported', 'success')
  }

  const handleExportPDF = async () => {
    await exportToPDF('maintenance-report-table', 'maintenance-report')
    toast('PDF exported', 'success')
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total Tracked" value={stats.total} />
        <StatCard label="Active" value={stats.active} tone="green" />
        <StatCard label="Expiring (≤ 30 days)" value={stats.expiring} tone="amber" />
        <StatCard label="Expired" value={stats.expired} tone="red" />
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] text-text-tertiary">Sorted by days remaining (expired first)</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleExportExcel}>Excel</Button>
          <Button variant="secondary" size="sm" onClick={handleExportPDF}>PDF</Button>
        </div>
      </div>

      <div id="maintenance-report-table">
        <ReportTable
          headers={['Acct No', 'Clinic', 'State', 'MTN Start', 'MTN Expiry', 'Days', 'Status']}
          rows={rows.map(r => {
            const status = r._days === null
              ? { label: '—', tone: 'text-text-muted' }
              : r._days < 0
                ? { label: 'Expired', tone: 'text-red-400' }
                : r._days <= 30
                  ? { label: 'Expiring', tone: 'text-amber-400' }
                  : { label: 'Active', tone: 'text-emerald-400' }
            return [
              <span key="c" className="font-mono text-text-tertiary">{r.clinic_code}</span>,
              r.clinic_name,
              r.state || '—',
              safeDate(r.mtn_start),
              safeDate(r.mtn_expiry),
              <span key="d" className="tabular-nums">{r._days === null ? '—' : r._days}</span>,
              <span key="s" className={`text-[11px] font-medium ${status.tone}`}>{status.label}</span>,
            ]
          })}
          emptyMessage="No clinics with MTN dates"
        />
      </div>
    </div>
  )
}

// ─ Cloud Backup Report ──────────────────────────────────────────

function CloudBackupReport({ clinics }: { clinics: Clinic[] }) {
  const { toast } = useToast()

  const rows = useMemo(() => {
    return clinics
      .filter(c => c.cloud_start || c.cloud_end || c.has_backup || c.has_ext_hdd)
      .map(c => ({ ...c, _days: daysUntil(c.cloud_end) }))
      .sort((a, b) => {
        if (a._days === null) return 1
        if (b._days === null) return -1
        return a._days - b._days
      })
  }, [clinics])

  const stats = useMemo(() => {
    let active = 0, expiring = 0, expired = 0, withBackup = 0, withExtHdd = 0
    for (const r of rows) {
      if (r.has_backup) withBackup++
      if (r.has_ext_hdd) withExtHdd++
      if (r._days === null) continue
      if (r._days < 0) expired++
      else if (r._days <= 30) expiring++
      else active++
    }
    return { active, expiring, expired, withBackup, withExtHdd, total: rows.length }
  }, [rows])

  const handleExportExcel = () => {
    const headers = ['Acct No', 'Clinic', 'State', 'Cloud Start', 'Cloud End', 'Days Left', 'Auto Backup', 'Ext HDD']
    const data = rows.map(r => [
      r.clinic_code,
      r.clinic_name,
      r.state || '',
      safeDate(r.cloud_start),
      safeDate(r.cloud_end),
      r._days === null ? '' : String(r._days),
      r.has_backup ? 'Yes' : 'No',
      r.has_ext_hdd ? 'Yes' : 'No',
    ])
    exportToExcel('cloud-backup-report', headers, data)
    toast('Excel exported', 'success')
  }

  const handleExportPDF = async () => {
    await exportToPDF('cloud-report-table', 'cloud-backup-report')
    toast('PDF exported', 'success')
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <StatCard label="Cloud — Active" value={stats.active} tone="green" />
        <StatCard label="Cloud — Expiring" value={stats.expiring} tone="amber" />
        <StatCard label="Cloud — Expired" value={stats.expired} tone="red" />
        <StatCard label="Auto Backup" value={stats.withBackup} tone="indigo" />
        <StatCard label="External HDD" value={stats.withExtHdd} tone="indigo" />
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] text-text-tertiary">Clinics with cloud service or backup configured</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleExportExcel}>Excel</Button>
          <Button variant="secondary" size="sm" onClick={handleExportPDF}>PDF</Button>
        </div>
      </div>

      <div id="cloud-report-table">
        <ReportTable
          headers={['Acct No', 'Clinic', 'State', 'Cloud Start', 'Cloud End', 'Days', 'Auto Backup', 'Ext HDD']}
          rows={rows.map(r => [
            <span key="c" className="font-mono text-text-tertiary">{r.clinic_code}</span>,
            r.clinic_name,
            r.state || '—',
            safeDate(r.cloud_start),
            safeDate(r.cloud_end),
            <span key="d" className="tabular-nums">{r._days === null ? '—' : r._days}</span>,
            <span key="b" className={r.has_backup ? 'text-emerald-400' : 'text-text-muted'}>{r.has_backup ? 'Yes' : 'No'}</span>,
            <span key="h" className={r.has_ext_hdd ? 'text-emerald-400' : 'text-text-muted'}>{r.has_ext_hdd ? 'Yes' : 'No'}</span>,
          ])}
          emptyMessage="No clinics with cloud or backup data"
        />
      </div>
    </div>
  )
}

// ─ E-Invoice Report ─────────────────────────────────────────────

type EinvStatus = 'registered' | 'not_registered' | 'exempt'

function EInvoiceReport({ clinics }: { clinics: Clinic[] }) {
  const { toast } = useToast()
  const [filter, setFilter] = useState<EinvStatus | 'all'>('all')

  const classifyEinv = (c: Clinic): EinvStatus => {
    if (c.has_e_invoice) return 'registered'
    if (c.einv_no_reason && c.einv_no_reason.trim()) return 'exempt'
    return 'not_registered'
  }

  const classified = useMemo(() => clinics.map(c => ({ ...c, _status: classifyEinv(c) })), [clinics])

  const stats = useMemo(() => {
    let registered = 0, notRegistered = 0, exempt = 0
    for (const c of classified) {
      if (c._status === 'registered') registered++
      else if (c._status === 'exempt') exempt++
      else notRegistered++
    }
    return { registered, notRegistered, exempt, total: classified.length }
  }, [classified])

  const rows = useMemo(() => {
    return classified
      .filter(c => filter === 'all' || c._status === filter)
      .sort((a, b) => a.clinic_code.localeCompare(b.clinic_code))
  }, [classified, filter])

  const statusLabel = (s: EinvStatus) => s === 'registered' ? 'Registered' : s === 'exempt' ? 'Exempt' : 'Not registered'
  const statusTone = (s: EinvStatus) => s === 'registered' ? 'text-emerald-400' : s === 'exempt' ? 'text-amber-400' : 'text-red-400'

  const handleExportExcel = () => {
    const headers = ['Acct No', 'Clinic', 'State', 'E-Invoice', 'Reason (if not registered)']
    const data = rows.map(r => [
      r.clinic_code,
      r.clinic_name,
      r.state || '',
      statusLabel(r._status),
      r.einv_no_reason || '',
    ])
    exportToExcel('einvoice-report', headers, data)
    toast('Excel exported', 'success')
  }

  const handleExportPDF = async () => {
    await exportToPDF('einv-report-table', 'einvoice-report')
    toast('PDF exported', 'success')
  }

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total Clinics" value={stats.total} />
        <StatCard label="Registered" value={stats.registered} tone="green" />
        <StatCard label="Not Registered" value={stats.notRegistered} tone="red" />
        <StatCard label="Exempt / Has Reason" value={stats.exempt} tone="amber" />
      </div>

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        {/* Filter */}
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-text-tertiary">Filter:</span>
          {(['all', 'registered', 'not_registered', 'exempt'] as const).map(k => {
            const label = k === 'all' ? 'All' : k === 'not_registered' ? 'Not Registered' : k === 'registered' ? 'Registered' : 'Exempt'
            return (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  filter === k
                    ? 'bg-accent text-white'
                    : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleExportExcel}>Excel</Button>
          <Button variant="secondary" size="sm" onClick={handleExportPDF}>PDF</Button>
        </div>
      </div>

      <div id="einv-report-table">
        <ReportTable
          headers={['Acct No', 'Clinic', 'State', 'Status', 'Reason']}
          rows={rows.map(r => [
            <span key="c" className="font-mono text-text-tertiary">{r.clinic_code}</span>,
            r.clinic_name,
            r.state || '—',
            <span key="s" className={`text-[11px] font-medium ${statusTone(r._status)}`}>{statusLabel(r._status)}</span>,
            <span key="r" className="text-text-tertiary">{r.einv_no_reason || '—'}</span>,
          ])}
          emptyMessage="No clinics match this filter"
        />
      </div>
    </div>
  )
}

// ─ Main Component ───────────────────────────────────────────────

export default function CrmReports() {
  const supabase = createClient()
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ReportTab>('maintenance')

  useEffect(() => {
    const load = async () => {
      // Paginated to handle Supabase 1000-row limit
      const PAGE_SIZE = 1000
      let all: Clinic[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('clinics')
          .select('*')
          .order('clinic_name')
          .range(from, from + PAGE_SIZE - 1)
        if (error || !data || data.length === 0) break
        all = all.concat(data as Clinic[])
        if (data.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }
      setClinics(all)
      setLoading(false)
    }
    load()
  }, [supabase])

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 skeleton rounded" />)}
        </div>
        <div className="h-96 skeleton rounded" />
      </div>
    )
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px ${
              activeTab === t.id
                ? 'text-text-primary border-accent'
                : 'text-text-tertiary border-transparent hover:text-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'maintenance' && <MaintenanceReport clinics={clinics} />}
      {activeTab === 'cloud' && <CloudBackupReport clinics={clinics} />}
      {activeTab === 'einvoice' && <EInvoiceReport clinics={clinics} />}
    </div>
  )
}
