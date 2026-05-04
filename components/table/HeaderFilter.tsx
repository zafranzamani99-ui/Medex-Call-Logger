'use client'

import { useState, useEffect, useRef } from 'react'

// WHY: Reusable per-column filter button (search + multi-select). Pulled out of
// components/reports/ReportsView.tsx so the History table can use the same UX.
// Renders a small inline icon next to a header label; click opens a dropdown
// with the distinct values for that column.

interface Props {
  headerText: string
  values: string[]                  // distinct values to choose from
  selected: Set<string>             // current selection (empty = no filter)
  onChange: (next: Set<string>) => void
  totalRows: number                 // for the footer count
}

export default function HeaderFilter({ headerText, values, selected, onChange, totalRows }: Props) {
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
