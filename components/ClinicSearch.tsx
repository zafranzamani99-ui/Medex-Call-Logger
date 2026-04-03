'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Fuse from 'fuse.js'
import { createClient } from '@/lib/supabase/client'
import type { Clinic, OpenTicketWarning } from '@/lib/types'
import RenewalBadge from './RenewalBadge'

// WHY: Fuzzy clinic search dropdown — spec Section 8.2.
// Loads all clinics client-side (only ~3,862 rows) and uses Fuse.js for
// fuzzy matching against both clinic_name AND clinic_code.
// Dropdown format: [M_XXXX] CLINIC NAME — STATE — PRODUCT — RENEWAL (spec Section 5.1)
// On select: auto-fills CRM fields + fires open-ticket check.

interface ClinicSearchProps {
  onSelect: (clinic: Clinic) => void
  onOpenTickets?: (tickets: OpenTicketWarning[]) => void
  value?: Clinic | null  // controlled mode — parent can set the selected clinic
  hideLabel?: boolean
}

export default function ClinicSearch({ onSelect, onOpenTickets, value, hideLabel }: ClinicSearchProps) {
  const [query, setQuery] = useState('')
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [results, setResults] = useState<Clinic[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Sync with parent-controlled value (e.g. loading from draft)
  useEffect(() => {
    if (value === undefined) return
    if (value) {
      setSelectedClinic(value)
      setQuery(`[${value.clinic_code}] ${value.clinic_name}`)
    } else {
      setSelectedClinic(null)
      setQuery('')
    }
  }, [value])

  // Load all clinics on mount — ~3,900 rows, fast enough client-side
  useEffect(() => {
    async function loadClinics() {
      // WHY: Supabase PostgREST has a server-side max of 1000 rows per request.
      // We have ~3,900 clinics so we MUST paginate to get them all.
      // Without this, clinics beyond row 1000 (alphabetically) are invisible to search.
      const PAGE_SIZE = 1000
      const columns = 'id, clinic_code, clinic_name, clinic_phone, mtn_start, mtn_expiry, renewal_status, product_type, city, state, registered_contact, email_main, email_secondary, lkey_line1, lkey_line2, lkey_line3, lkey_line4, lkey_line5'
      let allClinics: Clinic[] = []
      let from = 0

      while (true) {
        const { data, error } = await supabase
          .from('clinics')
          .select(columns)
          .order('clinic_name')
          .range(from, from + PAGE_SIZE - 1)

        if (error) {
          console.error('[ClinicSearch] Failed to load clinics page:', from, error.message)
          break
        }
        if (!data || data.length === 0) break

        allClinics = allClinics.concat(data)
        if (data.length < PAGE_SIZE) break
        from += PAGE_SIZE
      }

      if (allClinics.length > 0) {
        setClinics(allClinics)
      } else {
        console.warn('[ClinicSearch] No clinic data loaded')
      }
      setLoading(false)
    }
    loadClinics()
  }, [])

  // WHY: useMemo prevents Fuse from rebuilding its inverted index on every render.
  // With 3,800+ clinics, this was a CRITICAL performance bug — O(n) index build per keystroke.
  const fuse = useMemo(() => new Fuse(clinics, {
    keys: ['clinic_name', 'clinic_code'],
    // WHY: 0.3 was too strict — multi-word searches like "an nur putrajaya"
    // scored 0.45+ and got filtered out. 0.5 allows fuzzy multi-word matching
    // while still keeping results relevant.
    threshold: 0.5,
    includeScore: true,
  }), [clinics])

  // Search on query change
  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      setShowDropdown(false)
      return
    }

    const fuseResults = fuse.search(query)
    setResults(fuseResults.map((r) => r.item).slice(0, 15)) // Cap at 15 results
    setShowDropdown(true)
  }, [query, clinics])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Open ticket check — fires when a clinic is selected (spec Section 5.1)
  const checkOpenTickets = async (clinicCode: string) => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // WHY: Only warn about open tickets, not resolved call logs
    const { data } = await supabase
      .from('tickets')
      .select('id, ticket_ref, issue_type, issue, created_at, created_by_name, status, record_type')
      .eq('clinic_code', clinicCode)
      .eq('record_type', 'ticket')
      .neq('status', 'Resolved')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false })

    if (data && data.length > 0) {
      onOpenTickets?.(data as OpenTicketWarning[])
    } else {
      onOpenTickets?.([])
    }
  }

  const handleSelect = (clinic: Clinic) => {
    setSelectedClinic(clinic)
    setQuery(`[${clinic.clinic_code}] ${clinic.clinic_name}`)
    setShowDropdown(false)
    onSelect(clinic)
    checkOpenTickets(clinic.clinic_code)
  }

  const handleClear = () => {
    setSelectedClinic(null)
    setQuery('')
    setResults([])
    onOpenTickets?.([])
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      {!hideLabel && (
        <label className="block text-sm text-zinc-400 mb-1">
          Clinic <span className="text-red-400">*</span>
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (selectedClinic) setSelectedClinic(null)
          }}
          placeholder={loading ? 'Loading clinics...' : 'Search clinic name or code...'}
          disabled={loading}
          className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-white
                     placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50
                     focus:border-blue-500/50 font-mono text-sm"
        />
        {selectedClinic && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-2"
            aria-label="Clear clinic selection"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-40 w-full mt-1 bg-surface border border-border rounded-lg
                     shadow-xl max-h-48 sm:max-h-60 overflow-y-auto"
        >
          {results.map((clinic) => (
            <button
              key={clinic.id}
              type="button"
              onMouseDown={(e) => {
                // WHY: preventDefault stops the input from losing focus (blurring).
                // On mobile, blur closes the keyboard → page shifts → first tap misses.
                // This ensures single-tap selection.
                e.preventDefault()
                handleSelect(clinic)
              }}
              className="w-full text-left px-3 py-2.5 hover:bg-zinc-800 transition-colors
                         border-b border-border/50 last:border-0"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-blue-400">[{clinic.clinic_code}]</span>
                <span className="text-sm text-white font-medium">{clinic.clinic_name}</span>
                {(clinic.city || clinic.state) && (
                  <span className="text-xs text-zinc-500">
                    — {[clinic.city, clinic.state].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {clinic.product_type && (
                  <span className="text-xs text-zinc-500">{clinic.product_type}</span>
                )}
                <RenewalBadge status={clinic.renewal_status} />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {showDropdown && query.length >= 2 && results.length === 0 && (
        <div className="absolute z-40 w-full mt-1 bg-surface border border-border rounded-lg p-3">
          <p className="text-sm text-zinc-500">No clinic found. You can fill details manually.</p>
        </div>
      )}
    </div>
  )
}
