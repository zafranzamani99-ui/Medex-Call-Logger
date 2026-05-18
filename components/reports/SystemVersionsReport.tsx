'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import type { Clinic } from '@/lib/types'

interface Props {
  clinics: Clinic[]
  onClinicClick?: (code: string) => void
  onCountChange: (n: number) => void
}

interface LatestVersion {
  program_version: string
  db_version: string
  revision: string
}

type VersionFilter = 'all' | 'latest' | 'outdated' | 'unknown'

export default function SystemVersionsReport({ clinics, onClinicClick, onCountChange }: Props) {
  const supabase = createClient()
  const { toast } = useToast()
  const [latest, setLatest] = useState<LatestVersion>({ program_version: '', db_version: '', revision: '' })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<LatestVersion>({ program_version: '', db_version: '', revision: '' })
  const [filter, setFilter] = useState<VersionFilter>('all')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'latest_version')
        .single()
      if (data?.value) {
        const v = data.value as LatestVersion
        setLatest(v)
        setDraft(v)
      }
    }
    load()
  }, [supabase])

  const classify = (c: Clinic): 'latest' | 'outdated' | 'unknown' => {
    const prog = c.current_program_version?.trim()
    const db = c.current_db_version?.trim()
    if (!prog && !db) return 'unknown'
    if (!latest.program_version && !latest.db_version) return 'unknown'
    if (prog === latest.program_version || db === latest.db_version) return 'latest'
    return 'outdated'
  }

  const counts = useMemo(() => {
    const result = { latest: 0, outdated: 0, unknown: 0, total: clinics.length }
    for (const c of clinics) {
      result[classify(c)]++
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinics, latest])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clinics.filter(c => {
      const status = classify(c)
      if (filter !== 'all' && status !== filter) return false
      if (q) {
        const hay = `${c.clinic_code} ${c.clinic_name} ${c.current_program_version || ''} ${c.current_db_version || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinics, filter, search, latest])

  useEffect(() => {
    onCountChange(filtered.length)
  }, [filtered.length, onCountChange])

  const versionGroups = useMemo(() => {
    const groups = new Map<string, number>()
    for (const c of clinics) {
      const prog = c.current_program_version?.trim()
      if (!prog) continue
      groups.set(prog, (groups.get(prog) || 0) + 1)
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[1] - a[1])
  }, [clinics])

  const handleSaveLatest = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('system_settings')
      .upsert({ key: 'latest_version', value: draft, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    setSaving(false)
    if (error) {
      toast('Failed to save: ' + error.message, 'error')
    } else {
      setLatest(draft)
      setEditing(false)
      toast('Latest version updated')
    }
  }

  const statusBadge = (status: 'latest' | 'outdated' | 'unknown') => {
    if (status === 'latest') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">Latest</span>
    if (status === 'outdated') return <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400">Outdated</span>
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-500/15 text-text-muted">Unknown</span>
  }

  return (
    <div>
      {/* Latest version reference */}
      <div className="bg-surface border border-border rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-text-muted uppercase tracking-wider font-medium">Current Latest Version</span>
          {!editing ? (
            <button
              onClick={() => { setDraft(latest); setEditing(true) }}
              className="text-[11px] text-accent hover:text-accent/80 transition-colors"
            >
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(false)} className="text-[11px] text-text-muted hover:text-text-secondary">Cancel</button>
              <button
                onClick={handleSaveLatest}
                disabled={saving}
                className="text-[11px] text-green-400 hover:text-green-300 font-medium"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
        {!editing ? (
          <div className="flex items-center gap-6">
            <div>
              <span className="text-[10px] text-text-muted">Program</span>
              <p className="text-sm text-text-primary font-mono">{latest.program_version || '—'}</p>
            </div>
            <div>
              <span className="text-[10px] text-text-muted">DB</span>
              <p className="text-sm text-text-primary font-mono">{latest.db_version || '—'}</p>
            </div>
            <div>
              <span className="text-[10px] text-text-muted">REV</span>
              <p className="text-sm text-text-primary font-mono">{latest.revision || '—'}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div>
              <label className="text-[10px] text-text-muted block mb-0.5">Program Version</label>
              <input
                value={draft.program_version}
                onChange={e => setDraft(d => ({ ...d, program_version: e.target.value }))}
                placeholder="e.g. 2026.1.1.23"
                className="px-2 py-1.5 bg-surface-inset border border-border rounded text-sm text-text-primary font-mono w-40 focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-muted block mb-0.5">DB Version</label>
              <input
                value={draft.db_version}
                onChange={e => setDraft(d => ({ ...d, db_version: e.target.value }))}
                placeholder="e.g. 426"
                className="px-2 py-1.5 bg-surface-inset border border-border rounded text-sm text-text-primary font-mono w-40 focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <div>
              <label className="text-[10px] text-text-muted block mb-0.5">Revision (REV)</label>
              <input
                value={draft.revision}
                onChange={e => setDraft(d => ({ ...d, revision: e.target.value }))}
                placeholder="e.g. 5"
                className="px-2 py-1.5 bg-surface-inset border border-border rounded text-sm text-text-primary font-mono w-40 focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {([
          { key: 'all' as const, label: 'TOTAL', value: counts.total, color: 'text-text-primary' },
          { key: 'latest' as const, label: 'ON LATEST', value: counts.latest, color: 'text-green-400' },
          { key: 'outdated' as const, label: 'OUTDATED', value: counts.outdated, color: 'text-orange-400' },
          { key: 'unknown' as const, label: 'NO DATA', value: counts.unknown, color: 'text-text-muted' },
        ]).map(card => (
          <button
            key={card.key}
            onClick={() => setFilter(card.key)}
            className={`bg-surface border rounded-lg p-3 text-left transition-colors ${
              filter === card.key ? 'border-accent/50 ring-1 ring-accent/20' : 'border-border hover:border-border-hover'
            }`}
          >
            <span className="text-[11px] text-text-muted uppercase tracking-wider">{card.label}</span>
            <p className={`text-2xl font-bold tabular-nums mt-0.5 ${card.color}`}>{card.value.toLocaleString()}</p>
          </button>
        ))}
      </div>

      {/* Version distribution */}
      {versionGroups.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-3 mb-4">
          <span className="text-[11px] text-text-muted uppercase tracking-wider font-medium">Version Distribution</span>
          <div className="flex flex-wrap gap-2 mt-2">
            {versionGroups.slice(0, 10).map(([version, count]) => (
              <button
                key={version}
                onClick={() => setSearch(version)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  version === latest.program_version
                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                    : 'bg-surface-inset border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                {version} <span className="text-text-muted ml-1">{count}</span>
              </button>
            ))}
            {versionGroups.length > 10 && (
              <span className="text-[11px] text-text-muted self-center">+{versionGroups.length - 10} more</span>
            )}
          </div>
        </div>
      )}

      {/* Search + Export */}
      <div className="flex items-center gap-3 mb-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by clinic name, code, or version..."
          className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
        <button
          onClick={() => {
            const headers = ['Acct No', 'Clinic', 'Product', 'Program Version', 'DB Version', 'REV', 'Status']
            const rows = filtered.map(c => {
              const status = classify(c)
              const rev = c.revision || ''
              return [
                c.clinic_code,
                c.clinic_name || '',
                c.product_type || '',
                c.current_program_version || '',
                c.current_db_version || '',
                rev,
                status === 'latest' ? 'Latest' : status === 'outdated' ? 'Outdated' : 'Unknown',
              ]
            })
            const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
            const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `system-versions-${new Date().toISOString().slice(0, 10)}.csv`
            a.click()
            URL.revokeObjectURL(url)
          }}
          className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors whitespace-nowrap"
        >
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-inset/50">
                <th className="text-left px-3 py-2 text-[11px] text-text-muted font-medium uppercase tracking-wider">Acct No</th>
                <th className="text-left px-3 py-2 text-[11px] text-text-muted font-medium uppercase tracking-wider">Clinic</th>
                <th className="text-left px-3 py-2 text-[11px] text-text-muted font-medium uppercase tracking-wider">Product</th>
                <th className="text-left px-3 py-2 text-[11px] text-text-muted font-medium uppercase tracking-wider">Program Version</th>
                <th className="text-left px-3 py-2 text-[11px] text-text-muted font-medium uppercase tracking-wider">DB Version</th>
                <th className="text-left px-3 py-2 text-[11px] text-text-muted font-medium uppercase tracking-wider">REV</th>
                <th className="text-left px-3 py-2 text-[11px] text-text-muted font-medium uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map(c => {
                const status = classify(c)
                return (
                  <tr
                    key={c.clinic_code}
                    onClick={() => onClinicClick?.(c.clinic_code)}
                    className={`border-b border-border/50 cursor-pointer hover:bg-surface-inset/30 transition-colors ${
                      status === 'outdated' ? 'bg-orange-500/5' : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-text-secondary font-mono text-xs">{c.clinic_code}</td>
                    <td className="px-3 py-2 text-text-primary">{c.clinic_name}</td>
                    <td className="px-3 py-2 text-text-secondary text-xs">{c.product_type || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <span className={status === 'latest' ? 'text-green-400' : status === 'outdated' ? 'text-orange-400' : 'text-text-muted'}>
                        {c.current_program_version || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <span className={status === 'latest' ? 'text-green-400' : status === 'outdated' ? 'text-orange-400' : 'text-text-muted'}>
                        {c.current_db_version || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-text-muted">
                      {c.revision || '—'}
                    </td>
                    <td className="px-3 py-2">{statusBadge(status)}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-text-muted text-sm">No clinics match this filter</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 200 && (
          <div className="px-3 py-2 text-[11px] text-text-muted border-t border-border bg-surface-inset/30">
            Showing 200 of {filtered.length.toLocaleString()} — use search or filters to narrow down
          </div>
        )}
      </div>
    </div>
  )
}
