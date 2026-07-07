'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { ModalDialog } from '@/components/Modal'
import type { UserRole } from '@/lib/types'
import { toProperCase, isAdminOrAbove } from '@/lib/constants'
import HolidaysSection from '@/components/settings/HolidaysSection'
import KBMaintenanceSection from '@/components/settings/KBMaintenanceSection'
import { invalidateClinicCache } from '@/components/ClinicSearch'

// WHY: Settings page — spec Section 6.
// 1. Display name edit (UC-22) — agent can change their name
// 2. CRM CSV upload (spec Section 5.7) — upload fresh clinic data
// 3. Team members — view team, admin can change roles

interface TeamMember {
  id: string
  display_name: string
  email: string
  role: UserRole
  is_active: boolean
  deactivated_at: string | null
  deactivated_by_name: string | null
  created_at: string
}

interface SyncChange {
  type: 'added' | 'updated' | 'removed'
  clinic_code: string
  clinic_name: string
  fields?: string[]
}

interface SyncLog {
  id: string
  synced_at: string
  trigger: string
  duration_ms: number | null
  total_contacts: number | null
  mapped: number | null
  upserted: number | null
  skipped: number | null
  errors: number | null
  changes: SyncChange[]
  stale_cleanup: boolean
}

function formatSyncDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

