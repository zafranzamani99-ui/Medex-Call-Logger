'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Clinic } from '@/lib/types'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

// WHY: Reports tab — full MEDEXCRM parity PLUS our additions:
//   MEDEXCRM features replicated:
//     · Maintenance: Active / Expiring / Expired / Change Provider cards
//     · Cloud:       Active / Expiring / Expired / Terminated (pre-2024 cutoff)
//     · E-Invoice:   Total / Live / Pending + auto top-3 state breakdown cards
//     · Clickable cards → detail view
//     · M1G/Dealer + Product per-detail filters
//     · Row colour-coding by days-to-expiry (<7 red, ≤14 orange, ≤30 yellow; expired >365 red, ≥90 orange, <90 yellow)
//     · Full contact columns in detail (contact name, tel, company, email, state)
//     · Print → new window + auto-print (native-feel)
//   Our additions on top:
//     · Global filters: search / state / product / account manager / clinic group
//     · Window chips (≤7/14/30/60/90d / overdue)
//     · Renewal filter + sort controls
//     · Tab counters reflecting active filters
//     · Excel export with filter summary + generated-by metadata
//     · In-app PDF Preview Modal (save-as-PDF without leaving the app)
//     · Row WhatsApp + copy-phone quick actions

type ReportTab = 'maintenance' | 'cloud' | 'einvoice'
const TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'cloud', label: 'Cloud Backup' },
  { id: 'einvoice', label: 'E-Invoice' },
]

// MEDEXCRM: cloud expiries before this date are treated as "Terminated".
const CLOUD_TERMINATE_CUTOFF = new Date(2024, 0, 1)

// ─ Common helpers ──────────────────────────────────────────────

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

function waHref(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/\D/g, '').replace(/^0/, '60')
  if (!cleaned) return null
  return `https://wa.me/${cleaned}`
}

// Row colour class — matches MEDEXCRM palette.
// expiring: days >= 0 && days <= 30 → yellow/orange/red
// expired:  days < 0 → bucket by severity
function rowColourClass(days: number | null): string {
  if (days === null) return ''
  if (days < 0) {
    const abs = Math.abs(days)
    if (abs > 365) return 'bg-red-500/10'
    if (abs >= 90) return 'bg-orange-500/10'
    return 'bg-yellow-500/10'
  }
  if (days < 7) return 'bg-red-500/10'
  if (days <= 14) return 'bg-orange-500/10'
  if (days <= 30) return 'bg-yellow-500/10'
  return ''
}

// ─ Common filters (apply across all reports) ────────────────────

interface CommonFilters {
  search: string
  state: string
  productType: string
  accountManager: string
  clinicGroup: string
  dealer: string // MEDEXCRM parity — M1G/Dealer case filter
}

const EMPTY_COMMON: CommonFilters = {
  search: '', state: 'all', productType: 'all', accountManager: 'all',
  clinicGroup: 'all', dealer: 'all',
}

