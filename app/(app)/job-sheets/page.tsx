'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { JobSheet, Clinic } from '@/lib/types'
import { JOB_SHEET_STATUS_COLORS, JOB_SHEET_CHECKLIST_LABELS, JOB_SHEET_ISSUE_CATEGORIES, DEFAULT_IMPORTANT_DETAILS, toProperCase } from '@/lib/constants'
import Button from '@/components/ui/Button'
import { Input, Label, Select } from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import EmptyState, { EmptyIcons } from '@/components/ui/EmptyState'
import { ModalDialog } from '@/components/Modal'
import ClinicSearch from '@/components/ClinicSearch'
import { useToast } from '@/components/ui/Toast'

const PAGE_SIZE = 20

export default function JobSheetsPage() {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()

  const [userId, setUserId] = useState('')
  const [userName, setUserName] = useState('')
  const [jobSheets, setJobSheets] = useState<JobSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [formClinic, setFormClinic] = useState<Clinic | null>(null)
  const [formDate, setFormDate] = useState('')
  const [formContactPerson, setFormContactPerson] = useState('')
  const [formContactTel, setFormContactTel] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  // Prefill from schedule
  const [prefillScheduleId, setPrefillScheduleId] = useState<string | null>(null)
  const [prefillClinicCode, setPrefillClinicCode] = useState('')
  const [prefillClinicName, setPrefillClinicName] = useState('')
  const [prefillWorkNotes, setPrefillWorkNotes] = useState('')
  const [prefillStartedAt, setPrefillStartedAt] = useState('')
  const [prefillCompletedAt, setPrefillCompletedAt] = useState('')

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      let profileName = ''
      if (session?.user) {
        setUserId(session.user.id)
        const { data: profile } = await supabase
          .from('profiles').select('display_name').eq('id', session.user.id).single()
        if (profile) { setUserName(profile.display_name); profileName = profile.display_name }
      }

      // Set default date to today
      const today = new Date()
      const yyyy = today.getFullYear()
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      const dd = String(today.getDate()).padStart(2, '0')
      setFormDate(`${yyyy}-${mm}-${dd}`)

      // Check for schedule prefill — auto-create job sheet from work panel
      const prefill = localStorage.getItem('js-prefill')
      const shouldCreate = new URLSearchParams(window.location.search).get('create')
      if (prefill && shouldCreate) {
        const data = JSON.parse(prefill)
        localStorage.removeItem('js-prefill')

        if (data.clinic_code && data.work_notes?.trim()) {
          // Has notes from work panel — auto-create with AI parsing
          autoCreateFromNotes(data, session?.user?.id || '', profileName)
          return
        }

        // No notes — show create modal for manual entry
        setPrefillScheduleId(data.schedule_id || null)
        setPrefillClinicCode(data.clinic_code || '')
        setPrefillClinicName(data.clinic_name || '')
        setFormContactPerson(data.contact_person || '')
        setFormContactTel(data.contact_tel || '')
        if (data.service_date) setFormDate(data.service_date)
        setPrefillWorkNotes(data.work_notes || '')
        setPrefillStartedAt(data.started_at || '')
        setPrefillCompletedAt(data.completed_at || '')
        setShowCreate(true)
      }
    }
    init()
    fetchJobSheets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchJobSheets = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('job_sheets')
      .select('*')
      .order('created_at', { ascending: false })
    setJobSheets((data as JobSheet[]) || [])
    setLoading(false)
  }

  // Auto-create job sheet from work panel notes (skip modal)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoCreateFromNotes = async (data: any, uid: string, uname: string) => {
    setFormSaving(true)
    toast('Creating job sheet from notes...', 'info')

    // Parse notes with AI
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any = {}
    try {
      const parseRes = await fetch('/api/parse-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: data.work_notes }),
      })
      const parseData = await parseRes.json()
      parsed = parseData.parsed || {}
    } catch { /* continue without parsed data */ }

    // Fetch clinic details (including CRM operational data for auto-fill)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let clinicData: any = null
    if (data.clinic_code) {
      const { data: clinic } = await supabase.from('clinics').select('*').eq('clinic_code', data.clinic_code).single()
      clinicData = clinic
    }

    const checklist = JOB_SHEET_CHECKLIST_LABELS.map(label => {
      const item = { label, checked: false, notes: '' }
      // CRM defaults first (full format e.g. "2026.1.1.23")
      if (clinicData?.workstation_count && label === 'Total Workstation') item.notes = clinicData.workstation_count
      if (clinicData?.current_program_version && label === 'Install/Update Program Version No') item.notes = clinicData.current_program_version
      if (clinicData?.current_db_version && label === 'Database Version (after update)') item.notes = clinicData.current_db_version
      // AI-parsed values only fill EMPTY checklist fields (CRM has proper full version format, AI has shorthand like "426")
      if (parsed.total_workstation && label === 'Total Workstation' && !item.notes) item.notes = parsed.total_workstation
      if (parsed.program_version_after && label === 'Install/Update Program Version No' && !item.notes) item.notes = parsed.program_version_after
      if (parsed.db_version_after && label === 'Database Version (after update)' && !item.notes) item.notes = parsed.db_version_after
      if (parsed.checklist_notes?.[label] && !item.notes) item.notes = parsed.checklist_notes[label]
      return item
    })
    const issueCategories = JOB_SHEET_ISSUE_CATEGORIES.map(label => ({ label, checked: false }))

    const importantDetails = { ...DEFAULT_IMPORTANT_DETAILS }
    // Pre-fill from CRM operational data (previous visits)
    if (clinicData?.main_pc_name) importantDetails.main_pc_name = clinicData.main_pc_name
    if (clinicData?.ultraviewer_id) importantDetails.ultraviewer_id = clinicData.ultraviewer_id
    if (clinicData?.ultraviewer_pw) importantDetails.ultraviewer_pw = clinicData.ultraviewer_pw
    if (clinicData?.anydesk_id) importantDetails.anydesk_id = clinicData.anydesk_id
    if (clinicData?.anydesk_pw) importantDetails.anydesk_pw = clinicData.anydesk_pw
    if (clinicData?.ram) importantDetails.ram = clinicData.ram
    if (clinicData?.processor) importantDetails.processor = clinicData.processor
    if (clinicData?.has_backup) importantDetails.auto_backup_30days = true
    if (clinicData?.has_ext_hdd) importantDetails.ext_hdd_backup = true
    if (clinicData?.db_size) importantDetails.service_db_size_before = clinicData.db_size
    // AI-parsed values override CRM defaults (agent notes are more current)
    if (parsed.main_pc_name) importantDetails.main_pc_name = parsed.main_pc_name
    if (parsed.space_c) importantDetails.space_c = parsed.space_c
    if (parsed.space_c_type) importantDetails.space_c_type = parsed.space_c_type
    if (parsed.space_d) importantDetails.space_d = parsed.space_d
    if (parsed.space_d_type) importantDetails.space_d_type = parsed.space_d_type
    if (parsed.service_db_size_before) importantDetails.service_db_size_before = parsed.service_db_size_before
    if (parsed.service_db_size_after) importantDetails.service_db_size_after = parsed.service_db_size_after
    if (parsed.ultraviewer_id) importantDetails.ultraviewer_id = parsed.ultraviewer_id
    if (parsed.ultraviewer_pw) importantDetails.ultraviewer_pw = parsed.ultraviewer_pw
    if (parsed.anydesk_id) importantDetails.anydesk_id = parsed.anydesk_id
    if (parsed.anydesk_pw) importantDetails.anydesk_pw = parsed.anydesk_pw
    if (parsed.ram) importantDetails.ram = parsed.ram
    if (parsed.processor) importantDetails.processor = parsed.processor
    if (parsed.auto_backup_30days === true) importantDetails.auto_backup_30days = true
    if (parsed.auto_backup_30days === false) importantDetails.auto_backup_30days = false
    if (parsed.ext_hdd_backup === true) importantDetails.ext_hdd_backup = true
    if (parsed.need_server === true) importantDetails.need_server = true
    if (parsed.brief_doctor === true) importantDetails.brief_doctor = true

    // Format schedule timestamps to readable time (e.g. "10:30 AM")
    const fmtTime = (ts: string) => {
      if (!ts) return null
      try { return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) } catch { return null }
    }

    const { data: jsData, error } = await supabase.from('job_sheets').insert({
      js_number: '',
      service_date: data.service_date || new Date().toISOString().split('T')[0],
      time_start: fmtTime(data.started_at) || null,
      time_end: fmtTime(data.completed_at) || null,
      service_by: uname,
      service_by_id: uid,
      clinic_code: data.clinic_code,
      clinic_name: clinicData?.clinic_name || data.clinic_name,
      contact_person: data.contact_person || parsed.contact_person || null,
      contact_tel: data.contact_tel || clinicData?.clinic_phone || parsed.contact_tel || null,
      clinic_email: clinicData?.email_main || null,
      doctor_name: clinicData?.registered_contact || parsed.doctor_name || null,
      doctor_phone: parsed.doctor_phone || null,
      program_type: clinicData?.product_type || null,
      version_before: parsed.version_before || null,
      db_version_before: parsed.db_version_before || null,
      issue_detail: parsed.issue_detail || null,
      service_done: parsed.service_done || null,
      suggestion: parsed.suggestion || null,
      remark: parsed.remark || null,
      checklist,
      important_details: importantDetails,
      issue_categories: issueCategories,
      schedule_id: data.schedule_id || null,
      created_by: uid,
      created_by_name: uname,
    }).select().single()

    setFormSaving(false)

    if (error) {
      toast('Failed to create: ' + error.message, 'error')
      return
    }

    if (jsData) {
      toast('Job sheet created from notes!')
      router.push(`/job-sheets/${jsData.id}`)
    }
  }

  const handleCreate = async () => {
    const clinicCode = formClinic?.clinic_code || prefillClinicCode
    const clinicName = formClinic?.clinic_name || prefillClinicName
    if (!clinicCode || !formDate) {
      toast('Clinic and date are required', 'error')
      return
    }

    setFormSaving(true)

    // Always fetch full clinic data from CRM (ClinicSearch only loads a subset of columns)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let clinicData: any = null
    if (clinicCode) {
      const { data: clinic } = await supabase.from('clinics').select('*').eq('clinic_code', clinicCode).single()
      clinicData = clinic
    }

    // Parse work notes with AI if available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any = {}
    if (prefillWorkNotes.trim()) {
      try {
        const parseRes = await fetch('/api/parse-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: prefillWorkNotes }),
        })
        const parseData = await parseRes.json()
        parsed = parseData.parsed || {}
      } catch { /* continue without parsed data */ }
    }

    const defaultChecklist = JOB_SHEET_CHECKLIST_LABELS.map(label => {
      const item: { label: string; checked: boolean; notes: string } = { label, checked: false, notes: '' }
      // CRM defaults first (full format e.g. "2026.1.1.23")
      if (clinicData?.workstation_count && label === 'Total Workstation') item.notes = clinicData.workstation_count
      if (clinicData?.current_program_version && label === 'Install/Update Program Version No') item.notes = clinicData.current_program_version
      if (clinicData?.current_db_version && label === 'Database Version (after update)') item.notes = clinicData.current_db_version
      // AI-parsed values only fill EMPTY checklist fields (CRM has proper full version format, AI has shorthand like "426")
      if (parsed.total_workstation && label === 'Total Workstation' && !item.notes) item.notes = parsed.total_workstation
      if (parsed.program_version_after && label === 'Install/Update Program Version No' && !item.notes) item.notes = parsed.program_version_after
      if (parsed.db_version_after && label === 'Database Version (after update)' && !item.notes) item.notes = parsed.db_version_after
      if (parsed.checklist_notes && parsed.checklist_notes[label] && !item.notes) item.notes = parsed.checklist_notes[label]
      return item
    })
    const defaultIssueCategories = JOB_SHEET_ISSUE_CATEGORIES.map(label => ({
      label, checked: false,
    }))

    // Merge important details — CRM first, then AI-parsed overrides
    const importantDetails = { ...DEFAULT_IMPORTANT_DETAILS }
    // CRM defaults
    if (clinicData?.main_pc_name) importantDetails.main_pc_name = clinicData.main_pc_name
    if (clinicData?.ultraviewer_id) importantDetails.ultraviewer_id = clinicData.ultraviewer_id
    if (clinicData?.ultraviewer_pw) importantDetails.ultraviewer_pw = clinicData.ultraviewer_pw
    if (clinicData?.anydesk_id) importantDetails.anydesk_id = clinicData.anydesk_id
    if (clinicData?.anydesk_pw) importantDetails.anydesk_pw = clinicData.anydesk_pw
    if (clinicData?.ram) importantDetails.ram = clinicData.ram
    if (clinicData?.processor) importantDetails.processor = clinicData.processor
    if (clinicData?.has_backup) importantDetails.auto_backup_30days = true
    if (clinicData?.has_ext_hdd) importantDetails.ext_hdd_backup = true
    if (clinicData?.db_size) importantDetails.service_db_size_before = clinicData.db_size
    // AI-parsed overrides
    if (parsed.main_pc_name) importantDetails.main_pc_name = parsed.main_pc_name
    if (parsed.space_c) importantDetails.space_c = parsed.space_c
    if (parsed.space_c_type) importantDetails.space_c_type = parsed.space_c_type
    if (parsed.space_d) importantDetails.space_d = parsed.space_d
    if (parsed.space_d_type) importantDetails.space_d_type = parsed.space_d_type
    if (parsed.service_db_size_before) importantDetails.service_db_size_before = parsed.service_db_size_before
    if (parsed.service_db_size_after) importantDetails.service_db_size_after = parsed.service_db_size_after
    if (parsed.ultraviewer_id) importantDetails.ultraviewer_id = parsed.ultraviewer_id
    if (parsed.ultraviewer_pw) importantDetails.ultraviewer_pw = parsed.ultraviewer_pw
    if (parsed.anydesk_id) importantDetails.anydesk_id = parsed.anydesk_id
    if (parsed.anydesk_pw) importantDetails.anydesk_pw = parsed.anydesk_pw
    if (parsed.ram) importantDetails.ram = parsed.ram
    if (parsed.processor) importantDetails.processor = parsed.processor
    if (parsed.auto_backup_30days === true) importantDetails.auto_backup_30days = true
    if (parsed.auto_backup_30days === false) importantDetails.auto_backup_30days = false
    if (parsed.ext_hdd_backup === true) importantDetails.ext_hdd_backup = true
    if (parsed.need_server === true) importantDetails.need_server = true
    if (parsed.brief_doctor === true) importantDetails.brief_doctor = true

    // Format schedule timestamps to readable time
    const fmtTime2 = (ts: string) => {
      if (!ts) return null
      try { return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) } catch { return null }
    }

    const { data, error } = await supabase.from('job_sheets').insert({
      js_number: '',
      service_date: formDate,
      time_start: fmtTime2(prefillStartedAt) || null,
      time_end: fmtTime2(prefillCompletedAt) || null,
      service_by: userName,
      service_by_id: userId,
      clinic_code: clinicCode,
      clinic_name: clinicData?.clinic_name || clinicName,
      contact_person: formContactPerson || parsed.contact_person || null,
      contact_tel: formContactTel || clinicData?.clinic_phone || parsed.contact_tel || null,
      clinic_email: clinicData?.email_main || null,
      doctor_name: clinicData?.registered_contact || parsed.doctor_name || null,
      doctor_phone: parsed.doctor_phone || null,
      program_type: clinicData?.product_type || null,
      version_before: parsed.version_before || null,
      db_version_before: parsed.db_version_before || null,
      issue_detail: parsed.issue_detail || null,
      service_done: parsed.service_done || null,
      suggestion: parsed.suggestion || null,
      remark: parsed.remark || null,
      checklist: defaultChecklist,
      important_details: importantDetails,
      issue_categories: defaultIssueCategories,
      schedule_id: prefillScheduleId || null,
      created_by: userId,
      created_by_name: userName,
    }).select().single()

    setFormSaving(false)

    if (error) {
      toast('Failed to create: ' + error.message, 'error')
      return
    }

    if (data) {
      toast('Job sheet created')
      router.push(`/job-sheets/${data.id}`)
    }
  }

  // Filter
  const filtered = jobSheets.filter(js => {
    if (statusFilter !== 'all' && js.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return js.js_number.toLowerCase().includes(q)
        || js.clinic_name.toLowerCase().includes(q)
        || js.service_by.toLowerCase().includes(q)
        || js.clinic_code.toLowerCase().includes(q)
    }
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="pb-20 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Job Sheets</h1>
          <p className="text-[13px] text-text-tertiary mt-0.5">Service job sheets for clinic visits</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          + New Job Sheet
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 max-w-xs">
          <Input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search JS#, clinic, agent..."
          />
        </div>
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="completed">Completed</option>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center text-text-tertiary py-20">Loading...</div>
      ) : paginated.length === 0 ? (
        <EmptyState
          icon={EmptyIcons.clipboard}
          title="No job sheets found"
          description={search || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first job sheet to get started'}
          action={!search && statusFilter === 'all' ? { label: '+ New Job Sheet', onClick: () => setShowCreate(true) } : undefined}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-tertiary text-xs">
                  <th className="text-left px-4 py-3 font-medium">JS #</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Clinic</th>
                  <th className="text-left px-4 py-3 font-medium">Service By</th>
                  <th className="text-left px-4 py-3 font-medium">Types</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map(js => {
                  const sc = JOB_SHEET_STATUS_COLORS[js.status] || JOB_SHEET_STATUS_COLORS.draft
                  return (
                    <tr
                      key={js.id}
                      onClick={() => router.push(`/job-sheets/${js.id}`)}
                      className="hover:bg-surface-raised/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-accent">{js.js_number}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {new Date(js.service_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-text-primary font-medium">{js.clinic_name}</td>
                      <td className="px-4 py-3 text-text-secondary">{toProperCase(js.service_by)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(js.service_types || []).map(t => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge bg={sc.bg} text={sc.text}>{js.status}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {paginated.map(js => {
              const sc = JOB_SHEET_STATUS_COLORS[js.status] || JOB_SHEET_STATUS_COLORS.draft
              return (
                <button
                  key={js.id}
                  onClick={() => router.push(`/job-sheets/${js.id}`)}
                  className="w-full text-left card p-4 hover:bg-surface-raised/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-accent">{js.js_number}</span>
                    <Badge bg={sc.bg} text={sc.text}>{js.status}</Badge>
                  </div>
                  <p className="text-sm text-text-primary font-medium">{js.clinic_name}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-text-tertiary">
                    <span>{new Date(js.service_date).toLocaleDateString('en-GB')}</span>
                    <span className="text-text-muted">·</span>
                    <span>{toProperCase(js.service_by)}</span>
                  </div>
                  {(js.service_types || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {js.service_types.map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">{t}</span>
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                Prev
              </Button>
              <span className="text-sm text-text-tertiary">
                {page} / {totalPages}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      <ModalDialog open={showCreate} onClose={() => { setShowCreate(false); setPrefillScheduleId(null); setPrefillClinicCode(''); setPrefillClinicName('') }} title="New Job Sheet" size="md">
        <div className="p-5 space-y-4">
          {prefillClinicName ? (
            <div>
              <Label>Clinic</Label>
              <div className="card p-3 mt-1">
                <p className="text-sm text-text-primary font-medium">{prefillClinicName}</p>
                <p className="text-xs text-text-tertiary">{prefillClinicCode}</p>
              </div>
            </div>
          ) : (
            <div>
              <Label required>Clinic</Label>
              <ClinicSearch
                hideLabel
                onSelect={(clinic) => {
                  setFormClinic(clinic)
                  if (clinic.clinic_phone) setFormContactTel(clinic.clinic_phone)
                  if (clinic.registered_contact) setFormContactPerson(clinic.registered_contact)
                }}
                value={formClinic}
              />
            </div>
          )}

          <div>
            <Label required>Service Date</Label>
            <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contact Person</Label>
              <Input
                type="text"
                value={formContactPerson}
                onChange={(e) => setFormContactPerson(e.target.value)}
                placeholder="PIC name"
              />
            </div>
            <div>
              <Label>Contact Tel</Label>
              <Input
                type="text"
                value={formContactTel}
                onChange={(e) => setFormContactTel(e.target.value)}
                placeholder="Phone number"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={formSaving} onClick={handleCreate}>
              Create Job Sheet
            </Button>
          </div>
        </div>
      </ModalDialog>
    </div>
  )
}
