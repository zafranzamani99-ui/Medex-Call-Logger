'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Clinic } from '@/lib/types'
import ClinicSearch from '@/components/ClinicSearch'
import LicenseKeyModal from '@/components/LicenseKeyModal'
import ClinicProfilePanel from '@/components/ClinicProfilePanel'
import Button from '@/components/ui/Button'
import { Label } from '@/components/ui/Input'

// WHY: Dedicated License Key Request page — search clinic, open form, copy to Outlook.

interface LKRecord {
  id: string
  clinic_code: string
  clinic_name: string
  created_by: string
  created_at: string
  subject?: string
}

export default function LKPage() {
  const supabase = createClient()
  const [userName, setUserName] = useState('')
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [history, setHistory] = useState<LKRecord[]>([])
  const [loadingRow, setLoadingRow] = useState<string | null>(null)
  const [showCrmPanel, setShowCrmPanel] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', session.user.id)
          .single()
        if (profile) setUserName(profile.display_name)
      }
      // Load recent LK requests
      const { data } = await supabase
        .from('license_key_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      if (data) setHistory(data)

      // Check for pre-fill from Schedule Work Panel
      const prefill = sessionStorage.getItem('lk-prefill')
      if (prefill) {
        sessionStorage.removeItem('lk-prefill')
        try {
          const { clinic_code } = JSON.parse(prefill)
          if (clinic_code) {
            const { data: clinic } = await supabase
              .from('clinics')
              .select('*')
              .eq('clinic_code', clinic_code)
              .single()
            if (clinic) {
              setSelectedClinic(clinic as Clinic)
              setShowModal(true)
            }
          }
        } catch { /* ignore bad prefill */ }
      }
    }
    init()
  }, [supabase])

  const refreshHistory = async () => {
    const { data } = await supabase
      .from('license_key_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setHistory(data)
  }

  const handleClinicSelect = (clinic: Clinic) => {
    setSelectedClinic(clinic)
    setShowModal(true)
  }

  const handleRowClick = async (record: LKRecord) => {
    setLoadingRow(record.id)
    const { data } = await supabase
      .from('clinics')
      .select('*')
      .eq('clinic_code', record.clinic_code)
      .single()
    setLoadingRow(null)
    if (data) {
      setSelectedClinic(data as Clinic)
      setShowModal(true)
    }
  }

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-text-primary">License Key</h1>
        <p className="text-[13px] text-text-tertiary mt-0.5">Generate and manage license key requests</p>
      </div>

      {/* Clinic Search */}
      <div>
        <Label>Search Clinic</Label>
        <ClinicSearch onSelect={handleClinicSelect} />
      </div>

      {/* Selected clinic info */}
      {selectedClinic && (
        <div className="space-y-3">
          <div className="relative grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-surface-raised border border-border rounded-lg text-sm">
            <button
              onClick={() => setSelectedClinic(null)}
              className="absolute -top-2 -right-2 size-6 rounded-full bg-zinc-700 hover:bg-zinc-600 text-text-tertiary hover:text-text-primary flex items-center justify-center transition-colors"
            >
              <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div>
              <span className="text-text-tertiary text-xs">Code</span>
              <p className="text-text-primary font-mono">{selectedClinic.clinic_code}</p>
            </div>
            <div>
              <span className="text-text-tertiary text-xs">Clinic Name</span>
              <p className="text-text-primary">{selectedClinic.clinic_name}</p>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <span className="text-text-tertiary text-xs">Product</span>
              <p className="text-text-primary font-medium">
                {[
                  selectedClinic.product_type,
                  selectedClinic.has_e_invoice && 'EINV',
                  selectedClinic.has_whatsapp && 'WS',
                  selectedClinic.has_sst && 'SST',
                ].filter(Boolean).join(' + ') || '-'}
              </p>
            </div>
            <div>
              <span className="text-text-tertiary text-xs">MTN Start</span>
              <p className="text-text-primary">{selectedClinic.mtn_start ? selectedClinic.mtn_start.split('-').reverse().join('/') : '-'}</p>
            </div>
            <div>
              <span className="text-text-tertiary text-xs">MTN Expiry</span>
              <p className="text-text-primary">{selectedClinic.mtn_expiry ? selectedClinic.mtn_expiry.split('-').reverse().join('/') : '-'}</p>
            </div>
            <div>
              <span className="text-text-tertiary text-xs">Location</span>
              <p className="text-text-primary">{[selectedClinic.city, selectedClinic.state].filter(Boolean).join(', ') || '-'}</p>
            </div>
            <div>
              <span className="text-text-tertiary text-xs">Server Name</span>
              <p className="text-text-primary font-mono">{selectedClinic.main_pc_name || '-'}</p>
            </div>
            <div>
              <span className="text-text-tertiary text-xs">Device ID</span>
              <p className="text-text-primary font-mono">{selectedClinic.device_id || '-'}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setShowCrmPanel(true)}
              className="border border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/10"
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
              CRM
            </Button>
            <Button onClick={() => setShowModal(true)} size="lg" className="flex-1">
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              Create License Key Request
            </Button>
          </div>
        </div>
      )}

      {/* Recent LK Requests */}
      {history.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-text-secondary mb-2">Recent Requests</h2>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-raised text-text-tertiary">
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Code</th>
                  <th className="text-left px-3 py-2 font-medium">Clinic</th>
                  <th className="text-left px-3 py-2 font-medium">Subject</th>
                  <th className="text-left px-3 py-2 font-medium">By</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => handleRowClick(r)}
                    className="hover:bg-surface-raised cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2 text-text-secondary">
                      {new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2 text-text-primary font-mono">{r.clinic_code}</td>
                    <td className="px-3 py-2 text-text-primary">{r.clinic_name}</td>
                    <td className="px-3 py-2 text-text-secondary max-w-[200px]" title={r.subject || ''}>
                      <span className="line-clamp-1">{r.subject || '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-text-secondary">
                      {loadingRow === r.id ? (
                        <span className="text-accent animate-pulse">Loading…</span>
                      ) : r.created_by}
                    </td>
                    <td className="px-1 py-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!confirm('Delete this LK request?')) return
                          supabase.from('license_key_requests').delete().eq('id', r.id).then(() => refreshHistory())
                        }}
                        className="text-text-muted hover:text-red-400 p-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && selectedClinic && (
        <LicenseKeyModal
          clinic={selectedClinic}
          agentName={userName}
          onClose={async () => {
            setShowModal(false)
            refreshHistory()
            // Re-fetch clinic to reflect CRM updates from the LK form (e.g. EINV, WS, SST flags)
            const { data } = await supabase.from('clinics').select('*').eq('clinic_code', selectedClinic.clinic_code).single()
            if (data) setSelectedClinic(data as Clinic)
          }}
        />
      )}

      {/* CRM Profile Panel */}
      {showCrmPanel && selectedClinic && (
        <ClinicProfilePanel
          clinicCode={selectedClinic.clinic_code}
          onClose={() => setShowCrmPanel(false)}
          onClinicUpdated={() => {
            // Re-fetch clinic to pick up CRM changes (e.g. LKEY address)
            const refetch = async () => {
              const { data } = await supabase.from('clinics').select('*').eq('clinic_code', selectedClinic.clinic_code).single()
              if (data) setSelectedClinic(data as Clinic)
            }
            refetch()
          }}
        />
      )}
    </div>
  )
}