function applyCommonFilters(clinics: Clinic[], f: CommonFilters): Clinic[] {
  const q = f.search.trim().toLowerCase()
  return clinics.filter(c => {
    if (f.state !== 'all' && c.state !== f.state) return false
    if (f.productType !== 'all' && c.product_type !== f.productType) return false
    if (f.accountManager !== 'all' && c.account_manager !== f.accountManager) return false
    if (f.clinicGroup !== 'all' && c.clinic_group !== f.clinicGroup) return false
    if (f.dealer !== 'all' && c.m1g_dealer_case !== f.dealer) return false
    if (q) {
      const hay = `${c.clinic_code} ${c.clinic_name} ${c.registered_contact || ''} ${c.city || ''} ${c.company_name || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

function countActive(f: CommonFilters): number {
  let n = 0
  if (f.search.trim()) n++
  if (f.state !== 'all') n++
  if (f.productType !== 'all') n++
  if (f.accountManager !== 'all') n++
  if (f.clinicGroup !== 'all') n++
  if (f.dealer !== 'all') n++
  return n
}

function summaryText(f: CommonFilters): string {
  const parts: string[] = []
  if (f.search.trim()) parts.push(`search="${f.search.trim()}"`)
  if (f.state !== 'all') parts.push(`state=${f.state}`)
  if (f.productType !== 'all') parts.push(`product=${f.productType}`)
  if (f.accountManager !== 'all') parts.push(`AM=${f.accountManager}`)
  if (f.clinicGroup !== 'all') parts.push(`group=${f.clinicGroup}`)
  if (f.dealer !== 'all') parts.push(`dealer=${f.dealer}`)
  return parts.length > 0 ? parts.join(', ') : 'no filters'
}

// ─ Exports ──────────────────────────────────────────────────────

async function exportExcelWithMeta(opts: {
  filename: string
  title: string
  headers: string[]
  rows: string[][]
  filterSummary: string
  generatedBy: string
}) {
  const XLSX = await import('xlsx')
  const aoa: (string | number)[][] = [
    [opts.title],
    [`Generated: ${new Date().toLocaleString()}`],
    [`By: ${opts.generatedBy}`],
    [`Filters: ${opts.filterSummary}`],
    [`Records: ${opts.rows.length}`],
    [],
    opts.headers,
    ...opts.rows,
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = opts.headers.map(h => ({ wch: Math.max(12, h.length + 4) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Report')
  XLSX.writeFile(wb, `${opts.filename}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// MEDEXCRM-style native print: opens a new window with a standalone HTML document,
// then triggers the browser's print dialog 250ms later so the user gets the native
// "Save as PDF" flow. Full data (no scroll/viewport clipping).
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function printReportNewWindow(opts: {
  title: string
  subtitle?: string
  filterSummary: string
  generatedBy: string
  headers: string[]
  rows: (string | { value: string; colour?: string })[][]
  stats?: { label: string; value: number | string; tone?: string }[]
}) {
  const win = window.open('', '_blank')
  if (!win) {
    alert('Popup blocked. Allow popups for this site to use Print.')
    return
  }
  const dateStr = new Date().toLocaleString()
  const toneMap: Record<string, string> = {
    red: '#ef4444', amber: '#f59e0b', green: '#10b981', indigo: '#6366f1', default: '#18181b',
  }

  const statsHtml = opts.stats && opts.stats.length > 0
    ? `<div class="stats">${opts.stats.map(s => `
        <div class="stat">
          <div class="stat-label">${escapeHtml(s.label)}</div>
          <div class="stat-value" style="color:${toneMap[s.tone || 'default']}">${typeof s.value === 'number' ? s.value.toLocaleString() : escapeHtml(String(s.value))}</div>
        </div>`).join('')}</div>`
    : ''

  const bodyHtml = opts.rows.map(r => `<tr>${r.map(cell => {
    if (typeof cell === 'string') return `<td>${escapeHtml(cell)}</td>`
    const bg = cell.colour === 'red' ? 'rgba(239,68,68,0.15)'
      : cell.colour === 'orange' ? 'rgba(249,115,22,0.15)'
      : cell.colour === 'yellow' ? 'rgba(234,179,8,0.15)'
      : ''
    return `<td style="${bg ? `background:${bg};` : ''}">${escapeHtml(cell.value)}</td>`
  }).join('')}</tr>`).join('')

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(opts.title)}</title>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin: 16mm; color: #0f172a; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 13px; color: #475569; margin: 0 0 16px; font-weight: 400; }
    .meta { font-size: 11px; color: #475569; margin-bottom: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
    .meta span { display: block; }
    .meta b { color: #0f172a; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
    .stat { border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 10px; }
    .stat-label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-value { font-size: 18px; font-weight: 700; margin-top: 2px; }
    table { border-collapse: collapse; width: 100%; font-size: 10pt; }
    th { background-color: #1e40af; color: #fff; text-align: left; padding: 5px 6px; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
    td { border: 1px solid #e2e8f0; padding: 4px 6px; font-size: 10px; vertical-align: top; }
    tr:nth-child(even) td { background-color: #f8fafc; }
    .footer { text-align: center; font-size: 9px; color: #94a3b8; margin-top: 14px; border-top: 1px solid #e2e8f0; padding-top: 6px; }
    .action-bar { position: fixed; top: 8px; right: 8px; display: flex; gap: 6px; z-index: 1000; }
    .action-bar button { background: #1e40af; color: #fff; border: 0; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; }
    @media print {
      .action-bar { display: none !important; }
      @page { size: A4 landscape; margin: 10mm; }
      th { background-color: #1e40af !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tr:nth-child(even) td { background-color: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tr { page-break-inside: avoid; }
      td[style*="background"] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="action-bar">
    <button onclick="window.print()">Print / Save PDF</button>
    <button onclick="window.close()" style="background:#64748b">Close</button>
  </div>
  <h1>${escapeHtml(opts.title)}</h1>
  ${opts.subtitle ? `<h2>${escapeHtml(opts.subtitle)}</h2>` : ''}
  <div class="meta">
    <span><b>Generated:</b> ${escapeHtml(dateStr)}</span>
    <span><b>By:</b> ${escapeHtml(opts.generatedBy)}</span>
    <span style="grid-column: span 2"><b>Filters:</b> ${escapeHtml(opts.filterSummary)}</span>
    <span style="grid-column: span 2"><b>Records:</b> ${opts.rows.length}</span>
  </div>
  ${statsHtml}
  <table>
    <thead><tr>${opts.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${bodyHtml || `<tr><td colspan="${opts.headers.length}" style="text-align:center;padding:20px;color:#94a3b8">No records</td></tr>`}</tbody>
  </table>
  <div class="footer">Medex Call Logger — ${new Date().toISOString().slice(0, 10)}</div>
</body>
</html>`)
  win.document.close()
  setTimeout(() => win.print(), 250)
}

// ─ Print Preview Modal (in-app PDF save) ──────────────────────

interface PrintData {
  title: string
  subtitle?: string
  filterSummary: string
  generatedBy: string
  stats?: { label: string; value: number | string; tone?: string }[]
  headers: string[]
  rows: (string | { value: string; colour?: string })[][]
  pdfFilename: string
}

function PrintPreviewModal({ data, onClose }: { data: PrintData | null; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)

  const handleSavePDF = async () => {
    if (!rootRef.current || !data) return
    setSaving(true)
    try {
      const html2pdf = (await import('html2pdf.js')).default
      const opts = {
        filename: `${data.pdfFilename}-${new Date().toISOString().slice(0, 10)}.pdf`,
        margin: [10, 10, 10, 10],
        jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4' },
        html2canvas: { scale: 2, useCORS: true, windowWidth: rootRef.current.scrollWidth },
        pagebreak: { mode: ['css', 'legacy'], avoid: 'tr' },
      }
      await html2pdf().from(rootRef.current).set(opts as Record<string, unknown>).save()
    } finally {
      setSaving(false)
    }
  }

  if (!data) return null

  const cellBg = (c?: string) => {
    if (c === 'red') return 'rgba(239,68,68,0.15)'
    if (c === 'orange') return 'rgba(249,115,22,0.15)'
    if (c === 'yellow') return 'rgba(234,179,8,0.15)'
    return undefined
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 no-print"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface border border-border rounded-xl shadow-theme-lg w-full max-w-6xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0 no-print">
          <div>
            <h3 className="font-semibold text-text-primary">Print preview</h3>
            <p className="text-[11px] text-text-tertiary mt-0.5">This is exactly what the PDF will contain (all filtered records).</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={handleSavePDF} loading={saving}>Save PDF</Button>
            <button onClick={onClose} className="ml-1 text-text-muted hover:text-text-primary p-1" aria-label="Close">
              <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          <div ref={rootRef} className="print-portal bg-white text-black p-8">
            <div className="border-b border-gray-300 pb-3 mb-4">
              <h1 className="text-xl font-bold">{data.title}</h1>
              {data.subtitle && <p className="text-sm text-gray-600 mt-1">{data.subtitle}</p>}
              <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600 mt-3">
                <p><span className="font-medium">Generated:</span> {new Date().toLocaleString()}</p>
                <p><span className="font-medium">By:</span> {data.generatedBy}</p>
                <p className="col-span-2"><span className="font-medium">Filters:</span> {data.filterSummary}</p>
                <p className="col-span-2"><span className="font-medium">Records:</span> {data.rows.length}</p>
              </div>
            </div>

            {data.stats && data.stats.length > 0 && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                {data.stats.map(s => (
                  <div key={s.label} className="border border-gray-300 rounded p-2">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">{s.label}</p>
                    <p className="text-lg font-bold tabular-nums">{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="report-overflow">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-blue-700 text-white">
                    {data.headers.map(h => (
                      <th key={h} className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider border border-blue-800 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={data.headers.length} className="text-center text-gray-500 py-6 border border-gray-300">
                        No records
                      </td>
                    </tr>
                  )}
                  {data.rows.map((row, i) => (
                    <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                      {row.map((cell, j) => {
                        const val = typeof cell === 'string' ? cell : cell.value
                        const bg = typeof cell === 'string' ? undefined : cellBg(cell.colour)
                        return (
                          <td
                            key={j}
                            className="px-2 py-1 border border-gray-200 align-top text-[10px]"
                            style={bg ? { background: bg } : undefined}
                          >
                            {val}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[9px] text-gray-400 mt-4 border-t border-gray-200 pt-2">
              Medex Call Logger — {new Date().toISOString().slice(0, 10)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─ Summary Card ─────────────────────────────────────────────────

function StatCard({ label, value, tone = 'default', active, onClick, className }: {
  label: string
  value: number | string
  tone?: 'default' | 'green' | 'amber' | 'red' | 'indigo' | 'purple'
  active?: boolean
  onClick?: () => void
  className?: string
}) {
  const toneColor = {
    default: 'text-text-primary',
    green: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    indigo: 'text-indigo-400',
    purple: 'text-purple-400',
  }[tone]
  const toneBorder = active ? {
    default: 'border-text-primary/40',
    green: 'border-emerald-400/50',
    amber: 'border-amber-400/50',
    red: 'border-red-400/50',
    indigo: 'border-indigo-400/50',
    purple: 'border-purple-400/50',
  }[tone] : 'border-border'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`text-left bg-surface border ${toneBorder} rounded-lg p-4 transition-all ${onClick ? 'hover:border-accent/40 cursor-pointer' : 'cursor-default'} ${active ? 'ring-1 ring-accent/40' : ''} ${className || ''}`}
    >
      <p className="text-[11px] text-text-muted uppercase tracking-wider truncate">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${toneColor}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </button>
  )
}

// ─ Searchable select — max 10 results with live filter ─────────
// WHY: Product / AM / M1G/Dealer / reason lists can have hundreds of values.
// A native <select> forces scrolling. This component shows a search box,
// caps visible rows at 10, tells the user how many more matches exist, and
// closes on outside click or Escape.

function SearchableSelect({
  value, onChange, options, label, className,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  label: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? options.filter(o => o.toLowerCase().includes(q)) : options
  }, [options, search])

  const MAX = 10
  const visible = filtered.slice(0, MAX)
  const more = filtered.length - visible.length

  const isActive = value !== 'all'

  const commit = (v: string) => {
    onChange(v)
    setOpen(false)
    setSearch('')
  }

  return (
    <div ref={rootRef} className={`relative ${className || ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-2 text-[12px] rounded-md border transition-colors max-w-[220px] ${
          isActive
            ? 'bg-accent/10 border-accent/30 text-accent'
            : 'bg-surface-inset border-border text-text-secondary hover:border-accent/30'
        }`}
      >
        <span className="truncate">
          {label}: {isActive ? value : 'All'}
        </span>
        <svg className="size-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-surface border border-border rounded-lg shadow-theme-lg min-w-[220px] flex flex-col">
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="w-full px-2 py-1.5 bg-surface-inset border border-border rounded text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="max-h-[320px] overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => commit('all')}
              className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors ${
                !isActive ? 'bg-accent/10 text-accent font-medium' : 'text-text-secondary hover:bg-surface-raised'
              }`}
            >
              {label}: All{search ? '' : ` (${options.length})`}
            </button>

            {visible.length === 0 && (
              <p className="px-3 py-3 text-[12px] text-text-muted">No matches</p>
            )}

            {visible.map(o => (
              <button
                key={o}
                type="button"
                onClick={() => commit(o)}
                className={`w-full text-left px-3 py-1.5 text-[12px] truncate transition-colors ${
                  value === o ? 'bg-accent/10 text-accent font-medium' : 'text-text-secondary hover:bg-surface-raised'
                }`}
                title={o}
              >
                {o}
              </button>
            ))}

            {more > 0 && (
              <p className="px-3 py-2 text-[11px] text-text-muted border-t border-border/60 mt-1">
                +{more} more — refine your search
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─ Toolbar (shared across reports) ──────────────────────────────

function ReportToolbar({
  filters, onChange, options, onReset,
}: {
  filters: CommonFilters
  onChange: (patch: Partial<CommonFilters>) => void
  options: {
    state: string[]
    productType: string[]
    accountManager: string[]
    clinicGroup: string[]
    dealer: string[]
  }
  onReset: () => void
}) {
  const activeCount = countActive(filters)

  return (
    <div className="bg-surface border border-border rounded-lg p-3 mb-4 flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={filters.search}
          onChange={e => onChange({ search: e.target.value })}
          placeholder="Search clinic name / code / contact / city / company…"
          className="w-full pl-9 pr-3 py-2 bg-surface-inset border border-border rounded-md text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {([
        { key: 'state', label: 'State', opts: options.state },
        { key: 'productType', label: 'Product', opts: options.productType },
        { key: 'accountManager', label: 'AM', opts: options.accountManager },
        { key: 'clinicGroup', label: 'Group', opts: options.clinicGroup },
        { key: 'dealer', label: 'M1G/Dealer', opts: options.dealer },
      ] as const).map(({ key, label, opts }) => (
        <SearchableSelect
          key={key}
          label={label}
          value={filters[key]}
          options={opts}
          onChange={v => onChange({ [key]: v } as Partial<CommonFilters>)}
        />
      ))}

      {activeCount > 0 && (
        <button
          onClick={onReset}
          className="text-[12px] text-text-tertiary hover:text-text-primary px-2 py-2 rounded-md hover:bg-surface-raised transition-colors"
        >
          Reset filters ({activeCount})
        </button>
      )}
    </div>
  )
}

// ─ Row action buttons ───────────────────────────────────────────

function RowActions({ phone, wa }: { phone?: string | null; wa?: string | null }) {
  const { toast } = useToast()
  const doCopy = async (val: string, label: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(val)
      toast(`${label} copied`, 'success')
    } catch {
      toast('Copy failed', 'error')
    }
  }
  const waUrl = waHref(wa || phone)
  return (
    <div className="flex items-center gap-1">
      {phone && (
        <button
          onClick={e => doCopy(phone, 'Phone', e)}
          className="p-1 rounded hover:bg-surface-inset text-text-muted hover:text-text-primary transition-colors"
          title={`Copy phone: ${phone}`}
          aria-label="Copy phone"
        >
          <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
          </svg>
        </button>
      )}
      {waUrl && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="p-1 rounded hover:bg-emerald-500/10 text-emerald-400 transition-colors"
          title="Open WhatsApp"
          aria-label="Open WhatsApp"
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>
      )}
    </div>
  )
}

// ─ Table primitive ──────────────────────────────────────────────

const REPORT_PAGE_SIZE = 10

function ReportTable({ headers, rows, rowKeys, rowColours, onRowClick, emptyMessage = 'No records' }: {
  headers: string[]
  rows: React.ReactNode[][]
  rowKeys?: string[]
  rowColours?: string[] // bg-red-500/10 etc — matches MEDEXCRM row-expiry/expired coloring
  onRowClick?: (index: number) => void
  emptyMessage?: string
}) {
  const [page, setPage] = useState(0)
  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE))

  // Clamp page if rows shrink (filter applied while on a later page).
  useEffect(() => {
    if (page > pageCount - 1) setPage(0)
  }, [pageCount, page])

  const startIdx = page * REPORT_PAGE_SIZE
  const endIdx = Math.min(startIdx + REPORT_PAGE_SIZE, total)
  const visibleRows = rows.slice(startIdx, endIdx)
  const visibleColours = rowColours?.slice(startIdx, endIdx)
  const visibleKeys = rowKeys?.slice(startIdx, endIdx)

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto report-overflow">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="bg-surface-raised">
              {headers.map(h => (
                <th key={h} className="bg-surface-raised px-3 py-2 text-[11px] font-semibold text-text-muted uppercase tracking-wider border-b border-border whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {total === 0 && (
              <tr>
                <td colSpan={headers.length} className="px-4 py-12 text-center text-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {visibleRows.map((row, i) => {
              const bg = visibleColours?.[i] || ''
              const absoluteIndex = startIdx + i
              return (
                <tr
                  key={visibleKeys?.[i] ?? absoluteIndex}
                  className={`hover:bg-surface-raised/50 transition-colors ${bg} ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={onRowClick ? () => onRowClick(absoluteIndex) : undefined}
                >
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2">{cell}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-border bg-surface-raised/40 text-[12px]">
          <span className="text-text-muted tabular-nums">
            Showing <span className="text-text-secondary font-medium">{startIdx + 1}–{endIdx}</span> of <span className="text-text-secondary font-medium">{total.toLocaleString()}</span>
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="px-2 py-1 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-inset disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              title="First page"
            >
              «
            </button>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2.5 py-1 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-inset disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
              ‹ Previous
            </button>
            <span className="px-2 text-text-secondary tabular-nums">
              Page {page + 1} of {pageCount}
            </span>
            <button
              onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="px-2.5 py-1 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-inset disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
              Next ›
            </button>
            <button
              onClick={() => setPage(pageCount - 1)}
              disabled={page >= pageCount - 1}
              className="px-2 py-1 rounded text-text-tertiary hover:text-text-primary hover:bg-surface-inset disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              title="Last page"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─ Export button group (shared across sub-reports) ─────────────

function ExportButtons({ onExcel, onPdfPreview, onPrint }: {
  onExcel: () => void
  onPdfPreview: () => void
  onPrint: () => void
}) {
  return (
    <div className="flex gap-2">
      <Button variant="secondary" size="sm" onClick={onExcel}>Excel</Button>
      <Button variant="secondary" size="sm" onClick={onPdfPreview} title="Open in-app preview + save as PDF">PDF Preview</Button>
      <Button variant="secondary" size="sm" onClick={onPrint} title="Open native browser print dialog">Print</Button>
    </div>
  )
}

// Shared colour cell mapping for PDF export (from days number → colour label)
function dayColour(days: number | null): 'red' | 'orange' | 'yellow' | undefined {
  if (days === null) return undefined
  if (days < 0) {
    const abs = Math.abs(days)
    if (abs > 365) return 'red'
    if (abs >= 90) return 'orange'
    return 'yellow'
  }
  if (days < 7) return 'red'
  if (days <= 14) return 'orange'
  if (days <= 30) return 'yellow'
  return undefined
}

// ─ Maintenance Report ───────────────────────────────────────────

type MtnBucket = 'all' | 'active' | 'expiring' | 'expired' | 'changed'
type MtnWindow = 'all' | 'overdue' | '7' | '14' | '30' | '60' | '90'
type MtnSort = 'days_asc' | 'days_desc' | 'name' | 'state'

// "Change Provider" detector — MEDEXCRM uses RENEWAL STATUS 2 LIKE '%change%'.
// We scan both renewal_status and status_renewal for robustness.
function isChangeProvider(c: Clinic): boolean {
  const a = (c.renewal_status || '').toLowerCase()
  const b = (c.status_renewal || '').toLowerCase()
  return a.includes('change') || b.includes('change')
}

function MaintenanceReport({ clinics, generatedBy, onClinicClick, onCountChange, openPreview }: {
  clinics: Clinic[]
  generatedBy: string
  onClinicClick?: (code: string) => void
  onCountChange: (n: number) => void
  openPreview: (data: PrintData) => void
}) {
  const { toast } = useToast()
  const [bucket, setBucket] = useState<MtnBucket>('all')
  const [mtnWindow, setMtnWindow] = useState<MtnWindow>('all')
  const [renewalFilter, setRenewalFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<MtnSort>('days_asc')

  const renewalOptions = useMemo(() => {
    const s = new Set<string>()
    for (const c of clinics) if (c.renewal_status) s.add(c.renewal_status)
    return Array.from(s).sort()
  }, [clinics])

  // Compute bucket counts from unfiltered (by bucket) set — but applies common filters.
  const stats = useMemo(() => {
    let active = 0, expiring = 0, expired = 0, changed = 0
    for (const c of clinics) {
      if (isChangeProvider(c)) changed++
      const d = daysUntil(c.mtn_expiry)
      if (d === null) continue
      if (d < 0) expired++
      else if (d <= 30) expiring++
      else active++
    }
    return { active, expiring, expired, changed, total: active + expiring + expired }
  }, [clinics])

  const rows = useMemo(() => {
    let r = clinics.map(c => ({ ...c, _days: daysUntil(c.mtn_expiry), _changed: isChangeProvider(c) }))

    // Bucket filter (from clickable cards)
    if (bucket === 'active') r = r.filter(c => c._days !== null && c._days > 30)
    else if (bucket === 'expiring') r = r.filter(c => c._days !== null && c._days >= 0 && c._days <= 30)
    else if (bucket === 'expired') r = r.filter(c => c._days !== null && c._days < 0)
    else if (bucket === 'changed') r = r.filter(c => c._changed)
    else r = r.filter(c => c.mtn_expiry)

    // Window chips (secondary)
    if (mtnWindow !== 'all') {
      r = r.filter(c => {
        if (c._days === null) return false
        if (mtnWindow === 'overdue') return c._days < 0
        return c._days >= 0 && c._days <= Number(mtnWindow)
      })
    }

    if (renewalFilter !== 'all') r = r.filter(c => c.renewal_status === renewalFilter)

    r.sort((a, b) => {
      if (sortBy === 'name') return a.clinic_name.localeCompare(b.clinic_name)
      if (sortBy === 'state') return (a.state || '').localeCompare(b.state || '')
      const ad = a._days ?? Number.POSITIVE_INFINITY
      const bd = b._days ?? Number.POSITIVE_INFINITY
      return sortBy === 'days_asc' ? ad - bd : bd - ad
    })
    return r
  }, [clinics, bucket, mtnWindow, renewalFilter, sortBy])

  useEffect(() => { onCountChange(rows.length) }, [rows.length, onCountChange])

  const filterSummary = `bucket=${bucket}, window=${mtnWindow}, renewal=${renewalFilter}, sort=${sortBy}`
  const titleForBucket = bucket === 'changed' ? 'Clinic Change Provider'
    : bucket === 'active' ? 'Maintenance Active'
    : bucket === 'expiring' ? 'Maintenance Expiring (30 days)'
    : bucket === 'expired' ? 'MTN Expired'
    : 'Maintenance Report'

  const statsForExport = [
    { label: 'Active', value: stats.active, tone: 'green' },
    { label: 'Expiring ≤30d', value: stats.expiring, tone: 'amber' },
    { label: 'Expired', value: stats.expired, tone: 'red' },
    { label: 'Change Provider', value: stats.changed, tone: 'purple' },
  ]

  const excelHeaders = ['Acct No', 'Clinic Name', 'MTN Start', 'MTN End', 'Days', 'Product', 'Product Type', 'Renewal', 'Email', 'Contact Name', 'Contact Tel', 'Company Name', 'M1G/Dealer', 'AM', 'State']
  const buildExcelRow = (r: (Clinic & { _days: number | null })) => [
    r.clinic_code, r.clinic_name, safeDate(r.mtn_start), safeDate(r.mtn_expiry),
    r._days === null ? '' : String(r._days),
    r.product || r.product_type || '', r.product_type || '',
    r.renewal_status || r.status_renewal || '',
    r.email_main || '', r.registered_contact || '', r.clinic_phone || r.contact_tel || '',
    r.company_name || '', r.m1g_dealer_case || '', r.account_manager || '', r.state || '',
  ]

  const handleExcel = async () => {
    await exportExcelWithMeta({
      filename: 'maintenance-report',
      title: `Medex — ${titleForBucket}`,
      filterSummary, generatedBy,
      headers: excelHeaders,
      rows: rows.map(buildExcelRow),
    })
    toast('Excel exported', 'success')
  }

  const buildPdfRow = (r: (Clinic & { _days: number | null })) => {
    const col = dayColour(r._days)
    return [
      r.clinic_code, r.clinic_name, safeDate(r.mtn_start), safeDate(r.mtn_expiry),
      { value: r._days === null ? '—' : String(r._days), colour: col },
      r.product || r.product_type || '—',
      r.product_type || '—',
      r.renewal_status || r.status_renewal || '—',
      r.registered_contact || '—', r.clinic_phone || r.contact_tel || '—',
      r.company_name || '—', r.m1g_dealer_case || '—', r.state || '—',
    ]
  }
  const pdfHeaders = ['Acct No', 'Clinic', 'MTN Start', 'MTN End', 'Days', 'Product', 'Product Type', 'Renewal', 'Contact', 'Tel', 'Company', 'M1G/Dealer', 'State']

  const handlePDFPreview = () => {
    openPreview({
      title: `Medex — ${titleForBucket}`,
      subtitle: 'MTN expiry tracking',
      filterSummary, generatedBy,
      pdfFilename: 'maintenance-report',
      stats: statsForExport,
      headers: pdfHeaders,
      rows: rows.map(buildPdfRow),
    })
  }

  const handlePrint = () => {
    printReportNewWindow({
      title: `Medex — ${titleForBucket}`,
      subtitle: 'MTN expiry tracking',
      filterSummary, generatedBy,
      stats: statsForExport,
      headers: pdfHeaders,
      rows: rows.map(buildPdfRow),
    })
  }

  return (
    <div>
      {/* MEDEXCRM-parity 4 cards — clickable */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Maintenance Active" value={stats.active} tone="green"
          active={bucket === 'active'}
          onClick={() => setBucket(bucket === 'active' ? 'all' : 'active')} />
        <StatCard label="Expiring (30 days)" value={stats.expiring} tone="amber"
          active={bucket === 'expiring'}
          onClick={() => setBucket(bucket === 'expiring' ? 'all' : 'expiring')} />
        <StatCard label="MTN Expired" value={stats.expired} tone="red"
          active={bucket === 'expired'}
          onClick={() => setBucket(bucket === 'expired' ? 'all' : 'expired')} />
        <StatCard label="Change Provider" value={stats.changed} tone="purple"
          active={bucket === 'changed'}
          onClick={() => setBucket(bucket === 'changed' ? 'all' : 'changed')} />
      </div>

      {/* Secondary filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[12px] text-text-tertiary">Expiry window:</span>
        {([
          { v: 'all' as MtnWindow, label: 'All' },
          { v: 'overdue' as MtnWindow, label: 'Overdue' },
          { v: '7' as MtnWindow, label: '≤7d' },
          { v: '14' as MtnWindow, label: '≤14d' },
          { v: '30' as MtnWindow, label: '≤30d' },
          { v: '60' as MtnWindow, label: '≤60d' },
          { v: '90' as MtnWindow, label: '≤90d' },
        ]).map(({ v, label }) => (
          <button
            key={v}
            onClick={() => setMtnWindow(v)}
            className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
              mtnWindow === v
                ? 'bg-accent/15 border-accent/40 text-accent'
                : 'bg-surface border-border text-text-secondary hover:border-accent/30'
            }`}
          >
            {label}
          </button>
        ))}

        <div className="w-px h-5 bg-border mx-1" />

        <SearchableSelect
          label="Renewal"
          value={renewalFilter}
          options={renewalOptions}
          onChange={setRenewalFilter}
        />

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as MtnSort)}
          className="px-2 py-1 text-[12px] bg-surface border border-border rounded text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="days_asc">Sort: Days ↑</option>
          <option value="days_desc">Sort: Days ↓</option>
          <option value="name">Sort: Name</option>
          <option value="state">Sort: State</option>
        </select>

        <div className="ml-auto">
          <ExportButtons onExcel={handleExcel} onPdfPreview={handlePDFPreview} onPrint={handlePrint} />
        </div>
      </div>

      <ReportTable
        headers={['Acct No', 'Clinic', 'MTN Start', 'MTN End', 'Days', 'Product', 'Contact', 'Tel', 'Company', 'M1G/Dealer', 'State', '']}
        rowKeys={rows.map(r => r.id)}
        rowColours={rows.map(r => rowColourClass(r._days))}
        onRowClick={onClinicClick ? (i) => onClinicClick(rows[i].clinic_code) : undefined}
        rows={rows.map(r => {
          const tone = r._days === null ? 'text-text-muted'
            : r._days < 0 ? 'text-red-400'
            : r._days <= 30 ? 'text-amber-400'
            : 'text-emerald-400'
          return [
            <span key="c" className="font-mono text-text-tertiary">{r.clinic_code}</span>,
            r.clinic_name,
            safeDate(r.mtn_start),
            safeDate(r.mtn_expiry),
            <span key="d" className={`tabular-nums font-semibold ${tone}`}>{r._days === null ? '—' : r._days}</span>,
            <span key="p" className="text-[12px] text-text-tertiary">{r.product || r.product_type || '—'}</span>,
            <span key="ct" className="text-[12px]">{r.registered_contact || '—'}</span>,
            <span key="tl" className="font-mono text-[12px] text-text-tertiary">{r.clinic_phone || r.contact_tel || '—'}</span>,
            <span key="co" className="text-[12px] text-text-tertiary truncate block max-w-[180px]" title={r.company_name || ''}>{r.company_name || '—'}</span>,
            <span key="dl" className="text-[11px] text-text-muted">{r.m1g_dealer_case || '—'}</span>,
            r.state || '—',
            <RowActions key="a" phone={r.clinic_phone || r.contact_tel} wa={r.clinic_phone || r.contact_tel} />,
          ]
        })}
        emptyMessage="No clinics match your filters"
      />
    </div>
  )
}

// ─ Cloud Backup Report ──────────────────────────────────────────

type CloudBucket = 'all' | 'active' | 'expiring' | 'expired' | 'terminated'
type CloudWindow = 'all' | 'overdue' | '30' | '60' | '90'

function CloudBackupReport({ clinics, generatedBy, onClinicClick, onCountChange, openPreview }: {
  clinics: Clinic[]
  generatedBy: string
  onClinicClick?: (code: string) => void
  onCountChange: (n: number) => void
  openPreview: (data: PrintData) => void
}) {
  const { toast } = useToast()
  const [bucket, setBucket] = useState<CloudBucket>('all')
  const [cloudWindow, setCloudWindow] = useState<CloudWindow>('all')
  const [hasBackup, setHasBackup] = useState<'all' | 'yes' | 'no'>('all')
  const [hasExtHdd, setHasExtHdd] = useState<'all' | 'yes' | 'no'>('all')

  const stats = useMemo(() => {
    let active = 0, expiring = 0, expired = 0, terminated = 0
    let withBackup = 0, withExtHdd = 0
    for (const c of clinics) {
      if (c.has_backup) withBackup++
      if (c.has_ext_hdd) withExtHdd++
      const d = daysUntil(c.cloud_end)
      if (d === null) continue
      if (d < 0) {
        const end = new Date(c.cloud_end!)
        if (!isNaN(end.getTime()) && end < CLOUD_TERMINATE_CUTOFF) terminated++
        else expired++
      } else if (d <= 30) expiring++
      else active++
    }
    return { active, expiring, expired, terminated, withBackup, withExtHdd, total: active + expiring + expired + terminated }
  }, [clinics])

  const rows = useMemo(() => {
    let r = clinics
      .filter(c => c.cloud_start || c.cloud_end || c.has_backup || c.has_ext_hdd)
      .map(c => ({ ...c, _days: daysUntil(c.cloud_end) }))

    if (bucket === 'active') r = r.filter(c => c._days !== null && c._days > 30)
    else if (bucket === 'expiring') r = r.filter(c => c._days !== null && c._days >= 0 && c._days <= 30)
    else if (bucket === 'expired') r = r.filter(c => {
      if (c._days === null || c._days >= 0) return false
      const end = new Date(c.cloud_end!)
      return !isNaN(end.getTime()) && end >= CLOUD_TERMINATE_CUTOFF
    })
    else if (bucket === 'terminated') r = r.filter(c => {
      if (c._days === null || c._days >= 0) return false
      const end = new Date(c.cloud_end!)
      return !isNaN(end.getTime()) && end < CLOUD_TERMINATE_CUTOFF
    })

    if (cloudWindow !== 'all') {
      r = r.filter(c => {
        if (c._days === null) return false
        if (cloudWindow === 'overdue') return c._days < 0
        return c._days >= 0 && c._days <= Number(cloudWindow)
      })
    }
    if (hasBackup !== 'all') r = r.filter(c => hasBackup === 'yes' ? c.has_backup : !c.has_backup)
    if (hasExtHdd !== 'all') r = r.filter(c => hasExtHdd === 'yes' ? c.has_ext_hdd : !c.has_ext_hdd)

    r.sort((a, b) => (a._days ?? Number.POSITIVE_INFINITY) - (b._days ?? Number.POSITIVE_INFINITY))
    return r
  }, [clinics, bucket, cloudWindow, hasBackup, hasExtHdd])

  useEffect(() => { onCountChange(rows.length) }, [rows.length, onCountChange])

  const filterSummary = `bucket=${bucket}, window=${cloudWindow}, backup=${hasBackup}, extHdd=${hasExtHdd}`

  const titleForBucket = bucket === 'terminated' ? 'Terminate Cloud Backup'
    : bucket === 'active' ? 'Cloud Backup Active'
    : bucket === 'expiring' ? 'Cloud Backup Expiring (30 days)'
    : bucket === 'expired' ? 'Cloud Backup Expired'
    : 'Cloud Backup Report'

  const excelHeaders = ['Acct No', 'Clinic Name', 'Cloud Start', 'Cloud End', 'Days', 'Product', 'Product Type', 'Auto Backup', 'Ext HDD', 'Contact Name', 'Contact Tel', 'Company Name', 'M1G/Dealer', 'State']
  const buildExcelRow = (r: (Clinic & { _days: number | null })) => [
    r.clinic_code, r.clinic_name, safeDate(r.cloud_start), safeDate(r.cloud_end),
    r._days === null ? '' : String(r._days),
    r.product || '', r.product_type || '',
    r.has_backup ? 'Yes' : 'No', r.has_ext_hdd ? 'Yes' : 'No',
    r.registered_contact || '', r.clinic_phone || r.contact_tel || '',
    r.company_name || '', r.m1g_dealer_case || '', r.state || '',
  ]

  const handleExcel = async () => {
    await exportExcelWithMeta({
      filename: 'cloud-backup-report',
      title: `Medex — ${titleForBucket}`,
      filterSummary, generatedBy,
      headers: excelHeaders,
      rows: rows.map(buildExcelRow),
    })
    toast('Excel exported', 'success')
  }

  const statsForExport = [
    { label: 'Active', value: stats.active, tone: 'green' },
    { label: 'Expiring ≤30d', value: stats.expiring, tone: 'amber' },
    { label: 'Expired', value: stats.expired, tone: 'red' },
    { label: 'Terminated', value: stats.terminated, tone: 'purple' },
  ]

  const buildPdfRow = (r: (Clinic & { _days: number | null })) => {
    const col = dayColour(r._days)
    return [
      r.clinic_code, r.clinic_name, safeDate(r.cloud_start), safeDate(r.cloud_end),
      { value: r._days === null ? '—' : String(r._days), colour: col },
      r.has_backup ? 'Yes' : 'No', r.has_ext_hdd ? 'Yes' : 'No',
      r.registered_contact || '—', r.clinic_phone || r.contact_tel || '—',
      r.company_name || '—', r.m1g_dealer_case || '—', r.state || '—',
    ]
  }
  const pdfHeaders = ['Acct No', 'Clinic', 'Cloud Start', 'Cloud End', 'Days', 'Backup', 'Ext HDD', 'Contact', 'Tel', 'Company', 'M1G/Dealer', 'State']

  const handlePDFPreview = () => {
    openPreview({
      title: `Medex — ${titleForBucket}`,
      subtitle: 'Cloud service expiry + local backup coverage',
      filterSummary, generatedBy,
      pdfFilename: 'cloud-backup-report',
      stats: statsForExport,
      headers: pdfHeaders,
      rows: rows.map(buildPdfRow),
    })
  }
  const handlePrint = () => {
    printReportNewWindow({
      title: `Medex — ${titleForBucket}`,
      subtitle: 'Cloud service expiry + local backup coverage',
      filterSummary, generatedBy,
      stats: statsForExport,
      headers: pdfHeaders,
      rows: rows.map(buildPdfRow),
    })
  }

  return (
    <div>
      {/* MEDEXCRM-parity 4 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Cloud Backup Active" value={stats.active} tone="green"
          active={bucket === 'active'}
          onClick={() => setBucket(bucket === 'active' ? 'all' : 'active')} />
        <StatCard label="Expiring (30 days)" value={stats.expiring} tone="amber"
          active={bucket === 'expiring'}
          onClick={() => setBucket(bucket === 'expiring' ? 'all' : 'expiring')} />
        <StatCard label="Cloud Expired" value={stats.expired} tone="red"
          active={bucket === 'expired'}
          onClick={() => setBucket(bucket === 'expired' ? 'all' : 'expired')} />
        <StatCard label="Terminate (pre-2024)" value={stats.terminated} tone="purple"
          active={bucket === 'terminated'}
          onClick={() => setBucket(bucket === 'terminated' ? 'all' : 'terminated')} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[12px] text-text-tertiary">Cloud window:</span>
        {([
          { v: 'all' as CloudWindow, label: 'All' },
          { v: 'overdue' as CloudWindow, label: 'Overdue' },
          { v: '30' as CloudWindow, label: '≤30d' },
          { v: '60' as CloudWindow, label: '≤60d' },
          { v: '90' as CloudWindow, label: '≤90d' },
        ]).map(({ v, label }) => (
          <button
            key={v}
            onClick={() => setCloudWindow(v)}
            className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
              cloudWindow === v ? 'bg-accent/15 border-accent/40 text-accent' : 'bg-surface border-border text-text-secondary hover:border-accent/30'
            }`}
          >
            {label}
          </button>
        ))}

        <div className="w-px h-5 bg-border mx-1" />

        <span className="text-[12px] text-text-tertiary">Backup:</span>
        {(['all', 'yes', 'no'] as const).map(v => (
          <button
            key={v}
            onClick={() => setHasBackup(v)}
            className={`px-2 py-1 text-[11px] rounded border transition-colors ${
              hasBackup === v ? 'bg-accent/15 border-accent/40 text-accent' : 'bg-surface border-border text-text-secondary'
            }`}
          >
            {v === 'all' ? 'Any' : v === 'yes' ? 'Yes' : 'No'}
          </button>
        ))}

        <span className="text-[12px] text-text-tertiary ml-1">Ext HDD:</span>
        {(['all', 'yes', 'no'] as const).map(v => (
          <button
            key={v}
            onClick={() => setHasExtHdd(v)}
            className={`px-2 py-1 text-[11px] rounded border transition-colors ${
              hasExtHdd === v ? 'bg-accent/15 border-accent/40 text-accent' : 'bg-surface border-border text-text-secondary'
            }`}
          >
            {v === 'all' ? 'Any' : v === 'yes' ? 'Yes' : 'No'}
          </button>
        ))}

        <div className="ml-auto">
          <ExportButtons onExcel={handleExcel} onPdfPreview={handlePDFPreview} onPrint={handlePrint} />
        </div>
      </div>

      <ReportTable
        headers={['Acct No', 'Clinic', 'Cloud Start', 'Cloud End', 'Days', 'Backup', 'Ext HDD', 'Contact', 'Tel', 'Company', 'M1G/Dealer', 'State', '']}
        rowKeys={rows.map(r => r.id)}
        rowColours={rows.map(r => rowColourClass(r._days))}
        onRowClick={onClinicClick ? (i) => onClinicClick(rows[i].clinic_code) : undefined}
        rows={rows.map(r => [
          <span key="c" className="font-mono text-text-tertiary">{r.clinic_code}</span>,
          r.clinic_name,
          safeDate(r.cloud_start),
          safeDate(r.cloud_end),
          <span key="d" className="tabular-nums font-semibold">{r._days === null ? '—' : r._days}</span>,
          <span key="b" className={r.has_backup ? 'text-emerald-400' : 'text-text-muted'}>{r.has_backup ? 'Yes' : 'No'}</span>,
          <span key="h" className={r.has_ext_hdd ? 'text-emerald-400' : 'text-text-muted'}>{r.has_ext_hdd ? 'Yes' : 'No'}</span>,
          <span key="ct" className="text-[12px]">{r.registered_contact || '—'}</span>,
          <span key="tl" className="font-mono text-[12px] text-text-tertiary">{r.clinic_phone || r.contact_tel || '—'}</span>,
          <span key="co" className="text-[12px] text-text-tertiary truncate block max-w-[180px]" title={r.company_name || ''}>{r.company_name || '—'}</span>,
          <span key="dl" className="text-[11px] text-text-muted">{r.m1g_dealer_case || '—'}</span>,
          r.state || '—',
          <RowActions key="a" phone={r.clinic_phone || r.contact_tel} wa={r.clinic_phone || r.contact_tel} />,
        ])}
        emptyMessage="No clinics match your filters"
      />
    </div>
  )
}

// ─ E-Invoice Report ─────────────────────────────────────────────

type EinvStatus = 'live' | 'pending' | 'exempt'
type EinvBucket = 'all' | EinvStatus | { kind: 'state'; state: string }

function classifyEinv(c: Clinic): EinvStatus {
  if (c.has_e_invoice) return 'live'
  if (c.einv_no_reason && c.einv_no_reason.trim()) return 'exempt'
  return 'pending'
}

function EInvoiceReport({ clinics, generatedBy, onClinicClick, onCountChange, openPreview }: {
  clinics: Clinic[]
  generatedBy: string
  onClinicClick?: (code: string) => void
  onCountChange: (n: number) => void
  openPreview: (data: PrintData) => void
}) {
  const { toast } = useToast()
  const [bucket, setBucket] = useState<EinvBucket>('all')
  const [sstFilter, setSstFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [reasonFilter, setReasonFilter] = useState<string>('all')
  const [reasonSearch, setReasonSearch] = useState('')

  const classified = useMemo(() => clinics.map(c => ({ ...c, _status: classifyEinv(c) })), [clinics])

  const stats = useMemo(() => {
    let live = 0, pending = 0, exempt = 0
    const stateCount: Record<string, number> = {}
    for (const c of classified) {
      if (c._status === 'live') live++
      else if (c._status === 'exempt') exempt++
      else pending++
      const st = c.state || 'Unknown'
      stateCount[st] = (stateCount[st] || 0) + 1
    }
    const topStates = Object.entries(stateCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
    return { live, pending, exempt, total: classified.length, topStates }
  }, [classified])

  // Distinct reasons for the dropdown (MEDEXCRM's tracking status equivalent)
  const reasonOptions = useMemo(() => {
    const s = new Set<string>()
    for (const c of clinics) {
      if (c.einv_no_reason && c.einv_no_reason.trim()) s.add(c.einv_no_reason.trim())
    }
    return Array.from(s).sort()
  }, [clinics])

  const rows = useMemo(() => {
    let r = classified
    // Bucket from card selection
    if (typeof bucket === 'object' && bucket.kind === 'state') {
      r = r.filter(c => (c.state || 'Unknown') === bucket.state)
    } else if (bucket === 'live') r = r.filter(c => c._status === 'live')
    else if (bucket === 'pending') r = r.filter(c => c._status === 'pending')
    else if (bucket === 'exempt') r = r.filter(c => c._status === 'exempt')

    if (sstFilter !== 'all') r = r.filter(c => sstFilter === 'yes' ? c.has_sst : !c.has_sst)
    if (reasonFilter !== 'all') r = r.filter(c => c.einv_no_reason === reasonFilter)
    if (reasonSearch.trim()) {
      const q = reasonSearch.trim().toLowerCase()
      r = r.filter(c => (c.einv_no_reason || '').toLowerCase().includes(q))
    }
    return [...r].sort((a, b) => a.clinic_code.localeCompare(b.clinic_code))
  }, [classified, bucket, sstFilter, reasonFilter, reasonSearch])

  useEffect(() => { onCountChange(rows.length) }, [rows.length, onCountChange])

  const isBucketStateActive = (state: string) => typeof bucket === 'object' && bucket.kind === 'state' && bucket.state === state

  const statusLabel = (s: EinvStatus) => s === 'live' ? 'Live' : s === 'exempt' ? 'Exempt' : 'Pending'
  const statusTone = (s: EinvStatus) => s === 'live' ? 'text-emerald-400' : s === 'exempt' ? 'text-amber-400' : 'text-red-400'

  const bucketLabel = typeof bucket === 'object'
    ? `State = ${bucket.state}`
    : bucket === 'all' ? 'all'
    : bucket
  const filterSummary = `bucket=${bucketLabel}, sst=${sstFilter}, reason=${reasonFilter}${reasonSearch.trim() ? `, reason~="${reasonSearch.trim()}"` : ''}`

  const excelHeaders = ['Acct No', 'Clinic Name', 'Status', 'SST', 'Reason', 'Product', 'Contact Name', 'Contact Tel', 'Email', 'Company Name', 'State']
  const buildExcelRow = (r: (Clinic & { _status: EinvStatus })) => [
    r.clinic_code, r.clinic_name, statusLabel(r._status), r.has_sst ? 'Yes' : 'No',
    r.einv_no_reason || '', r.product || '',
    r.registered_contact || '', r.clinic_phone || r.contact_tel || '',
    r.email_main || '', r.company_name || '', r.state || '',
  ]

  const statsForExport = [
    { label: 'Total', value: stats.total },
    { label: 'Live', value: stats.live, tone: 'green' },
    { label: 'Pending', value: stats.pending, tone: 'red' },
    { label: 'Exempt', value: stats.exempt, tone: 'amber' },
  ]

  const pdfHeaders = ['Acct No', 'Clinic', 'Status', 'SST', 'Reason', 'Contact', 'Tel', 'Email', 'Company', 'State']
  const buildPdfRow = (r: (Clinic & { _status: EinvStatus })) => [
    r.clinic_code, r.clinic_name, statusLabel(r._status),
    r.has_sst ? 'Yes' : 'No', r.einv_no_reason || '—',
    r.registered_contact || '—', r.clinic_phone || r.contact_tel || '—',
    r.email_main || '—', r.company_name || '—', r.state || '—',
  ]

  const handleExcel = async () => {
    await exportExcelWithMeta({
      filename: 'einvoice-report',
      title: 'Medex — E-Invoice Report',
      filterSummary, generatedBy,
      headers: excelHeaders,
      rows: rows.map(buildExcelRow),
    })
    toast('Excel exported', 'success')
  }
  const handlePDFPreview = () => {
    openPreview({
      title: 'Medex — E-Invoice Report',
      subtitle: 'LHDN e-invoice adoption status',
      filterSummary, generatedBy,
      pdfFilename: 'einvoice-report',
      stats: statsForExport,
      headers: pdfHeaders,
      rows: rows.map(buildPdfRow),
    })
  }
  const handlePrint = () => {
    printReportNewWindow({
      title: 'Medex — E-Invoice Report',
      subtitle: 'LHDN e-invoice adoption status',
      filterSummary, generatedBy,
      stats: statsForExport,
      headers: pdfHeaders,
      rows: rows.map(buildPdfRow),
    })
  }

  return (
    <div>
      {/* Summary cards: Total / Live / Pending + top-3 states */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
        <StatCard label="Total E-Invoice" value={stats.total} />
        <StatCard label="Live" value={stats.live} tone="green"
          active={bucket === 'live'}
          onClick={() => setBucket(bucket === 'live' ? 'all' : 'live')} />
        <StatCard label="Pending" value={stats.pending} tone="red"
          active={bucket === 'pending'}
          onClick={() => setBucket(bucket === 'pending' ? 'all' : 'pending')} />
        <StatCard label="Exempt" value={stats.exempt} tone="amber"
          active={bucket === 'exempt'}
          onClick={() => setBucket(bucket === 'exempt' ? 'all' : 'exempt')} />
        {stats.topStates.map(([state, count]) => (
          <StatCard
            key={state}
            label={state}
            value={count}
            tone="purple"
            active={isBucketStateActive(state)}
            onClick={() => setBucket(isBucketStateActive(state) ? 'all' : { kind: 'state', state })}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[12px] text-text-tertiary">SST:</span>
        {(['all', 'yes', 'no'] as const).map(v => (
          <button
            key={v}
            onClick={() => setSstFilter(v)}
            className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
              sstFilter === v ? 'bg-accent/15 border-accent/40 text-accent' : 'bg-surface border-border text-text-secondary hover:border-accent/30'
            }`}
          >
            {v === 'all' ? 'All' : v === 'yes' ? 'Has SST' : 'No SST'}
          </button>
        ))}

        <div className="w-px h-5 bg-border mx-1" />

        <SearchableSelect
          label="Tracking status"
          value={reasonFilter}
          options={reasonOptions}
          onChange={setReasonFilter}
        />

        <input
          value={reasonSearch}
          onChange={e => setReasonSearch(e.target.value)}
          placeholder="Search reason text…"
          className="px-2 py-1 text-[12px] bg-surface border border-border rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent w-48"
        />

        <div className="ml-auto">
          <ExportButtons onExcel={handleExcel} onPdfPreview={handlePDFPreview} onPrint={handlePrint} />
        </div>
      </div>

      <ReportTable
        headers={['Acct No', 'Clinic', 'Status', 'SST', 'Reason', 'Contact', 'Tel', 'Email', 'Company', 'State', '']}
        rowKeys={rows.map(r => r.id)}
        onRowClick={onClinicClick ? (i) => onClinicClick(rows[i].clinic_code) : undefined}
        rows={rows.map(r => [
          <span key="c" className="font-mono text-text-tertiary">{r.clinic_code}</span>,
          r.clinic_name,
          <span key="s" className={`text-[11px] font-medium ${statusTone(r._status)}`}>{statusLabel(r._status)}</span>,
          <span key="t" className={r.has_sst ? 'text-emerald-400' : 'text-text-muted'}>{r.has_sst ? 'Yes' : 'No'}</span>,
          <span key="rs" className="text-text-tertiary text-[12px] truncate block max-w-[220px]" title={r.einv_no_reason || ''}>{r.einv_no_reason || '—'}</span>,
          <span key="ct" className="text-[12px]">{r.registered_contact || '—'}</span>,
          <span key="tl" className="font-mono text-[12px] text-text-tertiary">{r.clinic_phone || r.contact_tel || '—'}</span>,
          <span key="em" className="text-[12px] text-text-tertiary truncate block max-w-[180px]" title={r.email_main || ''}>{r.email_main || '—'}</span>,
          <span key="co" className="text-[12px] text-text-tertiary truncate block max-w-[160px]" title={r.company_name || ''}>{r.company_name || '—'}</span>,
          r.state || '—',
          <RowActions key="a" phone={r.clinic_phone || r.contact_tel} wa={r.clinic_phone || r.contact_tel} />,
        ])}
        emptyMessage="No clinics match your filters"
      />
    </div>
  )
}

// ─ Main Component ───────────────────────────────────────────────

export default function ReportsView({ onClinicClick }: { onClinicClick?: (code: string) => void } = {}) {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // URL-synced sub-tab: ?tab=maintenance|cloud|einvoice
  const urlTab = searchParams.get('tab')
  const activeTab: ReportTab =
    urlTab === 'cloud' || urlTab === 'einvoice' || urlTab === 'maintenance' ? urlTab : 'maintenance'
  const setActiveTab = useCallback((tab: ReportTab) => {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'maintenance') params.delete('tab')
    else params.set('tab', tab)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, router, pathname])

  const [clinics, setClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [generatedBy, setGeneratedBy] = useState<string>('Unknown')

  const [common, setCommon] = useState<CommonFilters>(EMPTY_COMMON)

  const [counts, setCounts] = useState<Record<ReportTab, number>>({ maintenance: 0, cloud: 0, einvoice: 0 })
  const setCountFor = useCallback((tab: ReportTab) => (n: number) => {
    setCounts(prev => prev[tab] === n ? prev : { ...prev, [tab]: n })
  }, [])

  const [preview, setPreview] = useState<PrintData | null>(null)

  useEffect(() => {
    const load = async () => {
      // WHY — performance: Reports only reads ~25 fields out of the ~100-column
      // Clinic row, so narrow the select() to avoid shipping unused JSONB blobs,
      // license fields, remote-access creds, etc. Payload typically drops >70%.
      // Also: fetch pages in parallel once we know the count — Supabase caps each
      // request at 1000 rows, so for ~3,900 clinics we'd otherwise do 4 serial
      // round-trips. Parallelising collapses that into effectively one.
      const COLUMNS = [
        'id', 'clinic_code', 'clinic_name',
        'state', 'city',
        'product', 'product_type',
        'account_manager', 'clinic_group', 'm1g_dealer_case',
        'registered_contact', 'clinic_phone', 'contact_tel',
        'company_name', 'email_main',
        'mtn_start', 'mtn_expiry',
        'renewal_status', 'status_renewal',
        'cloud_start', 'cloud_end',
        'has_backup', 'has_ext_hdd', 'has_e_invoice', 'has_sst',
        'einv_no_reason',
      ].join(',')
      const PAGE_SIZE = 1000

      // Kick off the profile lookup + the first clinic page + a HEAD count in parallel.
      const [{ data: { session } }, countRes, firstPage] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from('clinics').select('id', { count: 'exact', head: true }),
        supabase.from('clinics').select(COLUMNS).order('clinic_name').range(0, PAGE_SIZE - 1),
      ])

      if (session?.user) {
        // Fire and forget — doesn't block the table from rendering.
        supabase
          .from('profiles')
          .select('display_name')
          .eq('id', session.user.id)
          .single()
          .then((res: { data: { display_name: string } | null }) => {
            if (res.data?.display_name) setGeneratedBy(res.data.display_name)
          })
      }

      const total = countRes.count ?? 0
      const firstRows = (firstPage.data || []) as unknown as Clinic[]

      if (total <= PAGE_SIZE) {
        setClinics(firstRows)
        setLoading(false)
        return
      }

      // Fetch remaining pages in parallel.
      const pageCount = Math.ceil(total / PAGE_SIZE)
      const pagePromises = []
      for (let i = 1; i < pageCount; i++) {
        const from = i * PAGE_SIZE
        const to = from + PAGE_SIZE - 1
        pagePromises.push(
          supabase.from('clinics').select(COLUMNS).order('clinic_name').range(from, to)
        )
      }
      const remaining = await Promise.all(pagePromises)
      const rest = remaining.flatMap(r => (r.data || []) as unknown as Clinic[])
      setClinics([...firstRows, ...rest])
      setLoading(false)
    }
    load()
  }, [supabase])

  const options = useMemo(() => {
    const state = new Set<string>()
    const productType = new Set<string>()
    const accountManager = new Set<string>()
    const clinicGroup = new Set<string>()
    const dealer = new Set<string>()
    for (const c of clinics) {
      if (c.state) state.add(c.state)
      if (c.product_type) productType.add(c.product_type)
      if (c.account_manager) accountManager.add(c.account_manager)
      if (c.clinic_group) clinicGroup.add(c.clinic_group)
      if (c.m1g_dealer_case) dealer.add(c.m1g_dealer_case)
    }
    return {
      state: Array.from(state).sort(),
      productType: Array.from(productType).sort(),
      accountManager: Array.from(accountManager).sort(),
      clinicGroup: Array.from(clinicGroup).sort(),
      dealer: Array.from(dealer).sort(),
    }
  }, [clinics])

  const filtered = useMemo(() => applyCommonFilters(clinics, common), [clinics, common])
  const commonSummary = useMemo(() => summaryText(common), [common])

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
      <ReportToolbar
        filters={common}
        options={options}
        onChange={patch => setCommon(prev => ({ ...prev, ...patch }))}
        onReset={() => setCommon(EMPTY_COMMON)}
      />

      <div className="flex items-center gap-1 mb-4 border-b border-border flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              activeTab === t.id
                ? 'text-text-primary border-accent'
                : 'text-text-tertiary border-transparent hover:text-text-secondary'
            }`}
          >
            {t.label}
            <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded ${
              activeTab === t.id ? 'bg-accent/15 text-accent' : 'bg-surface-inset text-text-muted'
            }`}>
              {counts[t.id]}
            </span>
          </button>
        ))}
        <span className="ml-auto pb-2 text-[11px] text-text-muted">
          Scope: {filtered.length.toLocaleString()} of {clinics.length.toLocaleString()} clinics · {commonSummary}
        </span>
      </div>

      {activeTab === 'maintenance' && (
        <MaintenanceReport
          clinics={filtered}
          generatedBy={generatedBy}
          onClinicClick={onClinicClick}
          onCountChange={setCountFor('maintenance')}
          openPreview={setPreview}
        />
      )}
      {activeTab === 'cloud' && (
        <CloudBackupReport
          clinics={filtered}
          generatedBy={generatedBy}
          onClinicClick={onClinicClick}
          onCountChange={setCountFor('cloud')}
          openPreview={setPreview}
        />
      )}
      {activeTab === 'einvoice' && (
        <EInvoiceReport
          clinics={filtered}
          generatedBy={generatedBy}
          onClinicClick={onClinicClick}
          onCountChange={setCountFor('einvoice')}
          openPreview={setPreview}
        />
      )}

      <PrintPreviewModal data={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
