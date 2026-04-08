'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'

// WHY: Settings page — spec Section 6.
// 1. CRM CSV upload (spec Section 5.7) — upload fresh clinic data
// 2. Last upload timestamp — so team knows how fresh the data is
// 3. Display name edit (UC-22) — agent can change their name

export default function SettingsPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [originalName, setOriginalName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const { toast } = useToast()

  // CRM upload state
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{
    success: boolean
    message: string
    count?: number
    timestamp?: string
  } | null>(null)
  const [lastUpload, setLastUpload] = useState<string | null>(null)
  const [clinicCount, setClinicCount] = useState<number>(0)

  useEffect(() => {
    loadPageData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // WHY: All 4 queries run in PARALLEL instead of sequential.
  // Previously: session → profile → count → latest = 4 roundtrips.
  // Now: session → (profile + count + latest) in parallel = 2 roundtrips.
  const loadPageData = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    setUserId(session.user.id)

    const [profileRes, countRes, latestRes] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', session.user.id).single(),
      supabase.from('clinics').select('*', { count: 'exact', head: true }),
      supabase.from('clinics').select('updated_at').order('updated_at', { ascending: false }).limit(1),
    ])

    if (profileRes.data) {
      setDisplayName(profileRes.data.display_name)
      setOriginalName(profileRes.data.display_name)
    }
    setClinicCount(countRes.count || 0)
    if (latestRes.data && latestRes.data.length > 0) {
      setLastUpload(latestRes.data[0].updated_at)
    }
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

  // CRM CSV upload (spec Section 5.7)
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/crm-upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (response.ok) {
        setUploadResult({
          success: true,
          message: `Successfully imported ${result.count} clinics`,
          count: result.count,
          timestamp: result.timestamp,
        })
        setLastUpload(result.timestamp)
        setClinicCount(result.count)
        toast(`Successfully imported ${result.count} clinics`)
      } else {
        setUploadResult({
          success: false,
          message: result.error,
        })
        toast(result.error, 'error')
      }
    } catch (err) {
      setUploadResult({
        success: false,
        message: 'Upload failed: ' + (err as Error).message,
      })
      toast('Upload failed: ' + (err as Error).message, 'error')
    }

    setUploading(false)
    // Reset file input so same file can be re-uploaded
    e.target.value = ''
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
              {lastUpload
                ? new Date(lastUpload).toLocaleDateString('en-GB', {
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
            <p className="text-sm text-blue-400">Uploading and processing...</p>
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
