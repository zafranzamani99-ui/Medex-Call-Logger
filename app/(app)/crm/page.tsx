'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import CrmDataTable from '@/components/crm/CrmDataTable'
import ClinicProfilePanel from '@/components/ClinicProfilePanel'

// WHY: Dedicated CRM page — interactive spreadsheet for browsing/editing all clinic data.
// Uses @tanstack/react-table for an Airtable-like experience with inline editing,
// sorting, filtering, column visibility, and pagination.

export default function CrmPage() {
  const supabase = createClient()
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [totalClinics, setTotalClinics] = useState(0)
  const [withSystemInfo, setWithSystemInfo] = useState(0)

  useEffect(() => {
    loadStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadStats = async () => {
    const [countRes, sysRes] = await Promise.all([
      supabase.from('clinics').select('*', { count: 'exact', head: true }),
      supabase.from('clinics').select('*', { count: 'exact', head: true }).not('ultraviewer_id', 'is', null),
    ])
    setTotalClinics(countRes.count || 0)
    setWithSystemInfo(sysRes.count || 0)
  }

  return (
    <div className="-mx-4 sm:-mx-6 md:-mx-10 px-4 sm:px-5 md:px-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">CRM</h1>
          <p className="text-[13px] text-text-tertiary mt-0.5">Browse and update clinic data</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-surface border border-border rounded-lg p-3">
          <span className="text-[11px] text-text-muted uppercase tracking-wider">Total Clinics</span>
          <p className="text-xl font-bold text-text-primary tabular-nums mt-0.5">{totalClinics.toLocaleString()}</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <span className="text-[11px] text-text-muted uppercase tracking-wider">With System Info</span>
          <p className="text-xl font-bold text-indigo-400 tabular-nums mt-0.5">{withSystemInfo.toLocaleString()}</p>
        </div>
        <div className="bg-surface border border-border rounded-lg p-3">
          <span className="text-[11px] text-text-muted uppercase tracking-wider">Coverage</span>
          <p className="text-xl font-bold text-text-primary tabular-nums mt-0.5">
            {totalClinics > 0 ? Math.round((withSystemInfo / totalClinics) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Data Table */}
      <CrmDataTable onClinicSelect={(code) => setSelectedCode(code)} />

      {/* CRM Profile Panel */}
      {selectedCode && (
        <ClinicProfilePanel
          clinicCode={selectedCode}
          onClose={() => setSelectedCode(null)}
          onClinicUpdated={loadStats}
        />
      )}
    </div>
  )
}
