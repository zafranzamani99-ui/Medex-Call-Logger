'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Clinic } from '@/lib/types'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { ModalDialog } from '@/components/Modal'
import {
  HorizontalDndProvider,
  SortableHeader,
  PlainResizeProvider,
  PlainResizeHandle,
  PlainResizeIndicator,
  measureAutoFitWidth,
  arrayMove,
} from '@/components/table/spreadsheet-kit'

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

type ReportTab = 'subscriptions' | 'maintenance' | 'cloud' | 'einvoice'
const TABS: Array<{ id: ReportTab; label: string; hint: string }> = [
  { id: 'subscriptions', label: 'Subscriptions', hint: 'Product-combo overview — who has what, any combination filter' },
  { id: 'maintenance',   label: 'MTN Renewal',   hint: 'CMS maintenance expiry queue — who to chase this week' },
  { id: 'cloud',         label: 'Cloud Renewal', hint: 'Cloud backup expiry queue — same workflow as MTN but for cloud' },
  { id: 'einvoice',      label: 'E-Invoice',     hint: 'E-Invoice adoption funnel — PO → Signed → Paid → Live' },
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
  // Malaysian format — DD/MM/YYYY
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
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
  <div class="footer">Medex Call Logger — ${safeDate(new Date().toISOString())}</div>
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
              Medex Call Logger — {safeDate(new Date().toISOString())}
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
  tone?: 'default' | 'green' | 'amber' | 'red' | 'indigo' | 'purple' | 'blue' | 'gray'
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
    blue: 'text-sky-400',
    gray: 'text-zinc-400',
  }[tone]
  const toneBorder = active ? {
    default: 'border-text-primary/40',
    green: 'border-emerald-400/50',
    amber: 'border-amber-400/50',
    red: 'border-red-400/50',
    indigo: 'border-indigo-400/50',
    purple: 'border-purple-400/50',
    blue: 'border-sky-400/50',
    gray: 'border-zinc-400/50',
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

  const visible = filtered

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

const REPORT_PAGE_SIZE = 20
const REPORT_DEFAULT_COL_WIDTH = 140
const REPORT_STORAGE_PREFIX = 'report-table'

function loadReportPref<T>(storageKey: string, suffix: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(`${REPORT_STORAGE_PREFIX}:${storageKey}:${suffix}`)
    return raw ? JSON.parse(raw) as T : fallback
  } catch { return fallback }
}
function saveReportPref(storageKey: string, suffix: string, value: unknown) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(`${REPORT_STORAGE_PREFIX}:${storageKey}:${suffix}`, JSON.stringify(value)) } catch { /* noop */ }
}