function formatSyncDate(iso: string): string {
  const d = new Date(iso)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

function SyncChangeRow({ change }: { change: SyncChange }) {
  const borderColor =
    change.type === 'added'
      ? 'border-l-green-500'
      : change.type === 'updated'
        ? 'border-l-amber-500'
        : 'border-l-red-500'

  const typeLabel =
    change.type === 'added' ? 'Added' : change.type === 'updated' ? 'Updated' : 'Removed'

  return (
    <div className={`border-l-2 ${borderColor} pl-2.5 py-1`}>
      <p className="text-xs text-text-primary">
        <span className="text-text-secondary">{typeLabel}</span>{' '}
        {change.clinic_code} — {change.clinic_name}
      </p>
      {change.type === 'updated' && change.fields && change.fields.length > 0 && (
        <p className="text-[11px] text-text-muted mt-0.5">{change.fields.join(', ')}</p>
      )}
    </div>
  )
}

function SyncChangesModal({
  open,
  onClose,
  syncDate,
  changes,
}: {
  open: boolean
  onClose: () => void
  syncDate: string
  changes: SyncChange[]
}) {
  const added = changes.filter(c => c.type === 'added')
  const updated = changes.filter(c => c.type === 'updated')
  const removed = changes.filter(c => c.type === 'removed')

  const sections: { label: string; items: SyncChange[] }[] = [
    { label: 'Added', items: added },
    { label: 'Updated', items: updated },
    { label: 'Removed', items: removed },
  ]

  return (
    <ModalDialog open={open} onClose={onClose} title={`Sync Changes — ${syncDate}`} size="md">
      <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
        {sections.map(section =>
          section.items.length > 0 ? (
            <div key={section.label}>
              <h4 className="text-xs font-medium text-text-secondary mb-2">
                {section.label} ({section.items.length})
              </h4>
              <div className="space-y-1.5">
                {section.items.map((change, i) => (
                  <SyncChangeRow key={i} change={change} />
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>
    </ModalDialog>
  )
}

export default function SettingsPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState('')
  const [userRole, setUserRole] = useState<UserRole>('support')
  const [displayName, setDisplayName] = useState('')
  const [originalName, setOriginalName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)
  const [updatingActive, setUpdatingActive] = useState<string | null>(null)
  const { toast } = useToast()

  // CRM upload state
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [uploadResult, setUploadResult] = useState<{
    success: boolean
    message: string
    count?: number
    timestamp?: string
  } | null>(null)

  const [clinicCount, setClinicCount] = useState<number>(0)

  // CRM sync state
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{
    success: boolean
    message: string
  } | null>(null)
  const [latestSync, setLatestSync] = useState<SyncLog | null>(null)
  const [showChangesModal, setShowChangesModal] = useState(false)

  const fetchLatestSync = useCallback(async () => {
    const { data } = await supabase
      .from('sync_logs')
      .select('*')
      .order('synced_at', { ascending: false })
      .limit(1)
      .single()
    if (data) setLatestSync(data as SyncLog)
  }, [supabase])

  useEffect(() => {
    loadPageData()
    fetchLatestSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // WHY: All 4 queries run in PARALLEL instead of sequential.
  // Previously: session → profile → count → latest = 4 roundtrips.
  // Now: session → (profile + count + latest) in parallel = 2 roundtrips.
  const loadPageData = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    setUserId(session.user.id)

    const [profileRes, countRes, , teamRes] = await Promise.all([
      supabase.from('profiles').select('display_name, role').eq('id', session.user.id).single(),
      supabase.from('clinics').select('*', { count: 'exact', head: true }),
      supabase.from('clinics').select('updated_at').order('updated_at', { ascending: false }).limit(1),
      supabase.from('profiles').select('id, display_name, email, role, is_active, deactivated_at, deactivated_by_name, created_at').order('created_at'),
    ])

    if (profileRes.data) {
      setDisplayName(profileRes.data.display_name)
      setOriginalName(profileRes.data.display_name)
      setUserRole((profileRes.data.role as UserRole) || 'support')
    }
    setClinicCount(countRes.count || 0)
    if (teamRes.data) {
      setTeamMembers(teamRes.data as TeamMember[])
    }
  }

  // Change another user's role (admin only)
  const handleRoleChange = async (memberId: string, newRole: UserRole) => {
    setUpdatingRole(memberId)
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', memberId)

    if (!error) {
      setTeamMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
      toast('Role updated')
    } else {
      toast('Failed to update role', 'error')
    }
    setUpdatingRole(null)
  }

  // Toggle active/inactive (admin only, can't toggle self)
  // WHY: Inactive users get kicked out on their next page load by the (app)/layout.tsx guard.
  // All their historical records (tickets, audit entries, etc.) stay intact.
  const handleActiveToggle = async (member: TeamMember) => {
    if (member.id === userId) {
      toast("You can't deactivate your own account", 'error')
      return
    }
    const nextActive = !member.is_active
    const label = member.display_name
    if (!nextActive && !confirm(`Deactivate ${label}? They'll be signed out on their next page load and won't be able to log back in until reactivated. Their existing records stay intact.`)) {
      return
    }
    setUpdatingActive(member.id)
    // Capture when/who — cleared on reactivate so the field reflects current state only.
    const patch = nextActive
      ? { is_active: true, deactivated_at: null, deactivated_by: null, deactivated_by_name: null }
      : { is_active: false, deactivated_at: new Date().toISOString(), deactivated_by: userId, deactivated_by_name: originalName || null }
    const { error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', member.id)

    if (!error) {
      setTeamMembers(prev => prev.map(m => m.id === member.id ? { ...m, ...patch } : m))
      toast(nextActive ? `${label} reactivated` : `${label} deactivated`)
    } else {
      toast('Failed to update status', 'error')
    }
    setUpdatingActive(null)
  }

  // Save display name (UC-22)
  // WHY: Also updates all tickets + timeline entries with the old name.
  // created_by_name is denormalized — without this, old tickets lose their connection.
  const handleSaveName = async () => {
    if (!displayName.trim() || displayName === originalName) return
    setSavingName(true)
    const newName = displayName.trim()

    const [profileRes] = await Promise.all([
      supabase.from('profiles').update({ display_name: newName }).eq('id', userId),
      supabase.from('tickets').update({ created_by_name: newName }).eq('created_by', userId),
      supabase.from('tickets').update({ last_updated_by_name: newName }).eq('last_updated_by', userId),
      supabase.from('timeline_entries').update({ added_by_name: newName }).eq('added_by', userId),
    ])

    if (!profileRes.error) {
      setOriginalName(newName)
      toast('Name updated — all your records are synced')
    } else {
      toast('Failed to update name', 'error')
    }
    setSavingName(false)
  }

  // CRM upload (spec Section 5.7).
  // WHY: Parses the workbook in the BROWSER, then POSTs JSON batches to
  // /api/crm-upload. This bypasses Vercel's 4.5 MB serverless body limit (the old
  // path uploaded the raw .xlsx, which 413'd at ~5 MB) and gives a real progress
  // bar. Server-side parsing path still exists in the route as a fallback for
  // small CSVs uploaded via formData.
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadResult(null)
    setUploadProgress(null)

    // Reset input early so the same file can be re-picked after this run.
    e.target.value = ''

    // Helper: read response, surfacing non-JSON bodies (e.g. Vercel's 413
    // plaintext) as a useful error instead of an opaque JSON-parse exception.
    const readResp = async (resp: Response): Promise<{ ok: boolean; data: { error?: string; [k: string]: unknown } }> => {
      const text = await resp.text()
      try {
        return { ok: resp.ok, data: JSON.parse(text) }
      } catch {
        return {
          ok: false,
          data: { error: `${resp.status} ${resp.statusText}: ${text.slice(0, 200)}` },
        }
      }
    }

    try {
      const fileName = file.name.toLowerCase()
      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')

      // CSV path: small, parse server-side via existing FormData route.
      if (!isExcel) {
        const formData = new FormData()
        formData.append('file', file)
        const resp = await fetch('/api/crm-upload', { method: 'POST', body: formData })
        const { ok, data } = await readResp(resp)
        if (!ok) throw new Error(data.error || `HTTP ${resp.status}`)
        const count = (data.count as number) || 0
        const timestamp = (data.timestamp as string) || new Date().toISOString()
        setUploadResult({ success: true, message: `Successfully imported ${count} clinics`, count, timestamp })

        setClinicCount(count)
        toast(`Successfully imported ${count} clinics`)
        return
      }

      // Excel path: parse client-side, stream JSON batches.
      const { parseCrmWorkbook } = await import('@/lib/crm-import')
      const buffer = await file.arrayBuffer()
      const parsed = parseCrmWorkbook(buffer)
      if (!parsed.ok) throw new Error(parsed.error)

      const total = parsed.clinics.length
      const BATCH_SIZE = 500
      const uploadStart = new Date().toISOString()
      setUploadProgress({ done: 0, total })

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = parsed.clinics.slice(i, i + BATCH_SIZE)
        const isLast = i + BATCH_SIZE >= total
        const resp = await fetch('/api/crm-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'batch',
            uploadStart,
            clinics: batch,
            isLast,
            totalCount: total,
            einvSheetFound: parsed.einvSheetFound,
            einvRowsMerged: parsed.einvRowsMerged,
          }),
        })
        const { ok, data } = await readResp(resp)
        if (!ok) throw new Error(data.error || `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed`)
        setUploadProgress({ done: Math.min(i + BATCH_SIZE, total), total })
      }

      const timestamp = new Date().toISOString()
      setUploadResult({
        success: true,
        message: `Successfully imported ${total} clinics`,
        count: total,
        timestamp,
      })
      setClinicCount(total)
      toast(`Successfully imported ${total} clinics`)
    } catch (err) {
      const msg = (err as Error).message || 'Unknown error'
      setUploadResult({ success: false, message: 'Upload failed: ' + msg })
      toast('Upload failed: ' + msg, 'error')
    } finally {
      setUploading(false)
      setUploadProgress(null)
      // Clinics changed en masse — drop the cached clinic list so the search
      // dropdown re-downloads the fresh set on its next open.
      invalidateClinicCache()
    }
  }

  // CRM sync — pull fresh data from manager's CRM database
  const handleCrmSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const resp = await fetch('/api/crm-sync', { method: 'POST' })
      const text = await resp.text()
      let data: Record<string, unknown>
      try { data = JSON.parse(text) } catch { data = { error: `${resp.status}: ${text.slice(0, 200)}` } }

      if (!resp.ok) throw new Error((data.error as string) || `HTTP ${resp.status}`)

      const mapped = (data.mapped as number) || 0
      const skipped = (data.skipped as number) || 0
      const total = (data.totalContacts as number) || 0
      setSyncResult({
        success: true,
        message: `Synced ${mapped.toLocaleString()} clinics from CRM (${total.toLocaleString()} contacts read, ${skipped} skipped)`,
      })
      setClinicCount(mapped)
      toast(`Synced ${mapped.toLocaleString()} clinics from CRM`)
      // Refresh sync log to show latest changes
      await fetchLatestSync()
    } catch (err) {
      const msg = (err as Error).message || 'Unknown error'
      setSyncResult({ success: false, message: 'Sync failed: ' + msg })
      toast('CRM sync failed: ' + msg, 'error')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="text-[13px] text-text-tertiary mt-0.5">Manage your account preferences</p>
      </div>

      {/* Display Name Edit */}
      <div className="bg-surface border border-border rounded-lg p-4 mb-4">
        <h2 className="text-sm font-medium text-text-secondary mb-3">Profile</h2>
        <div>
          <Label>Display Name</Label>
          <div className="flex gap-2">
            <Input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={handleSaveName}
              disabled={savingName || displayName === originalName}
              loading={savingName}
              size="md"
            >
              Save
            </Button>
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            This name appears on every ticket and timeline entry you create
          </p>
        </div>
      </div>

      {/* CRM Sync — available to all roles (support, admin, administrator) */}
      <div className="bg-surface border border-border rounded-lg p-4 mb-4">
          <h2 className="text-sm font-medium text-text-secondary mb-3">CRM Sync</h2>
          <p className="text-xs text-text-tertiary mb-3">
            Pull latest clinic data from the CRM database. This replaces the Excel upload for keeping clinic data fresh.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-sm">
            <div>
              <span className="text-text-tertiary text-xs">Clinics in Database</span>
              <p className="text-text-primary font-mono">{clinicCount.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-text-tertiary text-xs">Last Sync</span>
              <p className="text-text-primary">
                {latestSync?.synced_at
                  ? new Date(latestSync.synced_at).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Never'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleCrmSync}
              disabled={syncing}
              loading={syncing}
              size="md"
            >
              {syncing ? 'Syncing from CRM...' : 'Sync from CRM'}
            </Button>
            <span className="text-[11px] text-text-muted">Auto-syncs daily at 8:00 AM</span>
          </div>

          {syncResult && (
            <div
              className={`mt-3 p-3 rounded-lg border ${
                syncResult.success
                  ? 'bg-green-500/10 border-green-500/20'
                  : 'bg-red-500/10 border-red-500/20'
              }`}
            >
              <p className={`text-sm ${syncResult.success ? 'text-green-400' : 'text-red-400'}`}>
                {syncResult.message}
              </p>
            </div>
          )}

          {/* Latest sync result */}
          {latestSync ? (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-text-secondary">
                Last synced: {formatSyncDate(latestSync.synced_at)}
                {latestSync.trigger === 'cron' ? ' (auto)' : ''}
                {latestSync.duration_ms != null ? ` (${formatSyncDuration(latestSync.duration_ms)})` : ''}
                {latestSync.mapped != null ? ` — ${latestSync.mapped.toLocaleString()} clinics synced` : ''}
              </p>

              {/* Changes list */}
              {latestSync.changes && latestSync.changes.length > 0 ? (
                <div className="mt-3">
                  <h3 className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                    Changes
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-accent/15 text-accent">
                      {latestSync.changes.length}
                    </span>
                  </h3>
                  <div className="mt-2 space-y-1.5">
                    {latestSync.changes.slice(0, 5).map((change, i) => (
                      <SyncChangeRow key={i} change={change} />
                    ))}
                  </div>
                  {latestSync.changes.length > 5 && (
                    <button
                      onClick={() => setShowChangesModal(true)}
                      className="mt-2 text-xs text-accent hover:text-accent/80 transition-colors"
                    >
                      See all {latestSync.changes.length} changes
                    </button>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-text-muted">No changes detected</p>
              )}
            </div>
          ) : (
            <p className="mt-4 pt-4 border-t border-border text-xs text-text-muted">No sync history yet</p>
          )}
        </div>

      {/* Sync Changes Modal */}
      {latestSync && latestSync.changes && latestSync.changes.length > 0 && (
        <SyncChangesModal
          open={showChangesModal}
          onClose={() => setShowChangesModal(false)}
          syncDate={formatSyncDate(latestSync.synced_at)}
          changes={latestSync.changes}
        />
      )}

      {/* CRM Upload */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h2 className="text-sm font-medium text-text-secondary mb-3">CRM Data Upload</h2>

        {/* Current status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-sm">
          <div>
            <span className="text-text-tertiary text-xs">Clinics in Database</span>
            <p className="text-text-primary font-mono">{clinicCount.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-text-tertiary text-xs">Last Upload</span>
            <p className="text-text-primary">
              {uploadResult?.timestamp
                ? new Date(uploadResult.timestamp).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </p>
          </div>
        </div>

        {/* Upload button */}
        <div>
          <label className="block">
            <span className="sr-only">Upload CRM CSV</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleUpload}
              disabled={uploading}
              className="block w-full text-sm text-zinc-400
                         file:mr-4 file:py-2 file:px-4
                         file:rounded-md file:border-0
                         file:text-sm file:font-medium
                         file:bg-blue-600 file:text-white
                         hover:file:bg-blue-700
                         file:cursor-pointer file:disabled:bg-blue-600/50"
            />
          </label>
          <p className="text-xs text-text-tertiary mt-2">
            Upload CRM Excel file (.xlsx) or CSV directly.
            Reads the &quot;CRM&quot; sheet automatically. Replaces all clinic data.
            Existing tickets are never affected.
          </p>
        </div>

        {/* Upload status */}
        {uploading && (
          <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            {uploadProgress ? (
              <>
                <p className="text-sm text-blue-400 tabular-nums">
                  Uploading {uploadProgress.done.toLocaleString()} / {uploadProgress.total.toLocaleString()} clinics
                </p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-blue-500/15 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-200"
                    style={{ width: `${Math.round((uploadProgress.done / Math.max(uploadProgress.total, 1)) * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-blue-400">Reading and parsing file…</p>
            )}
          </div>
        )}

        {uploadResult && (
          <div
            className={`mt-3 p-3 rounded-lg border ${
              uploadResult.success
                ? 'bg-green-500/10 border-green-500/20'
                : 'bg-red-500/10 border-red-500/20'
            }`}
          >
            <p className={`text-sm ${uploadResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {uploadResult.message}
            </p>
          </div>
        )}
      </div>

      {/* Team Members */}
      <div className="bg-surface border border-border rounded-lg p-4 mt-4">
        <h2 className="text-sm font-medium text-text-secondary mb-3">Team</h2>
        <div className="space-y-2">
          {teamMembers.map(member => (
            <div
              key={member.id}
              className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-opacity ${
                member.id === userId
                  ? 'border-accent/30 bg-accent/5'
                  : 'border-border bg-surface-inset'
              } ${!member.is_active ? 'opacity-60' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium text-text-primary truncate">
                    {toProperCase(member.display_name)}
                  </span>
                  {member.id === userId && (
                    <span className="text-[10px] text-text-muted">(you)</span>
                  )}
                  {!member.is_active && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-500/15 text-red-400">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-tertiary truncate">{member.email}</p>
                {!member.is_active && member.deactivated_at && (
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Deactivated {new Date(member.deactivated_at).toLocaleDateString()}
                    {member.deactivated_by_name ? ` by ${toProperCase(member.deactivated_by_name)}` : ''}
                  </p>
                )}
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {isAdminOrAbove(userRole) && member.id !== userId ? (
                  <>
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.id, e.target.value as UserRole)}
                      disabled={updatingRole === member.id || !member.is_active}
                      className="text-[12px] px-2 py-1 rounded-md border border-border bg-surface-inset text-text-primary
                                 focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer disabled:opacity-50"
                    >
                      {userRole === 'administrator' && <option value="administrator">Administrator</option>}
                      <option value="admin">Admin</option>
                      <option value="support">Support</option>
                    </select>
                    <button
                      onClick={() => handleActiveToggle(member)}
                      disabled={updatingActive === member.id}
                      className={`text-[11px] px-2 py-1 rounded-md border transition-colors disabled:opacity-50 ${
                        member.is_active
                          ? 'border-border bg-surface text-text-tertiary hover:border-red-500/30 hover:text-red-400'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                      }`}
                      title={member.is_active ? 'Deactivate — blocks login, preserves records' : 'Reactivate — restores login access'}
                    >
                      {member.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </>
                ) : (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    member.role === 'administrator'
                      ? 'bg-amber-500/15 text-amber-400'
                      : member.role === 'admin'
                        ? 'bg-indigo-500/15 text-indigo-400'
                        : 'bg-slate-500/15 text-slate-400'
                  }`}>
                    {member.role === 'administrator' ? 'Administrator' : member.role === 'admin' ? 'Admin' : 'Support'}
                  </span>
                )}
              </div>
            </div>
          ))}
          {teamMembers.length === 0 && (
            <p className="text-[13px] text-text-muted py-2">Loading team...</p>
          )}
        </div>
      </div>

      {/* Public Holidays — admin/administrator only */}
      {isAdminOrAbove(userRole) && <HolidaysSection />}

      {/* KB Maintenance — admin/administrator only */}
      {isAdminOrAbove(userRole) && <KBMaintenanceSection />}

      {/* Feedback */}
      <div className="bg-surface border border-border rounded-lg p-4 mt-4">
        <h2 className="text-sm font-medium text-text-secondary mb-3">Feedback</h2>
        <p className="text-sm text-text-tertiary mb-3">
          Help us improve — share what&apos;s working, what&apos;s not, or what you&apos;d like to see next.
        </p>
        <a
          href="https://forms.gle/NMy4TXxwXoTYVcL56"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="secondary" size="md">
            Send Feedback
          </Button>
        </a>
      </div>
    </div>
  )
}
