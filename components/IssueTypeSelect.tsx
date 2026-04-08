'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { ISSUE_TYPES, getIssueTypeColor } from '@/lib/constants'
import { getIssueHexColor } from '@/lib/theme'

interface Props {
  value: string | null
  onChange: (value: string) => void
  required?: boolean
}

export default function IssueTypeSelect({ value, onChange, required }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filtered by search
  const filtered = useMemo(() => {
    if (!search.trim()) return ISSUE_TYPES
    const q = search.toLowerCase()
    return ISSUE_TYPES.filter((t) => t.toLowerCase().includes(q))
  }, [search])

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
      <label className="block text-sm text-zinc-400 mb-1">
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
          placeholder={value && !open ? '' : 'Search issue type...'}
          className="bg-transparent outline-none flex-1 min-w-0 placeholder:text-zinc-500"
        />
        <svg className={`w-4 h-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-zinc-900 border border-border rounded-lg shadow-xl">
          {filtered.map((type) => (
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
              </button>
          ))}

          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-zinc-500">No matches</div>
          )}
        </div>
      )}
    </div>
  )
}