// Excel-style per-column filter: click icon in header → searchable checkbox list
// of distinct values for that column. Multi-select + sticky per storageKey.
function HeaderFilter({ headerText, values, selected, onChange, totalRows }: {
  headerText: string
  values: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  totalRows: number
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const displayed = search.trim()
    ? values.filter(v => v.toLowerCase().includes(search.toLowerCase()))
    : values

  const toggleValue = (v: string) => {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v); else next.add(v)
    onChange(next)
  }

  const activeCount = selected.size
  const hasFilter = activeCount > 0

  return (
    <span ref={ref} className="relative inline-block align-middle" onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); setSearch('') }}
        onMouseDown={(e) => e.stopPropagation()}
        className={`ml-1 inline-flex items-center justify-center size-5 rounded border text-[10px] transition cursor-pointer ${
          hasFilter
            ? 'bg-accent/20 border-accent/50 text-accent'
            : 'border-border text-text-muted hover:bg-surface hover:text-text-primary'
        }`}
        title={hasFilter ? `${activeCount} selected — click to edit` : `Filter ${headerText}`}
      >
        {hasFilter ? <span className="font-semibold leading-none">{activeCount}</span> : (
          <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 12h12m-8 8h4" />
          </svg>
        )}
      </button>
      {open && (
        <div
          className="absolute z-50 top-full mt-1 left-0 bg-surface border border-border rounded-lg shadow-theme-lg w-[260px] max-h-[340px] flex flex-col"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-2 pt-2 pb-1 flex-shrink-0 border-b border-border">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${values.length} values...`}
              className="w-full px-2 py-1.5 bg-surface-inset border border-border rounded text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setSearch('') } }}
            />
            <div className="flex items-center gap-2 mt-1.5 text-[11px]">
              <button type="button" onClick={() => onChange(new Set(displayed))} className="text-accent hover:underline">
                Select {search ? 'matches' : 'all'}
              </button>
              <span className="text-text-muted">·</span>
              <button type="button" onClick={() => onChange(new Set())} className="text-accent hover:underline">Clear</button>
              <span className="ml-auto text-text-muted tabular-nums">{activeCount}/{values.length} · {totalRows} rows</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {displayed.length === 0 && (
              <p className="px-3 py-2 text-[12px] text-text-muted">No matches</p>
            )}
            {displayed.map(v => (
              <button
                key={v || '__blank__'}
                type="button"
                onClick={() => toggleValue(v)}
                className="w-full flex items-center gap-2 px-3 py-1 text-[13px] text-text-secondary hover:bg-surface-raised transition-colors text-left"
              >
                <span className={`size-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                  selected.has(v) ? 'bg-accent border-accent' : 'border-border'
                }`}>
                  {selected.has(v) && (
                    <svg className="size-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="truncate text-left">{v || <span className="text-text-muted italic">(blank)</span>}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  )
}

function ReportTable({ headers, rows, rowKeys, rowColours, onRowClick, emptyMessage = 'No records', storageKey, rawValues }: {
  headers: string[]
  rows: React.ReactNode[][]
  rowKeys?: string[]
  rowColours?: string[] // bg-red-500/10 etc — matches MEDEXCRM row-expiry/expired coloring
  onRowClick?: (index: number) => void
  emptyMessage?: string
  storageKey: string // unique per sub-report — persists column widths + order
  rawValues?: string[][] // parallel to rows — used by double-click auto-fit (canvas measureText)
}) {
  // Stable column IDs for dnd-kit + width-map keys. `${storageKey}:${index}`
  // so different reports don't share state.
  const columnIds = useMemo(
    () => headers.map((_, i) => `${storageKey}:${i}`),
    [headers, storageKey]
  )

  const [widths, setWidths] = useState<Record<string, number>>(() =>
    loadReportPref<Record<string, number>>(storageKey, 'widths', {})
  )
  const [order, setOrder] = useState<string[]>(() => {
    const saved = loadReportPref<string[]>(storageKey, 'order', [])
    return saved.length === headers.length ? saved : columnIds
  })

  // If the caller changes the headers length, reset order to defaults.
  useEffect(() => {
    if (order.length !== columnIds.length || !order.every(id => columnIds.includes(id))) {
      setOrder(columnIds)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnIds.join('|')])

  useEffect(() => { saveReportPref(storageKey, 'widths', widths) }, [widths, storageKey])
  useEffect(() => { saveReportPref(storageKey, 'order', order) }, [order, storageKey])

  // Per-column filter state. Key = original column index (stringified),
  // value = array of allowed raw values. Persisted per storageKey so filters
  // survive tab switches. Empty object = no filters active.
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>(() =>
    loadReportPref<Record<string, string[]>>(storageKey, 'colFilters', {})
  )
  useEffect(() => { saveReportPref(storageKey, 'colFilters', columnFilters) }, [columnFilters, storageKey])

  // Distinct non-blank values per column (from rawValues). Sorted alphabetically.
  const distinctValues = useMemo(() => {
    const m: Record<number, string[]> = {}
    if (!rawValues || rawValues.length === 0) return m
    for (let c = 0; c < headers.length; c++) {
      const s = new Set<string>()
      for (const row of rawValues) {
        const v = String(row[c] ?? '').trim()
        if (v) s.add(v)
      }
      m[c] = Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    }
    return m
  }, [rawValues, headers.length])

  // Row indices that pass ALL active column filters. null = no filter active → show all.
  const filteredRowIndices = useMemo(() => {
    const activeKeys = Object.keys(columnFilters).filter(k => (columnFilters[k] || []).length > 0)
    if (!rawValues || activeKeys.length === 0) return null
    const filters = activeKeys.map(k => ({ idx: Number(k), allowed: new Set(columnFilters[k]) }))
    const out: number[] = []
    for (let i = 0; i < rawValues.length; i++) {
      const row = rawValues[i]
      let ok = true
      for (const f of filters) {
        const v = String(row[f.idx] ?? '').trim()
        if (!f.allowed.has(v)) { ok = false; break }
      }
      if (ok) out.push(i)
    }
    return out
  }, [rawValues, columnFilters])

  const setFilterFor = useCallback((colIdx: number, next: Set<string>) => {
    setColumnFilters(prev => {
      const key = String(colIdx)
      const arr = Array.from(next)
      if (arr.length === 0) {
        if (!(key in prev)) return prev
        const copy = { ...prev }; delete copy[key]; return copy
      }
      return { ...prev, [key]: arr }
    })
  }, [])

  const clearAllFilters = useCallback(() => setColumnFilters({}), [])
  const activeFilterCount = Object.values(columnFilters).filter(v => v && v.length > 0).length

  const getWidth = useCallback((id: string) => widths[id] ?? REPORT_DEFAULT_COL_WIDTH, [widths])
  const setWidth = useCallback((id: string, w: number) => {
    setWidths(prev => ({ ...prev, [id]: w }))
  }, [])

  const handleReorder = useCallback((fromId: string, toId: string) => {
    setOrder(prev => {
      const from = prev.indexOf(fromId)
      const to = prev.indexOf(toId)
      if (from < 0 || to < 0) return prev
      return arrayMove(prev, from, to)
    })
  }, [])

  // Auto-fit a column to content using canvas measureText (double-click edge).
  const autoFit = useCallback((id: string) => {
    const origIdx = columnIds.indexOf(id)
    if (origIdx < 0) return
    const values: string[] = []
    if (rawValues) {
      for (const row of rawValues) values.push(row[origIdx] || '')
    }
    const width = measureAutoFitWidth(values, {
      headerText: headers[origIdx],
      minWidth: 80,
      maxWidth: 500,
    })
    setWidth(id, width)
  }, [columnIds, headers, rawValues, setWidth])

  // Apply per-column filters BEFORE pagination so page 1 = page 1 of filtered set.
  const workingRows = useMemo(() => filteredRowIndices ? filteredRowIndices.map(i => rows[i]) : rows, [rows, filteredRowIndices])
  const workingKeys = useMemo(() => rowKeys && filteredRowIndices ? filteredRowIndices.map(i => rowKeys[i]) : rowKeys, [rowKeys, filteredRowIndices])
  const workingColours = useMemo(() => rowColours && filteredRowIndices ? filteredRowIndices.map(i => rowColours[i]) : rowColours, [rowColours, filteredRowIndices])

  // Pagination
  const [page, setPage] = useState(0)
  const total = workingRows.length
  const pageCount = Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE))
  useEffect(() => { if (page > pageCount - 1) setPage(0) }, [pageCount, page])
  // Reset to first page when filters change so user doesn't stare at an empty page 4.
  useEffect(() => { setPage(0) }, [columnFilters])

  const startIdx = page * REPORT_PAGE_SIZE
  const endIdx = Math.min(startIdx + REPORT_PAGE_SIZE, total)
  const visibleRows = workingRows.slice(startIdx, endIdx)
  const visibleColours = workingColours?.slice(startIdx, endIdx)
  const visibleKeys = workingKeys?.slice(startIdx, endIdx)

  // Map order → original index (reordering just permutes original indices).
  const orderedIndices = useMemo(
    () => order.map(id => columnIds.indexOf(id)).filter(i => i >= 0),
    [order, columnIds]
  )

  // Total computed table width (header widths summed)
  const tableWidth = orderedIndices.reduce((sum, i) => sum + getWidth(columnIds[i]), 0)

  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface-raised/30 text-[12px]">
          <svg className="size-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 12h12m-8 8h4" />
          </svg>
          <span className="text-text-secondary">
            {activeFilterCount} column{activeFilterCount > 1 ? 's' : ''} filtered · showing <span className="font-semibold tabular-nums">{total.toLocaleString()}</span> of <span className="tabular-nums">{rows.length.toLocaleString()}</span>
          </span>
          <button onClick={clearAllFilters} className="ml-auto text-accent hover:underline">Clear all filters</button>
        </div>
      )}
      <PlainResizeProvider widths={widths} onChangeWidth={setWidth}>
        <div ref={scrollRef} className="overflow-x-auto relative report-overflow">
          <HorizontalDndProvider columnIds={order} onReorder={handleReorder}>
            <table className="text-left text-[13px]" style={{ width: tableWidth, minWidth: '100%', tableLayout: 'fixed' }}>
              <thead>
                <tr className="bg-surface-raised">
                  {orderedIndices.map(origIdx => {
                    const id = columnIds[origIdx]
                    const width = getWidth(id)
                    const columnValues = distinctValues[origIdx] || []
                    const hasValues = columnValues.length > 0
                    const selected = new Set(columnFilters[String(origIdx)] || [])
                    return (
                      <SortableHeader
                        key={id}
                        id={id}
                        data-col-id={id}
                        className="relative bg-surface-raised px-3 py-2 text-[11px] font-semibold text-text-muted uppercase tracking-wider border-b border-border whitespace-nowrap cursor-grab active:cursor-grabbing select-none"
                        style={{ width, minWidth: width, maxWidth: width }}
                      >
                        <span className="inline-flex items-center gap-1 pr-2 max-w-full">
                          <span className="inline-block truncate" style={{ maxWidth: width - 40 }}>
                            {headers[origIdx]}
                          </span>
                          {hasValues && (
                            <HeaderFilter
                              headerText={headers[origIdx]}
                              values={columnValues}
                              selected={selected}
                              onChange={(next) => setFilterFor(origIdx, next)}
                              totalRows={rawValues?.length ?? 0}
                            />
                          )}
                        </span>
                        <PlainResizeHandle columnId={id} currentWidth={width} onAutoFit={rawValues ? () => autoFit(id) : undefined} />
                      </SortableHeader>
                    )
                  })}
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
                      {orderedIndices.map(origIdx => {
                        const id = columnIds[origIdx]
                        const width = getWidth(id)
                        return (
                          <td
                            key={origIdx}
                            className="px-3 py-2 overflow-hidden"
                            style={{ width, minWidth: width, maxWidth: width }}
                          >
                            <div className="truncate">{row[origIdx]}</div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </HorizontalDndProvider>
          <PlainResizeIndicator containerRef={scrollRef} />
        </div>
      </PlainResizeProvider>

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

// ─ Today's Action Queue ────────────────────────────────────────
// Urgent counts aggregated across every pipeline so the agent can triage
// at a glance. Each card jumps to the relevant sub-tab when clicked.

function ActionQueueStrip({ clinics, setActiveTab, visible }: {
  clinics: Clinic[]
  setActiveTab: (tab: ReportTab) => void
  visible: boolean
}) {
  const counts = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    let mtnExpired = 0
    let mtnExpiring7 = 0
    let einvInstallPending = 0
    let einvPaymentPending = 0
    for (const c of clinics) {
      // MTN buckets
      if (c.mtn_expiry) {
        const d = new Date(c.mtn_expiry); d.setHours(0, 0, 0, 0)
        if (!Number.isNaN(d.getTime())) {
          const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
          if (diff < 0) mtnExpired++
          else if (diff <= 7) mtnExpiring7++
        }
      }
      // E-Invoice funnel stages (mirrors classifyEinv semantics)
      if (!c.has_e_invoice && !(c.einv_no_reason && c.einv_no_reason.trim())) {
        if (c.einv_payment_date) einvInstallPending++
        else if (c.einv_v1_signed || c.einv_v2_signed) einvPaymentPending++
      }
    }
    return { mtnExpired, mtnExpiring7, einvInstallPending, einvPaymentPending }
  }, [clinics])

  const totalAction = counts.mtnExpired + counts.mtnExpiring7 + counts.einvInstallPending + counts.einvPaymentPending

  const cards: Array<{
    label: string
    value: number
    tone: 'red' | 'amber' | 'sky' | 'violet'
    onClick: () => void
    sub: string
  }> = [
    { label: 'MTN Expired',       value: counts.mtnExpired,        tone: 'red',    sub: 'Chase or remove',   onClick: () => setActiveTab('maintenance') },
    { label: 'MTN Expiring ≤7d',  value: counts.mtnExpiring7,      tone: 'amber',  sub: 'Call renewal now',  onClick: () => setActiveTab('maintenance') },
    { label: 'E-Inv Install Pending', value: counts.einvInstallPending, tone: 'sky', sub: 'Paid, schedule install', onClick: () => setActiveTab('einvoice') },
    { label: 'E-Inv Payment Pending', value: counts.einvPaymentPending, tone: 'violet', sub: 'Signed, collect payment', onClick: () => setActiveTab('einvoice') },
  ]

  const toneMap = {
    red:    'border-red-500/40 hover:border-red-500/70 hover:bg-red-500/10',
    amber:  'border-amber-500/40 hover:border-amber-500/70 hover:bg-amber-500/10',
    sky:    'border-sky-500/40 hover:border-sky-500/70 hover:bg-sky-500/10',
    violet: 'border-violet-500/40 hover:border-violet-500/70 hover:bg-violet-500/10',
  }
  const valueToneMap = {
    red:    'text-red-400',
    amber:  'text-amber-400',
    sky:    'text-sky-400',
    violet: 'text-violet-400',
  }

  if (!visible) return null

  return (
    <div className="mb-4 border border-border rounded-xl bg-gradient-to-br from-surface-raised/20 to-transparent p-3">
      <div className="flex items-center gap-2 mb-2 px-1">
        <svg className="size-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        <span className="text-[11px] uppercase tracking-wider text-text-muted font-semibold">Today&apos;s Action Queue</span>
        <span className="text-[11px] text-text-tertiary">· {totalAction.toLocaleString()} item{totalAction === 1 ? '' : 's'} need attention · click any card to jump to that tab</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {cards.map(card => (
          <button
            key={card.label}
            type="button"
            onClick={card.onClick}
            className={`text-left p-3 rounded-lg border bg-surface transition-colors cursor-pointer ${toneMap[card.tone]}`}
          >
            <p className="text-[10px] uppercase tracking-wider text-text-muted">{card.label}</p>
            <p className={`text-2xl font-bold tabular-nums mt-0.5 ${valueToneMap[card.tone]}`}>
              {card.value.toLocaleString()}
            </p>
            <p className="text-[10px] text-text-tertiary mt-0.5">{card.sub}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─ Monthly Snapshot — end-of-month activity report ──────────────
// Counts transitions that happened within the picked month and exports a
// single Excel with totals + per-section detail rows.

function MonthlySnapshotModal({ open, onClose, clinics }: {
  open: boolean
  onClose: () => void
  clinics: Clinic[]
}) {
  const { toast } = useToast()
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [ym, setYm] = useState(defaultMonth)

  const inMonth = (d: string | null): boolean => {
    if (!d) return false
    return d.startsWith(ym)
  }

  const stats = useMemo(() => {
    let mtnRenewed = 0, einvPoRcvd = 0, einvPaid = 0, einvLive = 0
    const lists = {
      mtnRenewed: [] as Clinic[],
      einvPoRcvd: [] as Clinic[],
      einvPaid: [] as Clinic[],
      einvLive: [] as Clinic[],
    }
    for (const c of clinics) {
      if (inMonth(c.mtn_start)) { mtnRenewed++; lists.mtnRenewed.push(c) }
      if (inMonth(c.einv_po_rcvd_date)) { einvPoRcvd++; lists.einvPoRcvd.push(c) }
      if (inMonth(c.einv_payment_date)) { einvPaid++; lists.einvPaid.push(c) }
      if (inMonth(c.einv_live_date)) { einvLive++; lists.einvLive.push(c) }
    }
    return { mtnRenewed, einvPoRcvd, einvPaid, einvLive, lists }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinics, ym])

  const monthLabel = (() => {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(y, (m || 1) - 1, 1)
    return d.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
  })()

  const handleDownload = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    // Summary sheet
    const summary: (string | number)[][] = [
      [`Medex — Monthly Snapshot · ${monthLabel}`],
      [],
      ['Metric', 'Count'],
      ['MTN Renewals (mtn_start this month)', stats.mtnRenewed],
      ['E-Invoice POs Received', stats.einvPoRcvd],
      ['E-Invoice Hosting Paid', stats.einvPaid],
      ['E-Invoice Gone Live', stats.einvLive],
    ]
    const summaryWs = XLSX.utils.aoa_to_sheet(summary)
    summaryWs['!cols'] = [{ wch: 42 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

    const addListSheet = (name: string, dateField: keyof Clinic, list: Clinic[]) => {
      if (list.length === 0) return
      const aoa: (string | number)[][] = [
        ['Acct No', 'Clinic', 'State', 'Product', String(dateField), 'Contact', 'Phone', 'Email'],
        ...list.map(c => [
          c.clinic_code, c.clinic_name || '', c.state || '', c.product || '',
          (c[dateField] as string) || '',
          c.registered_contact || '', c.clinic_phone || '', c.email_main || '',
        ]),
      ]
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = [{ wch: 10 }, { wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 26 }]
      XLSX.utils.book_append_sheet(wb, ws, name)
    }

    addListSheet('MTN Renewals', 'mtn_start', stats.lists.mtnRenewed)
    addListSheet('E-Inv POs', 'einv_po_rcvd_date', stats.lists.einvPoRcvd)
    addListSheet('E-Inv Paid', 'einv_payment_date', stats.lists.einvPaid)
    addListSheet('E-Inv Live', 'einv_live_date', stats.lists.einvLive)

    XLSX.writeFile(wb, `monthly-snapshot-${ym}.xlsx`)
    toast(`Downloaded snapshot for ${monthLabel}`, 'success')
  }

  const total = stats.mtnRenewed + stats.einvPoRcvd + stats.einvPaid + stats.einvLive

  return (
    <ModalDialog open={open} onClose={onClose} title="Monthly Snapshot" size="md">
      <div className="p-4 space-y-4">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-text-muted block mb-1">Month</label>
          <input
            type="month"
            value={ym}
            onChange={e => setYm(e.target.value)}
            className="w-full px-3 py-2 bg-surface-inset border border-border rounded text-[13px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <p className="text-[11px] text-text-tertiary mt-1">Counts any clinic whose relevant date lands in <span className="text-text-secondary font-medium">{monthLabel}</span>.</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'MTN Renewals',     value: stats.mtnRenewed,  tone: 'text-emerald-400' },
            { label: 'E-Inv POs',        value: stats.einvPoRcvd,  tone: 'text-amber-400' },
            { label: 'E-Inv Paid',       value: stats.einvPaid,    tone: 'text-sky-400' },
            { label: 'E-Inv Live',       value: stats.einvLive,    tone: 'text-violet-400' },
          ].map(s => (
            <div key={s.label} className="p-2.5 rounded-lg border border-border bg-surface-inset/30">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">{s.label}</p>
              <p className={`text-xl font-bold tabular-nums mt-0.5 ${s.tone}`}>{s.value.toLocaleString()}</p>
            </div>
          ))}
        </div>

        <p className="text-[12px] text-text-tertiary">
          Download includes one sheet per metric with the full clinic detail — acct no, name, state, product, relevant date, contact, phone, email.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border">
        <span className="text-[12px] text-text-muted">
          {total === 0 ? 'No activity in this month' : `${total.toLocaleString()} total items across all metrics`}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[13px] rounded text-text-secondary hover:text-text-primary hover:bg-surface-inset transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={total === 0}
            className="px-4 py-1.5 text-[13px] font-medium rounded bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Download Excel
          </button>
        </div>
      </div>
    </ModalDialog>
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

// ─ Subscriptions Overview ─────────────────────────────────────
// Single-view combinatorial filter: every clinic × every product/service.
// Answers "who has WhatsApp only?" or "GFLEX + CLAIMEX" or "MHIS without SST" in one click.
//
// Two categories of filters:
//  - SOFTWARE_LIST: substring match on the `product` text field (CMS, GFLEX,
//    MHIS, EM2, CLAIMEX, HARDWARE). A clinic can have bundled products like
//    "CMS+GFLEX" or "MHIS+CLAIMEX" — substring match catches both.
//  - SERVICE_LIST: boolean flags / date checks (MTN active, Cloud active,
//    E-Invoice, WhatsApp, SST).

type SubFilter = 'any' | 'yes' | 'no'
type ProductId = 'mtn' | 'cloud' | 'einvoice' | 'whatsapp' | 'sst'
type SoftwareId = 'cms' | 'gflex' | 'mhis' | 'em2' | 'claimex' | 'hardware'

function isDateActive(d: string | null): boolean {
  if (!d) return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return false
  return dt.getTime() >= today.getTime()
}

function hasProduct(c: Clinic, id: ProductId): boolean {
  switch (id) {
    case 'mtn': return isDateActive(c.mtn_expiry)
    case 'cloud': return isDateActive(c.cloud_end)
    case 'einvoice': return !!c.has_e_invoice
    case 'whatsapp': return !!c.has_whatsapp
    case 'sst': return !!c.has_sst
  }
}

function hasSoftware(c: Clinic, id: SoftwareId): boolean {
  const p = (c.product || '').toUpperCase()
  if (!p) return false
  switch (id) {
    case 'cms': return p.includes('CMS')
    case 'gflex': return p.includes('GFLEX')
    case 'mhis': return p.includes('MHIS')
    case 'em2': return p.includes('EM2')
    case 'claimex': return p.includes('CLAIMEX')
    case 'hardware': return p.includes('HARDWARE')
  }
}

const SERVICE_LIST: Array<{ id: ProductId; label: string; tone: string }> = [
  { id: 'mtn',       label: 'MTN Active', tone: 'emerald' },
  { id: 'cloud',     label: 'Cloud Bkp',  tone: 'indigo'  },
  { id: 'einvoice',  label: 'E-Invoice',  tone: 'blue'    },
  { id: 'whatsapp',  label: 'WhatsApp',   tone: 'green'   },
  { id: 'sst',       label: 'SST',        tone: 'amber'   },
]

const SOFTWARE_LIST: Array<{ id: SoftwareId; label: string; tone: string }> = [
  { id: 'cms',      label: 'CMS',      tone: 'default' },
  { id: 'gflex',    label: 'GFLEX',    tone: 'purple'  },
  { id: 'mhis',     label: 'MHIS',     tone: 'indigo'  },
  { id: 'em2',      label: 'EM2',      tone: 'red'     },
  { id: 'claimex',  label: 'CLAIMEX',  tone: 'amber'   },
  { id: 'hardware', label: 'Hardware', tone: 'gray'    },
]

function SubscriptionsReport({ clinics, generatedBy, onClinicClick, onCountChange, openPreview }: {
  clinics: Clinic[]
  generatedBy: string
  onClinicClick?: (code: string) => void
  onCountChange: (n: number) => void
  openPreview: (data: PrintData) => void
}) {
  const { toast } = useToast()
  const [serviceFilters, setServiceFilters] = useState<Record<ProductId, SubFilter>>({
    mtn: 'any', cloud: 'any', einvoice: 'any', whatsapp: 'any', sst: 'any',
  })
  const [softwareFilters, setSoftwareFilters] = useState<Record<SoftwareId, SubFilter>>({
    cms: 'any', gflex: 'any', mhis: 'any', em2: 'any', claimex: 'any', hardware: 'any',
  })

  // Bulk selection — Set of clinic_codes. Persists across filter changes so user
  // can pile up picks from multiple filter passes, then act on the whole batch.
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())
  const toggleOne = useCallback((code: string) => {
    setSelectedCodes(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code); else next.add(code)
      return next
    })
  }, [])
  const clearSelection = useCallback(() => setSelectedCodes(new Set()), [])

  // Matrix — each clinic annotated with every service + software flag.
  const matrix = useMemo(() => clinics.map(c => ({
    clinic: c,
    mtn: hasProduct(c, 'mtn'),
    cloud: hasProduct(c, 'cloud'),
    einvoice: hasProduct(c, 'einvoice'),
    whatsapp: hasProduct(c, 'whatsapp'),
    sst: hasProduct(c, 'sst'),
    cms: hasSoftware(c, 'cms'),
    gflex: hasSoftware(c, 'gflex'),
    mhis: hasSoftware(c, 'mhis'),
    em2: hasSoftware(c, 'em2'),
    claimex: hasSoftware(c, 'claimex'),
    hardware: hasSoftware(c, 'hardware'),
  })), [clinics])

  // Apply combinatorial filter — AND across every active filter.
  const filtered = useMemo(() => matrix.filter(row => {
    for (const p of SERVICE_LIST) {
      const f = serviceFilters[p.id]
      if (f === 'any') continue
      const has = row[p.id]
      if (f === 'yes' && !has) return false
      if (f === 'no' && has) return false
    }
    for (const s of SOFTWARE_LIST) {
      const f = softwareFilters[s.id]
      if (f === 'any') continue
      const has = row[s.id]
      if (f === 'yes' && !has) return false
      if (f === 'no' && has) return false
    }
    return true
  }), [matrix, serviceFilters, softwareFilters])

  // Sort for the table (clinic_code stable ordering).
  const rowsSorted = useMemo(
    () => [...filtered].sort((a, b) => a.clinic.clinic_code.localeCompare(b.clinic.clinic_code)),
    [filtered]
  )

  useEffect(() => { onCountChange(rowsSorted.length) }, [rowsSorted.length, onCountChange])

  // Per-product totals within the filtered set.
  const totals = useMemo(() => {
    const t: Record<ProductId | SoftwareId, number> = {
      mtn: 0, cloud: 0, einvoice: 0, whatsapp: 0, sst: 0,
      cms: 0, gflex: 0, mhis: 0, em2: 0, claimex: 0, hardware: 0,
    }
    for (const r of rowsSorted) {
      for (const p of SERVICE_LIST) if (r[p.id]) t[p.id]++
      for (const s of SOFTWARE_LIST) if (r[s.id]) t[s.id]++
    }
    return t
  }, [rowsSorted])

  const cycleService = (id: ProductId) => setServiceFilters(prev => ({
    ...prev, [id]: prev[id] === 'any' ? 'yes' : prev[id] === 'yes' ? 'no' : 'any',
  }))
  const cycleSoftware = (id: SoftwareId) => setSoftwareFilters(prev => ({
    ...prev, [id]: prev[id] === 'any' ? 'yes' : prev[id] === 'yes' ? 'no' : 'any',
  }))
  const resetFilters = () => {
    setServiceFilters({ mtn: 'any', cloud: 'any', einvoice: 'any', whatsapp: 'any', sst: 'any' })
    setSoftwareFilters({ cms: 'any', gflex: 'any', mhis: 'any', em2: 'any', claimex: 'any', hardware: 'any' })
  }

  const anyActive =
    SERVICE_LIST.some(p => serviceFilters[p.id] !== 'any') ||
    SOFTWARE_LIST.some(s => softwareFilters[s.id] !== 'any')

  // Build headers + rows. First column is a selection checkbox (persistent
  // across filter changes so agents can pile up picks).
  const headers = [
    '', // selection checkbox — empty header; select-all lives in the toolbar above
    'Acct No', 'Clinic', 'State', 'Product',
    'MTN', 'Cloud', 'E-Inv', 'WhatsApp', 'SST',
    'CMS', 'GFLEX', 'MHIS', 'EM2', 'CLAIMEX',
  ]
  const Chip = ({ on, label }: { on: boolean; label?: string }) => on
    ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">{label ?? '✓'}</span>
    : <span className="text-text-muted">—</span>

  const rawValues = rowsSorted.map(r => [
    '', // selection column has no raw value (not filterable)
    r.clinic.clinic_code, r.clinic.clinic_name || '', r.clinic.state || '', r.clinic.product || '',
    r.mtn ? 'Yes' : 'No', r.cloud ? 'Yes' : 'No', r.einvoice ? 'Yes' : 'No',
    r.whatsapp ? 'Yes' : 'No', r.sst ? 'Yes' : 'No',
    r.cms ? 'Yes' : 'No', r.gflex ? 'Yes' : 'No', r.mhis ? 'Yes' : 'No',
    r.em2 ? 'Yes' : 'No', r.claimex ? 'Yes' : 'No',
  ])
  const rowsRendered: React.ReactNode[][] = rowsSorted.map(r => {
    const code = r.clinic.clinic_code
    const isSelected = selectedCodes.has(code)
    return [
      <button
        key="sel"
        type="button"
        aria-label={isSelected ? `Deselect ${code}` : `Select ${code}`}
        onClick={(e) => { e.stopPropagation(); toggleOne(code) }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`size-4 rounded border flex items-center justify-center transition-colors ${
          isSelected
            ? 'bg-accent border-accent'
            : 'border-border hover:border-accent/60 bg-surface'
        }`}
      >
        {isSelected && (
          <svg className="size-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>,
      <span key="code" className="font-mono text-[12px] text-accent">{code}</span>,
      <span key="name" className="text-text-primary">{r.clinic.clinic_name}</span>,
      r.clinic.state || '—',
      <span key="p" className="text-[11px] text-text-tertiary">{r.clinic.product || '—'}</span>,
      <Chip key="mtn" on={r.mtn} />,
      <Chip key="cloud" on={r.cloud} />,
      <Chip key="einv" on={r.einvoice} />,
      <Chip key="wa" on={r.whatsapp} />,
      <Chip key="sst" on={r.sst} />,
      <Chip key="cms" on={r.cms} />,
      <Chip key="gflex" on={r.gflex} />,
      <Chip key="mhis" on={r.mhis} />,
      <Chip key="em2" on={r.em2} />,
      <Chip key="claimex" on={r.claimex} />,
    ]
  })
  const rowKeys = rowsSorted.map(r => r.clinic.clinic_code)

  // ── Bulk action helpers ──────────────────────────────────────────
  const selectAllVisible = () => {
    setSelectedCodes(prev => {
      const next = new Set(prev)
      for (const r of rowsSorted) next.add(r.clinic.clinic_code)
      return next
    })
  }

  const selectedClinics = useMemo(
    () => clinics.filter(c => selectedCodes.has(c.clinic_code)),
    [clinics, selectedCodes]
  )

  const exportCallList = () => {
    if (selectedClinics.length === 0) return
    const header = ['Acct No', 'Clinic', 'State', 'Product', 'Customer Status', 'Contact', 'Phone', 'Contact Tel', 'Email', 'MTN Expiry', 'Cloud End', 'E-Invoice', 'WhatsApp', 'SST']
    const rows = selectedClinics.map(c => [
      c.clinic_code, c.clinic_name || '', c.state || '', c.product || '', c.customer_status || '',
      c.registered_contact || '', c.clinic_phone || '', c.contact_tel || '', c.email_main || '',
      c.mtn_expiry || '', c.cloud_end || '',
      c.has_e_invoice ? 'Yes' : 'No', c.has_whatsapp ? 'Yes' : 'No', c.has_sst ? 'Yes' : 'No',
    ])
    const csv = [header, ...rows]
      .map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `call-list-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast(`Exported ${selectedClinics.length} clinics`, 'success')
  }

  const copyFieldToClipboard = async (label: string, extract: (c: Clinic) => string) => {
    const values = selectedClinics.map(extract).filter(Boolean)
    if (values.length === 0) { toast(`No ${label} in selection`, 'error'); return }
    await navigator.clipboard.writeText(values.join('\n'))
    toast(`Copied ${values.length} ${label}`, 'success')
  }

  // Export rows (strings only — no React elements).
  const excelHeaders = [
    'Acct No', 'Clinic', 'State', 'Product',
    'MTN Active', 'Cloud Active', 'E-Inv V1', 'E-Inv V2', 'E-Inv Any',
    'WhatsApp', 'SST',
    'CMS', 'GFLEX', 'MHIS', 'EM2', 'CLAIMEX', 'Hardware',
  ]
  const buildExcelRow = (r: typeof rowsSorted[number]) => [
    r.clinic.clinic_code, r.clinic.clinic_name || '', r.clinic.state || '', r.clinic.product || '',
    r.mtn ? 'Yes' : 'No', r.cloud ? 'Yes' : 'No',
    r.clinic.einv_v1_signed ? 'Yes' : 'No', r.clinic.einv_v2_signed ? 'Yes' : 'No',
    r.einvoice ? 'Yes' : 'No',
    r.whatsapp ? 'Yes' : 'No', r.sst ? 'Yes' : 'No',
    r.cms ? 'Yes' : 'No', r.gflex ? 'Yes' : 'No', r.mhis ? 'Yes' : 'No',
    r.em2 ? 'Yes' : 'No', r.claimex ? 'Yes' : 'No', r.hardware ? 'Yes' : 'No',
  ]

  const filterSummary = anyActive
    ? [
        ...SERVICE_LIST.filter(p => serviceFilters[p.id] !== 'any').map(p => `${p.label}=${serviceFilters[p.id]}`),
        ...SOFTWARE_LIST.filter(s => softwareFilters[s.id] !== 'any').map(s => `${s.label}=${softwareFilters[s.id]}`),
      ].join(', ')
    : 'all products'

  const statsForExport = [
    { label: 'Matching', value: rowsSorted.length },
    ...SERVICE_LIST.map(p => ({ label: p.label, value: totals[p.id] })),
    ...SOFTWARE_LIST.map(s => ({ label: s.label, value: totals[s.id] })),
  ]

  const handleExcel = async () => {
    await exportExcelWithMeta({
      filename: 'subscriptions-report',
      title: 'Medex — Clinic Subscriptions',
      filterSummary, generatedBy,
      headers: excelHeaders,
      rows: rowsSorted.map(buildExcelRow),
    })
  }

  const pdfHeaders = excelHeaders
  const handlePdfPreview = () => openPreview({
    title: 'Medex — Clinic Subscriptions',
    subtitle: 'Per-clinic product subscription matrix',
    filterSummary, generatedBy,
    stats: statsForExport,
    headers: pdfHeaders,
    rows: rowsSorted.map(buildExcelRow),
    pdfFilename: 'subscriptions-report',
  })

  const handlePrint = () => {
    printReportNewWindow({
      title: 'Medex — Clinic Subscriptions',
      subtitle: 'Per-clinic product subscription matrix',
      filterSummary, generatedBy,
      stats: statsForExport,
      headers: pdfHeaders,
      rows: rowsSorted.map(buildExcelRow),
    })
  }

  return (
    <div>
      {/* Filter pills — two rows: services (has_* / date-active) + software (product-field keywords) */}
      <div className="mb-3 p-3 bg-surface-raised/40 border border-border rounded-lg space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-text-muted uppercase tracking-wider w-20 flex-shrink-0">Services</span>
          {SERVICE_LIST.map(p => {
            const f = serviceFilters[p.id]
            const stateStyle = f === 'yes'
              ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400'
              : f === 'no'
              ? 'bg-red-500/15 border-red-500/50 text-red-400'
              : 'bg-surface border-border text-text-secondary hover:border-accent/40'
            const symbol = f === 'yes' ? '✓' : f === 'no' ? '✗' : '—'
            return (
              <button key={p.id} onClick={() => cycleService(p.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] border rounded-full transition-colors ${stateStyle}`}
                title={`${p.label}: ${f === 'any' ? 'any (click → Has)' : f === 'yes' ? 'Has (click → No)' : 'No (click → clear)'}`}>
                <span className="font-semibold">{p.label}</span>
                <span className="tabular-nums">{symbol}</span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-text-muted uppercase tracking-wider w-20 flex-shrink-0">Software</span>
          {SOFTWARE_LIST.map(s => {
            const f = softwareFilters[s.id]
            const stateStyle = f === 'yes'
              ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400'
              : f === 'no'
              ? 'bg-red-500/15 border-red-500/50 text-red-400'
              : 'bg-surface border-border text-text-secondary hover:border-accent/40'
            const symbol = f === 'yes' ? '✓' : f === 'no' ? '✗' : '—'
            return (
              <button key={s.id} onClick={() => cycleSoftware(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] border rounded-full transition-colors ${stateStyle}`}
                title={`${s.label}: ${f === 'any' ? 'any (click → Has)' : f === 'yes' ? 'Has (click → No)' : 'No (click → clear)'}`}>
                <span className="font-semibold">{s.label}</span>
                <span className="tabular-nums">{symbol}</span>
              </button>
            )
          })}
          <div className="ml-auto flex items-center gap-3">
            {anyActive && <button onClick={resetFilters} className="text-[11px] text-accent hover:underline">Reset</button>}
            <span className="text-[11px] text-text-muted">
              {rowsSorted.length.toLocaleString()} / {clinics.length.toLocaleString()} match
            </span>
          </div>
        </div>
      </div>

      {/* Totals per product within current filter (services + software) */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
        <StatCard label="Matching" value={rowsSorted.length} />
        {SERVICE_LIST.map(p => (
          <StatCard key={p.id} label={p.label} value={totals[p.id]}
            tone={(p.tone as 'green' | 'indigo' | 'blue' | 'amber')} />
        ))}
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
        {SOFTWARE_LIST.map(s => (
          <StatCard key={s.id} label={s.label} value={totals[s.id]}
            tone={(s.tone as 'default' | 'purple' | 'indigo' | 'red' | 'amber' | 'gray')} />
        ))}
      </div>

      {/* Bulk action toolbar: shown any time there's a selection OR
          "Select all visible" is available. Keeps actions within thumb-reach. */}
      <div className="flex flex-wrap items-center gap-2 mb-2 px-3 py-2 bg-surface-inset/40 border border-border rounded-lg">
        <button
          type="button"
          onClick={selectAllVisible}
          disabled={rowsSorted.length === 0}
          className="text-[12px] px-2.5 py-1 rounded bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors disabled:opacity-40"
        >
          Select all visible ({rowsSorted.length.toLocaleString()})
        </button>

        {selectedCodes.size > 0 ? (
          <>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium bg-accent/15 text-accent border border-accent/30">
              <span className="size-1.5 rounded-full bg-accent" />
              {selectedCodes.size.toLocaleString()} selected
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-[11px] text-text-muted hover:text-text-primary underline underline-offset-2"
            >
              Clear
            </button>

            <div className="mx-1 h-4 w-px bg-border" />

            <button
              type="button"
              onClick={exportCallList}
              className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25 transition-colors font-medium"
              title="Download CSV with contact info for call/email outreach"
            >
              <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h3.28a2 2 0 011.7.95l.86 1.5A2 2 0 0012.54 8H19a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
              Export call list (CSV)
            </button>
            <button
              type="button"
              onClick={() => copyFieldToClipboard('phone numbers', c => c.clinic_phone || c.contact_tel || '')}
              className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md bg-blue-500/15 border border-blue-500/40 text-blue-400 hover:bg-blue-500/25 transition-colors font-medium"
            >
              <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              Copy phones
            </button>
            <button
              type="button"
              onClick={() => copyFieldToClipboard('emails', c => c.email_main || '')}
              className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md bg-indigo-500/15 border border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/25 transition-colors font-medium"
            >
              <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Copy emails
            </button>
          </>
        ) : (
          <span className="text-[11px] text-text-muted italic">Tick the boxes on the left to bulk-export contacts.</span>
        )}

        <div className="ml-auto">
          <ExportButtons onExcel={handleExcel} onPdfPreview={handlePdfPreview} onPrint={handlePrint} />
        </div>
      </div>

      <ReportTable
        headers={headers}
        rows={rowsRendered}
        rowKeys={rowKeys}
        rawValues={rawValues}
        onRowClick={onClinicClick ? (i) => onClinicClick(rowsSorted[i].clinic.clinic_code) : undefined}
        emptyMessage="No clinics match the selected subscription filters."
        storageKey="subscriptions"
      />
    </div>
  )
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
        storageKey="maintenance"
        headers={['Acct No', 'Clinic', 'MTN Start', 'MTN End', 'Days', 'Product', 'Contact', 'Tel', 'Company', 'M1G/Dealer', 'State', '']}
        rowKeys={rows.map(r => r.id)}
        rowColours={rows.map(r => rowColourClass(r._days))}
        onRowClick={onClinicClick ? (i) => onClinicClick(rows[i].clinic_code) : undefined}
        rawValues={rows.map(r => [
          r.clinic_code, r.clinic_name,
          safeDate(r.mtn_start), safeDate(r.mtn_expiry),
          r._days === null ? '—' : String(r._days),
          r.product || r.product_type || '—',
          r.registered_contact || '—',
          r.clinic_phone || r.contact_tel || '—',
          r.company_name || '—',
          r.m1g_dealer_case || '—',
          r.state || '—',
          '',
        ])}
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
            <span key="co" className="text-[12px] text-text-tertiary" title={r.company_name || ''}>{r.company_name || '—'}</span>,
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
        storageKey="cloud"
        headers={['Acct No', 'Clinic', 'Cloud Start', 'Cloud End', 'Days', 'Backup', 'Ext HDD', 'Contact', 'Tel', 'Company', 'M1G/Dealer', 'State', '']}
        rowKeys={rows.map(r => r.id)}
        rowColours={rows.map(r => rowColourClass(r._days))}
        onRowClick={onClinicClick ? (i) => onClinicClick(rows[i].clinic_code) : undefined}
        rawValues={rows.map(r => [
          r.clinic_code, r.clinic_name,
          safeDate(r.cloud_start), safeDate(r.cloud_end),
          r._days === null ? '—' : String(r._days),
          r.has_backup ? 'Yes' : 'No',
          r.has_ext_hdd ? 'Yes' : 'No',
          r.registered_contact || '—',
          r.clinic_phone || r.contact_tel || '—',
          r.company_name || '—',
          r.m1g_dealer_case || '—',
          r.state || '—',
          '',
        ])}
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
          <span key="co" className="text-[12px] text-text-tertiary" title={r.company_name || ''}>{r.company_name || '—'}</span>,
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

// Fine-grained per-clinic status — used in row "Status" column.
// Captures the next action needed for each clinic in the E-Invoice funnel.
type EinvStatus = 'live' | 'paid' | 'signed' | 'po_only' | 'exempt' | 'not_started'

// Coarse-grained bucket — used for top-row summary cards + filter.
// Each fine-grained status maps to exactly one bucket via bucketOf().
type EinvBucket = 'live' | 'in_progress' | 'exempt' | 'not_started'

type EinvBucketSel = 'all' | EinvBucket | { kind: 'state'; state: string }

// Precedence order (top wins): Live > Exempt > Paid > Signed > PO only > Not started.
// Why Exempt beats Paid: explicit opt-out is a terminal state that overrides any
// legacy payment data — the clinic is no longer pursuing E-Invoice.
function classifyEinv(c: Clinic): EinvStatus {
  if (c.has_e_invoice) return 'live'
  if (c.einv_no_reason && c.einv_no_reason.trim()) return 'exempt'
  if (c.einv_payment_date) return 'paid'
  if (c.einv_v1_signed || c.einv_v2_signed) return 'signed'
  if (c.einv_po_rcvd_date) return 'po_only'
  return 'not_started'
}

function bucketOf(s: EinvStatus): EinvBucket {
  if (s === 'live') return 'live'
  if (s === 'exempt') return 'exempt'
  if (s === 'not_started') return 'not_started'
  return 'in_progress' // paid | signed | po_only
}

const STATUS_LABEL: Record<EinvStatus, string> = {
  live: 'Live',
  paid: 'Install Pending',
  signed: 'Payment Pending',
  po_only: 'Signup Pending',
  exempt: 'Exempt',
  not_started: 'Not Started',
}

const STATUS_TONE: Record<EinvStatus, string> = {
  live: 'text-emerald-400',
  paid: 'text-sky-400',
  signed: 'text-violet-400',
  po_only: 'text-amber-400',
  exempt: 'text-zinc-400',
  not_started: 'text-zinc-500',
}

const BUCKET_LABEL: Record<EinvBucket, string> = {
  live: 'Live',
  in_progress: 'In Progress',
  exempt: 'Exempt',
  not_started: 'Not Started',
}

function EInvoiceReport({ clinics, generatedBy, onClinicClick, onCountChange, openPreview }: {
  clinics: Clinic[]
  generatedBy: string
  onClinicClick?: (code: string) => void
  onCountChange: (n: number) => void
  openPreview: (data: PrintData) => void
}) {
  const { toast } = useToast()
  const [bucket, setBucket] = useState<EinvBucketSel>('all')
  const [sstFilter, setSstFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [reasonFilter, setReasonFilter] = useState<string>('all')
  const [reasonSearch, setReasonSearch] = useState('')

  const classified = useMemo(() => clinics.map(c => ({ ...c, _status: classifyEinv(c) })), [clinics])

  const stats = useMemo(() => {
    // Both fine-grained (per status) and coarse (per bucket) counts.
    const fine: Record<EinvStatus, number> = {
      live: 0, paid: 0, signed: 0, po_only: 0, exempt: 0, not_started: 0,
    }
    const coarse: Record<EinvBucket, number> = {
      live: 0, in_progress: 0, exempt: 0, not_started: 0,
    }
    const stateCount: Record<string, number> = {}
    for (const c of classified) {
      fine[c._status]++
      coarse[bucketOf(c._status)]++
      const st = c.state || 'Unknown'
      stateCount[st] = (stateCount[st] || 0) + 1
    }
    const topStates = Object.entries(stateCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
    return { fine, coarse, total: classified.length, topStates }
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
    if (typeof bucket === 'object' && bucket.kind === 'state') {
      r = r.filter(c => (c.state || 'Unknown') === bucket.state)
    } else if (bucket !== 'all') {
      // bucket is one of: 'live' | 'in_progress' | 'exempt' | 'not_started'
      r = r.filter(c => bucketOf(c._status) === bucket)
    }

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

  const statusLabel = (s: EinvStatus) => STATUS_LABEL[s]
  const statusTone = (s: EinvStatus) => STATUS_TONE[s]

  const bucketLabel = typeof bucket === 'object'
    ? `State = ${bucket.state}`
    : bucket === 'all' ? 'all'
    : BUCKET_LABEL[bucket]
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
    { label: 'Live', value: stats.coarse.live, tone: 'green' },
    { label: 'In Progress', value: stats.coarse.in_progress, tone: 'blue' },
    { label: '  · Install Pending', value: stats.fine.paid },
    { label: '  · Payment Pending', value: stats.fine.signed },
    { label: '  · Signup Pending', value: stats.fine.po_only },
    { label: 'Exempt', value: stats.coarse.exempt, tone: 'amber' },
    { label: 'Not Started', value: stats.coarse.not_started, tone: 'gray' },
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
      {/* Summary cards: 4 buckets (Live / In Progress / Exempt / Not Started) + top-3 states.
          The "In Progress" bucket aggregates the 3 funnel sub-stages — drill down via the
          status column in the table or the secondary chips below. */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-3 mb-4">
        <StatCard label="Total E-Invoice" value={stats.total} />
        <StatCard label="Live" value={stats.coarse.live} tone="green"
          active={bucket === 'live'}
          onClick={() => setBucket(bucket === 'live' ? 'all' : 'live')} />
        <StatCard label="In Progress" value={stats.coarse.in_progress} tone="blue"
          active={bucket === 'in_progress'}
          onClick={() => setBucket(bucket === 'in_progress' ? 'all' : 'in_progress')} />
        <StatCard label="Exempt" value={stats.coarse.exempt} tone="amber"
          active={bucket === 'exempt'}
          onClick={() => setBucket(bucket === 'exempt' ? 'all' : 'exempt')} />
        <StatCard label="Not Started" value={stats.coarse.not_started} tone="gray"
          active={bucket === 'not_started'}
          onClick={() => setBucket(bucket === 'not_started' ? 'all' : 'not_started')} />
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

      {/* Funnel breakdown chips — visible whenever "In Progress" bucket is active or "all" */}
      {(bucket === 'all' || bucket === 'in_progress') && (
        <div className="flex flex-wrap items-center gap-2 mb-3 px-2 py-1.5 bg-surface/50 border border-border/60 rounded-md">
          <span className="text-[11px] text-text-tertiary uppercase tracking-wider">Funnel:</span>
          <span className="text-[11px] text-sky-400">
            Install Pending <span className="font-semibold tabular-nums">{stats.fine.paid}</span>
          </span>
          <span className="text-text-muted">·</span>
          <span className="text-[11px] text-violet-400">
            Payment Pending <span className="font-semibold tabular-nums">{stats.fine.signed}</span>
          </span>
          <span className="text-text-muted">·</span>
          <span className="text-[11px] text-amber-400">
            Signup Pending <span className="font-semibold tabular-nums">{stats.fine.po_only}</span>
          </span>
        </div>
      )}

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
        storageKey="einvoice"
        headers={['Acct No', 'Clinic', 'Status', 'SST', 'Reason', 'Contact', 'Tel', 'Email', 'Company', 'State', '']}
        rowKeys={rows.map(r => r.id)}
        onRowClick={onClinicClick ? (i) => onClinicClick(rows[i].clinic_code) : undefined}
        rawValues={rows.map(r => [
          r.clinic_code, r.clinic_name,
          statusLabel(r._status),
          r.has_sst ? 'Yes' : 'No',
          r.einv_no_reason || '—',
          r.registered_contact || '—',
          r.clinic_phone || r.contact_tel || '—',
          r.email_main || '—',
          r.company_name || '—',
          r.state || '—',
          '',
        ])}
        rows={rows.map(r => [
          <span key="c" className="font-mono text-text-tertiary">{r.clinic_code}</span>,
          r.clinic_name,
          <span key="s" className={`text-[11px] font-medium ${statusTone(r._status)}`}>{statusLabel(r._status)}</span>,
          <span key="t" className={r.has_sst ? 'text-emerald-400' : 'text-text-muted'}>{r.has_sst ? 'Yes' : 'No'}</span>,
          <span key="rs" className="text-text-tertiary text-[12px]" title={r.einv_no_reason || ''}>{r.einv_no_reason || '—'}</span>,
          <span key="ct" className="text-[12px]">{r.registered_contact || '—'}</span>,
          <span key="tl" className="font-mono text-[12px] text-text-tertiary">{r.clinic_phone || r.contact_tel || '—'}</span>,
          <span key="em" className="text-[12px] text-text-tertiary" title={r.email_main || ''}>{r.email_main || '—'}</span>,
          <span key="co" className="text-[12px] text-text-tertiary" title={r.company_name || ''}>{r.company_name || '—'}</span>,
          r.state || '—',
          <RowActions key="a" phone={r.clinic_phone || r.contact_tel} wa={r.clinic_phone || r.contact_tel} />,
        ])}
        emptyMessage="No clinics match your filters"
      />
    </div>
  )
}

// ─ Main Component ───────────────────────────────────────────────

export default function ReportsView({ onClinicClick, refreshKey = 0 }: { onClinicClick?: (code: string) => void; refreshKey?: number } = {}) {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // URL-synced sub-tab: ?tab=maintenance|cloud|einvoice
  const urlTab = searchParams.get('tab')
  const activeTab: ReportTab =
    urlTab === 'subscriptions' || urlTab === 'cloud' || urlTab === 'einvoice' || urlTab === 'maintenance'
      ? urlTab
      : 'subscriptions'
  const setActiveTab = useCallback((tab: ReportTab) => {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'subscriptions') params.delete('tab')
    else params.set('tab', tab)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, router, pathname])

  const [clinics, setClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [generatedBy, setGeneratedBy] = useState<string>('Unknown')

  const [common, setCommon] = useState<CommonFilters>(EMPTY_COMMON)

  const [counts, setCounts] = useState<Record<ReportTab, number>>({ subscriptions: 0, maintenance: 0, cloud: 0, einvoice: 0 })
  const setCountFor = useCallback((tab: ReportTab) => (n: number) => {
    setCounts(prev => prev[tab] === n ? prev : { ...prev, [tab]: n })
  }, [])

  const [preview, setPreview] = useState<PrintData | null>(null)
  const [snapshotOpen, setSnapshotOpen] = useState(false)

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
        'has_backup', 'has_ext_hdd', 'has_e_invoice', 'has_sst', 'has_whatsapp',
        'einv_no_reason',
        // Fine-grained E-Invoice funnel fields — classifyEinv() reads these to
        // bucket a clinic into paid / signed / po_only. Missing them would make
        // the entire non-Live population fall into "Not Started".
        'einv_v1_signed', 'einv_v2_signed',
        'einv_po_rcvd_date', 'einv_payment_date', 'einv_live_date',
        // WhatsApp + SST detail (for Subscriptions overview)
        'wspp_live_date', 'wa_account_no',
        'sst_registration_no', 'sst_start_date', 'sst_frequency', 'sst_period_next',
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
    // WHY refreshKey: the parent CRM page bumps this whenever a clinic is
    // edited or created so the report stats/classification reflect the new
    // state without a full page reload.
  }, [supabase, refreshKey])

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
      {/* Today's Action Queue — only visible on the Subscriptions (overview) tab
          where there's no per-pipeline stats. Inside MTN/Cloud/E-Invoice tabs,
          each tab's own stats serve this purpose, so showing it again is
          redundant. */}
      <ActionQueueStrip clinics={filtered} setActiveTab={setActiveTab} visible={activeTab === 'subscriptions'} />

      {/* Monthly snapshot modal — always available via the tab bar button */}
      <MonthlySnapshotModal open={snapshotOpen} onClose={() => setSnapshotOpen(false)} clinics={filtered} />

      <ReportToolbar
        filters={common}
        options={options}
        onChange={patch => setCommon(prev => ({ ...prev, ...patch }))}
        onReset={() => setCommon(EMPTY_COMMON)}
      />

      <div className="mb-4 border-b border-border">
        <div className="flex items-center gap-1 flex-wrap">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              title={t.hint}
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
          <div className="ml-auto flex items-center gap-3 pb-2">
            <button
              type="button"
              onClick={() => setSnapshotOpen(true)}
              className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 transition-colors"
              title="Activity report for a picked month"
            >
              <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2z" /></svg>
              Monthly snapshot
            </button>
            <span className="text-[11px] text-text-muted">
              Scope: {filtered.length.toLocaleString()} of {clinics.length.toLocaleString()} clinics · {commonSummary}
            </span>
          </div>
        </div>
        {/* Active tab hint — one-line description of what this view is for */}
        <p className="pb-2 pt-0.5 text-[11px] text-text-muted italic">
          {TABS.find(t => t.id === activeTab)?.hint}
        </p>
      </div>

      {activeTab === 'subscriptions' && (
        <SubscriptionsReport
          clinics={filtered}
          generatedBy={generatedBy}
          onClinicClick={onClinicClick}
          onCountChange={setCountFor('subscriptions')}
          openPreview={setPreview}
        />
      )}

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
