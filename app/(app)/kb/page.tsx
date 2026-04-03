'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { KnowledgeBaseEntry } from '@/lib/types'
import { ISSUE_TYPES, getIssueTypeColor } from '@/lib/constants'
import IssueTypeSelect from '@/components/IssueTypeSelect'
import { ModalDialog } from '@/components/Modal'
import Button from '@/components/ui/Button'
import { Input, Textarea, Label } from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'
import { KBSkeleton } from '@/components/Skeleton'
import { useToast } from '@/components/ui/Toast'
import KBArticle from '@/components/ui/KBArticle'

// WHY: Knowledge Base page — spec Section 12.
// Browse, search, filter by issue type, add new, delete.
// V2: AI drafts tab — resolved tickets auto-generate KB drafts via Gemini.
// Agents review drafts → Publish (editable) or Discard.

export default function KBPage() {
  const router = useRouter()
  const supabase = createClient()
  const [entries, setEntries] = useState<KnowledgeBaseEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [tab, setTab] = useState<'published' | 'drafts'>('published')
  const [showAdd, setShowAdd] = useState(false)
  const [userName, setUserName] = useState('')

  // Preview modal
  const [selectedEntry, setSelectedEntry] = useState<KnowledgeBaseEntry | null>(null)

  // Edit draft fields
  const [editingDraft, setEditingDraft] = useState<string | null>(null)
  const [editIssue, setEditIssue] = useState('')
  const [editFix, setEditFix] = useState('')

  // New entry form
  const [newType, setNewType] = useState<string | null>(null)
  const [newIssue, setNewIssue] = useState('')
  const [newFix, setNewFix] = useState('')
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [polishing, setPolishing] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchEntries()
    getUser()
  }, [])

  // "/" keyboard shortcut — focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const getUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', session.user.id)
        .single()
      if (profile) setUserName(profile.display_name)
    }
  }

  const fetchEntries = async () => {
    const { data } = await supabase
      .from('knowledge_base')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setEntries(data as KnowledgeBaseEntry[])
    setLoading(false)
  }

  // Split entries by status
  const published = useMemo(() => entries.filter(e => e.status === 'published'), [entries])
  const drafts = useMemo(() => entries.filter(e => e.status === 'draft'), [entries])

  // Filter applies to current tab
  const currentList = tab === 'published' ? published : drafts
  const filtered = useMemo(() => currentList.filter((e) => {
    const matchSearch =
      !search ||
      e.issue.toLowerCase().includes(search.toLowerCase()) ||
      e.fix.toLowerCase().includes(search.toLowerCase())
    const matchType = !typeFilter || e.issue_type === typeFilter
    return matchSearch && matchType
  }), [currentList, search, typeFilter])

  // Extract fix text from potentially JSON-wrapped content
  const extractFix = (raw: string): string => {
    const trimmed = raw.trim()
    if (!trimmed.startsWith('{')) return raw
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed.fix) return parsed.fix
    } catch { /* JSON malformed/truncated — manually extract */ }
    const fixKey = trimmed.indexOf('"fix"')
    if (fixKey === -1) return raw
    const colon = trimmed.indexOf(':', fixKey + 5)
    if (colon === -1) return raw
    const openQuote = trimmed.indexOf('"', colon + 1)
    if (openQuote === -1) return raw
    let result = ''
    for (let i = openQuote + 1; i < trimmed.length; i++) {
      const ch = trimmed[i]
      if (ch === '\\' && i + 1 < trimmed.length) {
        const next = trimmed[i + 1]
        if (next === 'n') { result += '\n'; i++; continue }
        if (next === '"') { result += '"'; i++; continue }
        if (next === '\\') { result += '\\'; i++; continue }
        result += next; i++; continue
      }
      if (ch === '"') break
      result += ch
    }
    return result || raw
  }

  // Click to fill log form (spec Section 12 — UC-16)
  const handleUseEntry = (entry: KnowledgeBaseEntry) => {
    // Strip markdown formatting (**bold**) and extract from JSON wrapper if needed
    const cleanFix = extractFix(entry.fix).replace(/\*\*\*?([^*]+)\*\*\*?/g, '$1')
    sessionStorage.setItem(
      'kb_prefill',
      JSON.stringify({
        issue_type: entry.issue_type,
        issue: entry.issue,
        my_response: cleanFix,
      })
    )
    router.push('/log')
  }

  // Add new entry (spec Section 12 — UC-17)
  const handleAdd = async () => {
    if (!newType || !newIssue.trim() || !newFix.trim()) return
    setSaving(true)

    await supabase.from('knowledge_base').insert({
      issue_type: newType,
      issue: newIssue.trim(),
      fix: newFix.trim(),
      added_by: userName,
      status: 'published',
    })

    setNewType(null)
    setNewIssue('')
    setNewFix('')
    setShowAdd(false)
    setSaving(false)
    fetchEntries()
  }

  // Delete entry
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this KB entry?')) return
    await supabase.from('knowledge_base').delete().eq('id', id)
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  // Publish a draft (with optional edits)
  const handlePublish = async (entry: KnowledgeBaseEntry) => {
    const issue = editingDraft === entry.id ? editIssue : entry.issue
    const fix = editingDraft === entry.id ? editFix : entry.fix

    setPublishing(entry.id)
    const { error } = await supabase
      .from('knowledge_base')
      .update({ status: 'published', issue, fix })
      .eq('id', entry.id)

    setPublishing(null)

    if (error) {
      console.error('Publish error:', error)
      toast('Failed to publish — try again', 'error')
      return
    }

    setEditingDraft(null)
    toast('KB article published!', 'success')
    await fetchEntries()
    setTab('published')
  }

  // Discard a draft
  const handleDiscard = async (id: string) => {
    await supabase.from('knowledge_base').delete().eq('id', id)
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  // Extract issue title from potentially JSON-wrapped content
  const extractIssue = (entry: KnowledgeBaseEntry): string => {
    const trimmed = entry.fix.trim()
    if (!trimmed.startsWith('{')) return entry.issue
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed.issue) return parsed.issue
    } catch { /* use DB issue */ }
    return entry.issue
  }

  // Start editing a draft
  const startEditDraft = (entry: KnowledgeBaseEntry) => {
    setEditingDraft(entry.id)
    setEditIssue(extractIssue(entry))
    setEditFix(extractFix(entry.fix))
  }

  // Polish rough edit with AI — cleans grammar/formatting, keeps technical content.
  // WHY: Also saves polished result back to DB so future AI generations learn from it.
  const handlePolish = async () => {
    if (!editIssue.trim() || !editFix.trim() || !editingDraft) return
    setPolishing(true)
    try {
      const res = await fetch('/api/polish-kb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue: editIssue, fix: editFix }),
      })
      const data = await res.json()
      if (data.success) {
        setEditIssue(data.issue)
        setEditFix(data.fix)

        // Save polished result to DB — this becomes a "learning" example for future AI drafts
        await supabase
          .from('knowledge_base')
          .update({ issue: data.issue, fix: data.fix })
          .eq('id', editingDraft)

        // Update local state so list reflects polished content
        setEntries(prev => prev.map(e =>
          e.id === editingDraft ? { ...e, issue: data.issue, fix: data.fix } : e
        ))

        toast('Polished & saved! Review before publishing.', 'success')
      } else {
        toast('Polish failed — try again', 'error')
      }
    } catch {
      toast('Polish failed — try again', 'error')
    }
    setPolishing(false)
  }

  if (loading) return <KBSkeleton />

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-text-primary">Knowledge Base</h1>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : 'Add Entry'}
        </Button>
      </div>

      {/* Tabs — Published / AI Drafts */}
      <div className="flex gap-1 mb-4 bg-surface-raised p-1 rounded-lg">
        <button
          onClick={() => setTab('published')}
          className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'published'
              ? 'bg-surface-overlay text-text-primary'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Published ({published.length})
        </button>
        <button
          onClick={() => setTab('drafts')}
          className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors relative ${
            tab === 'drafts'
              ? 'bg-surface-overlay text-text-primary'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          AI Drafts ({drafts.length})
          {drafts.length > 0 && tab !== 'drafts' && (
            <span className="absolute -top-1 -right-1 size-5 bg-accent text-white text-xs rounded-full flex items-center justify-center">
              {drafts.length}
            </span>
          )}
        </button>
      </div>

      {/* Add new entry — centered modal */}
      <ModalDialog open={showAdd} onClose={() => setShowAdd(false)} title="New KB Entry">
        <div className="p-4 space-y-4">
          <IssueTypeSelect
            value={newType}
            onChange={setNewType}
            required
          />
          <div>
            <Label required>Issue</Label>
            <Input
              type="text"
              value={newIssue}
              onChange={(e) => setNewIssue(e.target.value)}
              placeholder="Brief issue description"
            />
          </div>
          <div>
            <Label required>Fix / Solution</Label>
            <Textarea
              value={newFix}
              onChange={(e) => setNewFix(e.target.value)}
              rows={5}
              placeholder="Step-by-step fix..."
            />
          </div>
          <Button
            onClick={handleAdd}
            disabled={saving || !newType || !newIssue.trim() || !newFix.trim()}
            loading={saving}
            className="w-full"
          >
            Save Entry
          </Button>
        </div>
      </ModalDialog>

      {/* Search + filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <Input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search KB...  (/)"
            className="pl-9"
          />
        </div>
        <select
          value={typeFilter || ''}
          onChange={(e) => setTypeFilter(e.target.value || null)}
          className="pl-3 pr-8 py-2 bg-surface border border-border rounded-lg text-white text-sm cursor-pointer"
        >
          <option value="">All Types</option>
          {ISSUE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* KB entries list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <EmptyState
            icon={tab === 'drafts' ? '🤖' : '📚'}
            title={tab === 'drafts' ? 'No AI drafts yet' : 'No entries found'}
            description={tab === 'drafts' ? 'Drafts appear here automatically when tickets are resolved' : 'Try a different search or add a new entry'}
          />
        ) : (
          filtered.map((entry) => {
            const colors = getIssueTypeColor(entry.issue_type)
            const isEditing = editingDraft === entry.id

            return (
              <div
                key={entry.id}
                onClick={() => tab === 'published' ? setSelectedEntry(entry) : undefined}
                className={`bg-surface border rounded-lg p-4 transition-colors group ${
                  tab === 'drafts'
                    ? 'border-blue-500/30 bg-blue-500/5'
                    : 'border-border hover:bg-zinc-800/50 cursor-pointer'
                }`}
              >
                {/* Draft: editable inline */}
                {tab === 'drafts' ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                        {entry.issue_type}
                      </span>
                      <span className="text-xs text-blue-400">AI Draft</span>
                    </div>

                    {isEditing ? (
                      <>
                        <input
                          type="text"
                          value={editIssue}
                          onChange={(e) => setEditIssue(e.target.value)}
                          className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-white text-base font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                        <textarea
                          value={editFix}
                          onChange={(e) => setEditFix(e.target.value)}
                          rows={10}
                          className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-white text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </>
                    ) : (
                      <>
                        <h4 className="text-base font-semibold text-white">{entry.issue}</h4>
                        <div className="bg-background rounded-lg p-4 border border-border">
                          <KBArticle fix={entry.fix} imageUrls={entry.image_urls} />
                        </div>
                      </>
                    )}

                    <div className="flex gap-2 pt-2 border-t border-border">
                      <Button variant="success" size="sm" onClick={() => handlePublish(entry)} loading={publishing === entry.id} disabled={publishing === entry.id}>{publishing === entry.id ? 'Publishing...' : 'Publish'}</Button>
                      {!isEditing ? (
                        <Button variant="secondary" size="sm" onClick={() => startEditDraft(entry)}>Edit</Button>
                      ) : (
                        <>
                          <Button variant="secondary" size="sm" onClick={handlePolish} loading={polishing} disabled={polishing}>
                            {polishing ? 'Polishing...' : (
                              <span className="flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                                  <path d="M20 3v4" />
                                  <path d="M22 5h-4" />
                                </svg>
                                Polish
                              </span>
                            )}
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => setEditingDraft(null)}>Cancel Edit</Button>
                        </>
                      )}
                      <Button variant="danger" size="sm" onClick={() => handleDiscard(entry.id)}>Discard</Button>
                    </div>
                  </div>
                ) : (
                  /* Published: same as before */
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                          {entry.issue_type}
                        </span>
                        <span className="text-sm font-medium text-white">{entry.issue}</span>
                      </div>
                      <button
                        onClick={(e) => handleDelete(entry.id, e)}
                        className="text-zinc-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-sm text-zinc-400 mt-2 line-clamp-2">{extractFix(entry.fix)}</p>
                    {entry.added_by && (
                      <p className="text-xs text-zinc-500 mt-2">Added by: {entry.added_by}</p>
                    )}
                  </>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Entry preview modal (published only) */}
      <ModalDialog
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        title={selectedEntry?.issue_type || ''}
        size="lg"
      >
        {selectedEntry && (() => {
          const colors = getIssueTypeColor(selectedEntry.issue_type)
          return (
            <div className="p-5 space-y-4">
              <div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text} mb-2`}>
                  {selectedEntry.issue_type}
                </span>
                <h3 className="text-lg text-white font-semibold mt-2">{selectedEntry.issue}</h3>
              </div>

              <div>
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-2">Solution</span>
                <div className="bg-background rounded-lg p-4 border border-border">
                  <KBArticle fix={selectedEntry.fix} imageUrls={selectedEntry.image_urls} />
                </div>
              </div>

              {selectedEntry.added_by && (
                <p className="text-xs text-zinc-500">Added by: {selectedEntry.added_by}</p>
              )}

              <div className="flex gap-2 pt-2 border-t border-border">
                <Button className="flex-1" onClick={() => { handleUseEntry(selectedEntry); setSelectedEntry(null) }}>
                  Use in Log Call
                </Button>
                <Button variant="secondary" onClick={() => setSelectedEntry(null)}>
                  Close
                </Button>
              </div>
            </div>
          )
        })()}
      </ModalDialog>
    </div>
  )
}
