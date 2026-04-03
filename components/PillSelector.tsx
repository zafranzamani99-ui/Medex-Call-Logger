'use client'

// WHY: Reusable pill select component (spec Section 16 — PillSelector.tsx).
// Used for issue_type, status, and channel selection.
// Mobile-first: 40px min height for easy thumb tapping (spec Section 13.1).
// Supports single select only (multi-select not needed per spec).

interface PillOption {
  value: string
  label: string
  colors: { bg: string; text: string }
}

interface PillSelectorProps {
  options: PillOption[]
  value: string | null
  onChange: (value: string) => void
  label?: string
  required?: boolean
}

export default function PillSelector({
  options,
  value,
  onChange,
  label,
  required,
}: PillSelectorProps) {
  return (
    <div>
      {label && (
        <label className="block text-sm text-zinc-400 mb-2">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isActive = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`pill ${opt.colors.bg} ${opt.colors.text} ${
                isActive
                  ? 'pill-active ring-current opacity-100'
                  : 'opacity-60 hover:opacity-80'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
