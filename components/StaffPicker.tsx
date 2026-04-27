'use client'

import { useState, useEffect, useRef, useMemo } from 'react'

// WHY: PIC Support input on the schedule page. Hybrid behavior:
// - Type to search registered staff → autocomplete from dropdown
// - Or type any free-form name (external contractor, one-off helper) → saves
//   as text without an ID. The schedule's pic_support_id stays null in that
//   case; the typed text lands in pic_support.
// Set allowCustom={false} to enforce a real staff selection (e.g. leave entry).

interface StaffPickerProps {
  value: string | null   // staff_id (UUID) or null when free-text or empty
  displayValue?: string | null  // current display text (free-text or snapshot of selected name)
  onChange: (id: string | null, name: string | null) => void
  agents: { id: string; name: string }[]
  placeholder?: string
  disabled?: boolean
  hideLabel?: boolean
  label?: string
  required?: boolean
  allowCustom?: boolean  // default true — allow free-form text not in agents list
}

export default function StaffPicker({
  value,
  displayValue,
  onChange,
  agents,
  placeholder = 'Search or type a name...',
  disabled,
  hideLabel,
  label = 'PIC Support',
  required,
  allowCustom = true,
}: StaffPickerProps) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Fully controlled by props: text always reflects displayValue (or, if not
  // provided, the looked-up name for the current `value` UUID).
  const text = useMemo(() => {
    if (displayValue !== undefined && displayValue !== null) return displayValue
    if (value) return agents.find(a => a.id === value)?.name || ''
    return ''
  }, [displayValue, value, agents])

  const matchExact = (q: string) =>
    agents.find(a => a.name.toLowerCase().trim() === q.toLowerCase().trim())

  const isCustom = !!value || allowCustom === false ? false : (text.trim() !== '' && !matchExact(text))

  const results = useMemo(() => {
    const q = text.trim().toLowerCase()
    if (!q) return agents
    // If user already exactly matches a staff name, show full list so they can
    // re-pick a different one without first clearing the field.
    if (matchExact(text)) return agents
    return agents.filter(a => a.name.toLowerCase().includes(q))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, text])

  // Click outside → close (no value reset; whatever was typed is already committed upstream)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const emitText = (newText: string) => {
    const exact = matchExact(newText)
    onChange(exact?.id || null, newText || null)
  }

  const handleSelect = (a: { id: string; name: string }) => {
    onChange(a.id, a.name)
    setOpen(false)
  }

  const handleClear = () => {
    onChange(null, null)
    inputRef.current?.focus()
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight(h => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && results[highlight]) {
        e.preventDefault()
        handleSelect(results[highlight])
      } else if (allowCustom && text.trim()) {
        e.preventDefault()
        setOpen(false)
        // text is already emitted on each keystroke; just close the dropdown
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      {!hideLabel && (
        <label className="block text-sm text-zinc-400 mb-1">
          {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => {
            emitText(e.target.value)
            setOpen(true)
            setHighlight(0)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-white
                     placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50
                     focus:border-blue-500/50 text-sm disabled:opacity-50"
        />
        {/* Status badge: registered staff vs custom text */}
        {!disabled && text.trim() && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {value ? (
              <span title="Registered staff" className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium">
                Staff
              </span>
            ) : isCustom ? (
              <span title="Custom — not a registered staff member" className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">
                Custom
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleClear}
              className="text-text-secondary hover:text-text-primary p-1"
              aria-label="Clear"
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {open && (results.length > 0 || (allowCustom && text.trim() && !matchExact(text))) && (
        <div
          className="absolute z-40 w-full mt-1 bg-surface border border-border rounded-lg
                     shadow-xl max-h-60 overflow-y-auto"
        >
          {results.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(a)}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full text-left px-3 py-2 text-sm border-b border-border/50 last:border-b-0 transition-colors ${
                i === highlight ? 'bg-white/5 text-white' : 'text-text-secondary hover:bg-white/5 hover:text-white'
              } ${value === a.id ? 'text-blue-400' : ''}`}
            >
              {a.name}
            </button>
          ))}
          {/* "Use as custom" hint when typed text doesn't match any staff */}
          {allowCustom && text.trim() && !matchExact(text) && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen(false)}
              className="w-full text-left px-3 py-2 text-xs text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 transition-colors flex items-center gap-2"
            >
              <svg className="size-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Use &ldquo;{text.trim()}&rdquo; as custom PIC
            </button>
          )}
        </div>
      )}

      {open && results.length === 0 && text.trim() && !allowCustom && (
        <div className="absolute z-40 w-full mt-1 bg-surface border border-border rounded-lg shadow-xl px-3 py-2 text-sm text-text-tertiary">
          No staff matching &ldquo;{text}&rdquo;
        </div>
      )}
    </div>
  )
}
