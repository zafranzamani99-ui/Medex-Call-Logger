'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Resource, ResourceCategory, UserRole } from '@/lib/types'
import { RESOURCE_CATEGORIES, getResourceCategoryColor, toProperCase } from '@/lib/constants'
import { ResourcesSkeleton } from '@/components/Skeleton'
import { ModalDialog } from '@/components/Modal'
import Button from '@/components/ui/Button'

type FilterCategory = 'all' | 'pinned' | ResourceCategory

export default function ResourcesPage() {
  const supabase = createClient()
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<UserRole>('support')
  const [userName, setUserName] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterCategory>('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Resource | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formCategory, setFormCategory] = useState<ResourceCategory>('System Versions')
  const [formDescription, setFormDescription] = useState('')
  const [formVersion, setFormVersion] = useState('')
  const [formTags, setFormTags] = useState('')

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadData() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return

    const [profileRes, resourcesRes] = await Promise.all([
      supabase.from('profiles').select('display_name, role').eq('id', session.user.id).single(),
      supabase.from('resources').select('*').order('is_pinned', { ascending: false }).order('updated_at', { ascending: false }),
    ])

    if (profileRes.data) {
      setUserRole(profileRes.data.role as UserRole)
      setUserName(profileRes.data.display_name)
    }
    if (resourcesRes.data) {
      setResources(resourcesRes.data as Resource[])
    }
    setLoading(false)
  }

  // Filter + search
  const filtered = useMemo(() => {
    let list = resources
    if (filter === 'pinned') {
      list = list.filter(r => r.is_pinned)
    } else if (filter !== 'all') {
      list = list.filter(r => r.category === filter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.tags.some(t => t.toLowerCase().includes(q)) ||
        r.version?.toLowerCase().includes(q)
      )
    }
    return list
  }, [resources, filter, search])

  // Group by category for display
  const grouped = useMemo(() => {
    const pinned = filtered.filter(r => r.is_pinned)
    const groups: { category: string; items: Resource[] }[] = []

    if (pinned.length > 0 && filter !== 'pinned') {
      groups.push({ category: 'Pinned', items: pinned })
    }

    for (const cat of RESOURCE_CATEGORIES) {
      const items = filtered.filter(r => r.category === cat && (filter === 'pinned' || !r.is_pinned))
      if (items.length > 0) {
        groups.push({ category: cat, items })
      }
    }

    // If filtering by pinned, just show pinned flat
    if (filter === 'pinned') {
      return pinned.length > 0 ? [{ category: 'Pinned', items: pinned }] : []
    }

    return groups
  }, [filtered, filter])

  function openAddModal() {
    setEditing(null)
    setFormTitle('')
    setFormUrl('')
    setFormCategory('System Versions')
    setFormDescription('')
    setFormVersion('')
    setFormTags('')
    setShowModal(true)
  }

  function openEditModal(r: Resource) {
    setEditing(r)
    setFormTitle(r.title)
    setFormUrl(r.url)
    setFormCategory(r.category)
    setFormDescription(r.description || '')
    setFormVersion(r.version || '')
    setFormTags(r.tags.join(', '))
    setShowModal(true)
  }

  async function handleSave() {
    if (!formTitle.trim() || !formUrl.trim()) return
    setSaving(true)

    const tags = formTags.split(',').map(t => t.trim()).filter(Boolean)
    const payload = {
      title: formTitle.trim(),
      url: formUrl.trim(),
      category: formCategory,
      description: formDescription.trim() || null,
      version: formVersion.trim() || null,
      tags,
      updated_at: new Date().toISOString(),
      updated_by_name: userName,
    }

    if (editing) {
      await supabase.from('resources').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('resources').insert({
        ...payload,
        created_by_name: userName,
        created_by: (await supabase.auth.getSession()).data.session?.user.id,
      })
    }

    setSaving(false)
    setShowModal(false)
    loadData()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this resource?')) return
    setDeleting(id)
    await supabase.from('resources').delete().eq('id', id)
    setDeleting(null)
    loadData()
  }

  async function handleTogglePin(r: Resource) {
    await supabase.from('resources').update({
      is_pinned: !r.is_pinned,
      updated_by_name: userName,
      updated_at: new Date().toISOString(),
    }).eq('id', r.id)
    loadData()
  }

  async function handleCopy(url: string, id: string) {
    await navigator.clipboard.writeText(url)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const isAdmin = userRole === 'admin'

  const inputClasses = `w-full px-3 py-2.5 bg-surface-inset border border-border rounded-lg text-text-primary text-[13px]
    placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[var(--ring)]
    focus:border-transparent focus-glow transition-all`

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <ResourcesSkeleton />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Resources</h1>
            <p className="text-[13px] text-text-tertiary mt-0.5">Central hub for team files and links</p>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={openAddModal}>
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Resource
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search resources..."
            className="w-full pl-9 pr-3 py-2.5 bg-surface-inset border border-border rounded-lg text-text-primary text-[13px] placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent transition-all"
          />
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {(['all', 'pinned', ...RESOURCE_CATEGORIES] as FilterCategory[]).map((f) => {
            const active = filter === f
            const label = f === 'all' ? 'All' : f === 'pinned' ? 'Pinned' : f
            const count = f === 'all'
              ? resources.length
              : f === 'pinned'
                ? resources.filter(r => r.is_pinned).length
                : resources.filter(r => r.category === f).length
            if (f === 'pinned' && count === 0) return null
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all border ${
                  active
                    ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                    : 'bg-surface border-border text-text-tertiary hover:text-text-secondary hover:bg-surface-raised'
                }`}
              >
                {f === 'pinned' && (
                  <svg className="size-3 inline mr-1 -mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                  </svg>
                )}
                {label}
                <span className="ml-1.5 text-text-muted">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Resource list */}
        {grouped.length === 0 ? (
          <div className="text-center py-16">
            <svg className="size-12 mx-auto mb-3 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H2.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
            <p className="text-text-secondary font-medium">No resources yet</p>
            <p className="text-[13px] text-text-muted mt-1">
              {isAdmin ? 'Add your first resource to get started' : 'Resources will appear here once added by an admin'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <div key={group.category}>
                {/* Group header */}
                <div className="flex items-center gap-2 mb-2">
                  {group.category === 'Pinned' ? (
                    <svg className="size-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                    </svg>
                  ) : (
                    <span className={`inline-block size-2 rounded-full ${getResourceCategoryColor(group.category).bg.replace('/10', '/40')}`} />
                  )}
                  <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{group.category}</h2>
                  <span className="text-[11px] text-text-muted">{group.items.length}</span>
                </div>

                {/* Items */}
                <div className="space-y-1.5">
                  {group.items.map((r) => {
                    const catColor = getResourceCategoryColor(r.category)
                    return (
                      <div
                        key={r.id}
                        className="group relative bg-surface border border-border rounded-lg px-4 py-3 hover:bg-surface-raised transition-all"
                      >
                        {/* Top row: category pill + title + version + pin */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${catColor.bg} ${catColor.text}`}>
                            {r.category}
                          </span>
                          <span className="font-medium text-sm text-text-primary truncate">{r.title}</span>
                          {r.version && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-surface-inset text-text-secondary border border-border">
                              v{r.version}
                            </span>
                          )}
                          {r.is_pinned && (
                            <svg className="size-3 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                            </svg>
                          )}
                        </div>

                        {/* Tags */}
                        {r.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {r.tags.map((tag) => (
                              <span
                                key={tag}
                                onClick={() => setSearch(tag)}
                                className="px-1.5 py-0.5 rounded text-[10px] text-text-muted bg-surface-inset cursor-pointer hover:text-text-secondary transition-colors"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Description */}
                        {r.description && (
                          <p className="text-[12px] text-text-tertiary mb-1.5 line-clamp-2">{r.description}</p>
                        )}

                        {/* Bottom row: meta + actions */}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-text-muted">
                            {r.updated_by_name
                              ? `Updated by ${toProperCase(r.updated_by_name)}`
                              : `Added by ${toProperCase(r.created_by_name)}`}
                            {' · '}
                            {new Date(r.updated_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>

                          <div className="flex items-center gap-1">
                            {/* Copy link */}
                            <button
                              onClick={() => handleCopy(r.url, r.id)}
                              className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-inset transition-all"
                              title="Copy link"
                            >
                              {copied === r.id ? (
                                <svg className="size-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>

                            {/* Open link */}
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-md text-text-muted hover:text-indigo-400 hover:bg-indigo-500/10 transition-all"
                              title="Open link"
                            >
                              <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                            </a>

                            {/* Admin actions */}
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => handleTogglePin(r)}
                                  className={`p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100 ${
                                    r.is_pinned
                                      ? 'text-amber-400 hover:bg-amber-500/10'
                                      : 'text-text-muted hover:text-amber-400 hover:bg-amber-500/10'
                                  }`}
                                  title={r.is_pinned ? 'Unpin' : 'Pin to top'}
                                >
                                  <svg className="size-3.5" fill={r.is_pinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => openEditModal(r)}
                                  className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-inset transition-all opacity-0 group-hover:opacity-100"
                                  title="Edit"
                                >
                                  <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDelete(r.id)}
                                  disabled={deleting === r.id}
                                  className="p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                  title="Delete"
                                >
                                  <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                  </svg>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Modal */}
        <ModalDialog open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Resource' : 'Add Resource'}>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-text-tertiary mb-1.5">Category</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as ResourceCategory)}
                className={inputClasses}
              >
                {RESOURCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-text-tertiary mb-1.5">Title *</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Medex Cloud Server Installer"
                className={inputClasses}
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-text-tertiary mb-1.5">URL *</label>
              <input
                type="url"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://1drv.ms/..."
                className={inputClasses}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-text-tertiary mb-1.5">Version</label>
                <input
                  type="text"
                  value={formVersion}
                  onChange={(e) => setFormVersion(e.target.value)}
                  placeholder="e.g. 3.2.1"
                  className={inputClasses}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-text-tertiary mb-1.5">Tags</label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="e.g. server, 4pc"
                  className={inputClasses}
                />
                <p className="text-[10px] text-text-muted mt-0.5">Comma-separated</p>
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-text-tertiary mb-1.5">Description</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional notes about this resource..."
                rows={2}
                className={inputClasses}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleSave}
                loading={saving}
                disabled={!formTitle.trim() || !formUrl.trim()}
              >
                {editing ? 'Save Changes' : 'Add Resource'}
              </Button>
            </div>
          </div>
        </ModalDialog>
      </div>
    </div>
  )
}
