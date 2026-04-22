'use client'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import CrmDataTable from '@/components/crm/CrmDataTable'
import ClinicProfilePanel from '@/components/ClinicProfilePanel'
import NewClinicModal from '@/components/crm/NewClinicModal'
import ReportsView from '@/components/reports/ReportsView'
import Button from '@/components/ui/Button'

type MainTab = 'clinics' | 'reports'

// WHY: Dedicated CRM page — interactive spreadsheet for browsing/editing all clinic data,
// plus a Reports tab for MEDEXCRM-style maintenance / cloud / e-invoice tracking.

export default function CrmPage() {
  const supabase = createClient()
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [totalClinics, setTotalClinics] = useState(0)
  const [withSystemInfo, setWithSystemInfo] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [newClinicOpen, setNewClinicOpen] = useState(false)
  const [tableRefreshKey, setTableRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState<MainTab>(() => {
    if (typeof window === 'undefined') return 'clinics'
    const saved = sessionStorage.getItem('crm-active-tab')
    return (saved === 'reports' || saved === 'clinics') ? saved : 'clinics'
  })

  useEffect(() => {
    try { sessionStorage.setItem('crm-active-tab', activeTab) } catch {}
  }, [activeTab])

  useEffect(() => {
    loadStats()
    loadRole()
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

  const loadRole = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()
    setIsAdmin(profile?.role === 'admin')
  }

  return (
    <div className="-mx-4 sm:-mx-6 md:-mx-10 px-4 sm:px-5 md:px-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">CRM</h1>
          <p className="text-[13px] text-text-tertiary mt-0.5">
            {activeTab === 'clinics' ? 'Browse and update clinic data' : 'Maintenance, cloud backup, and e-invoice reports'}
          </p>
        </div>
        {isAdmin && activeTab === 'clinics' && (
          <Button variant="primary" size="md" onClick={() => setNewClinicOpen(true)}>
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Clinic
          </Button>
        )}
      </div>

      {/* Main tab switcher */}
      <div className="flex items-center gap-1 mb-5 border-b border-border">
        {([
          { id: 'clinics' as const, label: 'Clinics' },
          { id: 'reports' as const, label: 'Reports' },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px ${
              activeTab === t.id
                ? 'text-text-primary border-accent'
                : 'text-text-tertiary border-transparent hover:text-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'clinics' && (
        <>
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
          <CrmDataTable
            onClinicSelect={(code) => setSelectedCode(code)}
            refreshKey={tableRefreshKey}
            isAdmin={isAdmin}
          />
        </>
      )}

      {activeTab === 'reports' && (
        <Suspense fallback={<div className="h-96 skeleton rounded" />}>
          <ReportsView onClinicClick={setSelectedCode} refreshKey={tableRefreshKey} />
        </Suspense>
      )}

      {/* CRM Profile Panel */}
      {selectedCode && (
        <ClinicProfilePanel
          clinicCode={selectedCode}
          onClose={() => setSelectedCode(null)}
          onClinicUpdated={() => {
            // Bump refresh key so CrmDataTable AND ReportsView re-fetch — avoids
            // stale status/card counts after a profile edit.
            setTableRefreshKey(k => k + 1)
            loadStats()
          }}
          onClinicDeleted={() => {
            setSelectedCode(null)
            setTableRefreshKey(k => k + 1)
            loadStats()
          }}
          isAdmin={isAdmin}
        />
      )}

      {/* New Clinic modal */}
      <NewClinicModal
        open={newClinicOpen}
        onClose={() => setNewClinicOpen(false)}
        onCreated={(clinicCode) => {
          setTableRefreshKey(k => k + 1)
          loadStats()
          // Open the profile panel so the user can fill extended fields
          setSelectedCode(clinicCode)
        }}
      />
    </div>
  )
}
