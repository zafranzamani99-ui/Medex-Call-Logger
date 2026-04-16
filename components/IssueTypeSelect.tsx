'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ISSUE_TYPES, getIssueTypeColor, ADMIN_PRIORITY_ISSUE_TYPES } from '@/lib/constants'
import { getIssueHexColor } from '@/lib/theme'
import type { UserRole } from '@/lib/types'

interface Props {
  value: string | null
  onChange: (value: string) => void
  required?: boolean
  userRole?: UserRole
}

export default function IssueTypeSelect({ value, onChange, required, userRole }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [customTypes, setCustomTypes] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load custom issue types from existing tickets (ones not in the default list)
  useEffect(() => {
    async function loadCustomTypes() {
      const supabase = createClient()
      const { data } = await supabase
        .from('tickets')
        .select('issue_type')
      if (data) {
        const defaultSet = new Set(ISSUE_TYPES)
        const custom = Array.from(new Set(
          data.map((t: { issue_type: string }) => t.issue_type).filter((t: string) => !defaultSet.has(t))
        )).sort() as string[]
        setCustomTypes(custom)
      }
    }
    loadCustomTypes()
  }, [])

  // All available types = defaults + custom from DB
  // WHY: Admin (clerk) uses Active/Expired Customer most — reorder to top for admin
  const allTypes = useMemo(() => {
    const base = [...ISSUE_TYPES, ...customTypes]
    if (userRole !== 'admin') return base
    const priority = ADMIN_PRIORITY_ISSUE_TYPES
    const rest = base.filter(t => !priority.includes(t))
    return [...priority, ...rest]
  }, [customTypes, userRole])

  // Filtered by search
  const filtered = useMemo(() => {
    if (!search.trim()) return allTypes
    const q = search.toLowerCase()
    return allTypes.filter((t) => t.toLowerCase().includes(q))
  }, [search, allTypes])

  // Check if search text is a new custom type (not in any list)
  const isNewCustom = search.trim() && !allTypes.some(t => t.toLowerCase() === search.trim().toLowerCase())

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(type: string) {
    onChange(type)
    setSearch('')
    setOpen(false)
  }

  const selectedColor = value ? getIssueTypeColor(value) : null

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm text-text-secondary mb-1">
        Issue Type {required && <span className="text-red-400">*</span>}
      </label>

      {/* Selected value / search input */}
      <div
        className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-white text-sm
                   cursor-pointer flex items-center gap-2 focus-within:ring-2 focus-within:ring-blue-500/50"
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
      >
        {value && !open ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${selectedColor?.bg} ${selectedColor?.text}`}>
            {value}
          </span>
        ) : null}
        <input
          ref={inputRef}
          type="text"
          value={open ? search : ''}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isNewCustom) {
              e.preventDefault()
              handleSelect(search.trim())
            }
          }}
          placeholder={value && !open ? '' : 'Search or type custom...'}
          className="bg-transparent outline-none flex-1 min-w-0 placeholder:text-text-tertiary"
        />
        <svg className={`w-4 h-4 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-zinc-900 border border-border rounded-lg shadow-xl">
          {filtered.map((type) => {
            const isCustom = !ISSUE_TYPES.includes(type)
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleSelect(type)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 flex items-center gap-2 transition-colors
                  ${value === type ? 'bg-zinc-800' : ''}`}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getIssueHexColor(type) }}
                />
                <span className="text-white">{type}</span>
                {isCustom && <span className="text-[10px] text-text-muted ml-auto">custom</span>}
              </button>
            )
          })}

          {/* Option to use typed text as new custom type */}
          {isNewCustom && (
            <button
              type="button"
              onClick={() => handleSelect(search.trim())}
              className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 flex items-center gap-2 transition-colors border-t border-border"
            >
              <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 bg-zinc-500" />
              <span className="text-white">Use &quot;{search.trim()}&quot;</span>
              <span className="text-[10px] text-text-muted ml-auto">new</span>
            </button>
          )}

          {filtered.length === 0 && !isNewCustom && (
            <div className="px-3 py-2 text-sm text-text-tertiary">No matches</div>
          )}
        </div>
      )}
    </div>
  )
}
