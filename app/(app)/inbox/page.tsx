'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, formatDistanceToNow } from 'date-fns'
import type { InboxMessage, InboxReply, Profile } from '@/lib/types'
import { toProperCase } from '@/lib/constants'
import EmptyState from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { SlidePanel } from '@/components/Modal'

const PAGE_SIZE = 15
const ARCHIVE_DAYS = 30

export default function InboxPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { toast } = useToast()

  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [lastReadAt, setLastReadAt] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')
  const [userId, setUserId] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'all' | 'open' | 'done' | 'mine' | 'archive'>('all')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [teamMembers, setTeamMembers] = useState<Pick<Profile, 'id' | 'display_name'>[]>([])
  const [assignDropdownFor, setAssignDropdownFor] = useState<string | null>(null)
  const [trashDropdownFor, setTrashDropdownFor] = useState<string | null>(null)

  // Chat thread state
  const [chatOpenFor, setChatOpenFor] = useState<string | null>(null)
  const [chatReplies, setChatReplies] = useState<InboxReply[]>([])
  const [chatText, setChatText] = useState('')
  const [loadingChat, setLoadingChat] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatOpenForRef = useRef<string | null>(null)

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const chatInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { chatOpenForRef.current = chatOpenFor }, [chatOpenFor])

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('inbox_messages')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setMessages(data as InboxMessage[])
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const uid = session.user.id
      setUserId(uid)

      const [profileRes, teamRes] = await Promise.all([
        supabase.from('profiles').select('display_name, role').eq('id', uid).single(),
        supabase.from('profiles').select('id, display_name').eq('is_active', true).order('display_name'),
      ])

      if (profileRes.data) {
        setUserName(profileRes.data.display_name)
        setUserRole(profileRes.data.role)
      }
      if (teamRes.data) setTeamMembers(teamRes.data)

      const { data: readStatus } = await supabase
        .from('inbox_read_status')
        .select('last_read_at')
        .eq('user_id', uid)
        .maybeSingle()

      setLastReadAt(readStatus?.last_read_at || '1970-01-01T00:00:00Z')

      await fetchMessages()
      setLoading(false)

      await supabase.from('inbox_read_status').upsert({
        user_id: uid,
        last_read_at: new Date().toISOString(),
      })
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-open chat when navigating from a notification (?chat=<id>)
  useEffect(() => {
    const chatId = searchParams.get('chat')
    if (!chatId || loading) return
    const exists = messages.some(m => m.id === chatId)
    if (exists) openChat(chatId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading])

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('inbox-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inbox_messages' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          setMessages(prev => [payload.new as InboxMessage, ...prev])
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inbox_messages' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          setMessages(prev => prev.map(m =>
            m.id === payload.new.id ? { ...m, ...payload.new } : m
          ))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inbox_replies' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const newReply = payload.new as InboxReply
          if (chatOpenForRef.current === newReply.inbox_message_id) {
            setChatReplies(prev => {
              if (prev.some(r => r.id === newReply.id)) return prev
              return [...prev, newReply]
            })
          }
          setMessages(prev => prev.map(m =>
            m.id === newReply.inbox_message_id
              ? { ...m, reply_count: (m.reply_count || 0) + 1 }
              : m
          ))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  useEffect(() => {
    if (chatOpenFor && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatReplies, chatOpenFor])

  // Close dropdowns on outside click
  useEffect(() => {
    if (!assignDropdownFor && !trashDropdownFor) return
    const handler = () => { setAssignDropdownFor(null); setTrashDropdownFor(null) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [assignDropdownFor, trashDropdownFor])

  const roleLabel = userRole === 'administrator' ? 'Administrator' : userRole === 'admin' ? 'Admin' : 'Support'
  const nameWithRole = `${toProperCase(userName)} (${roleLabel})`

  // ── Notification helper ─────────────────────────────────────────────────
  const createNotification = async (
    targetUserId: string,
    type: 'assignment' | 'mention' | 'priority' | 'reply',
    title: string,
    body: string,
    inboxMessageId: string,
  ) => {
    if (targetUserId === userId) return
    await supabase.from('notifications').insert({
      user_id: targetUserId,
      type,
      title,
      body,
      link: `/inbox?chat=${inboxMessageId}`,
      inbox_message_id: inboxMessageId,
    })
  }

  // ── Assign ──────────────────────────────────────────────────────────────
  const handleAssign = async (msgId: string, assigneeId: string | null) => {
    const msg = messages.find(m => m.id === msgId)
    if (!msg) return
    const assignee = assigneeId ? teamMembers.find(t => t.id === assigneeId) : null
    const { error } = await supabase
      .from('inbox_messages')
      .update({
        assigned_to: assigneeId,
        assigned_to_name: assignee?.display_name || null,
      })
      .eq('id', msgId)

    if (!error) {
      setMessages(prev => prev.map(m => m.id === msgId ? {
        ...m,
        assigned_to: assigneeId,
        assigned_to_name: assignee?.display_name || null,
      } : m))
      setAssignDropdownFor(null)

      if (assigneeId && assignee) {
        await createNotification(
          assigneeId,
          'assignment',
          'Assigned to you',
          `${msg.ticket_ref} — ${msg.clinic_name}`,
          msgId,
        )
        toast(`Assigned to ${toProperCase(assignee.display_name)}`)
      } else {
        toast('Assignment removed')
      }
    }
  }

  // ── Priority ────────────────────────────────────────────────────────────
  const handleTogglePriority = async (msgId: string) => {
    const msg = messages.find(m => m.id === msgId)
    if (!msg) return
    const newPriority = msg.priority === 'high' ? 'normal' : 'high'
    const { error } = await supabase
      .from('inbox_messages')
      .update({ priority: newPriority })
      .eq('id', msgId)

    if (!error) {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, priority: newPriority } : m))
      if (newPriority === 'high' && msg.assigned_to) {
        await createNotification(
          msg.assigned_to,
          'priority',
          'Marked as High Priority',
          `${msg.ticket_ref} — ${msg.clinic_name}`,
          msgId,
        )
      }
      toast(newPriority === 'high' ? 'Marked as high priority' : 'Priority set to normal')
    }
  }

  // ── Chat ────────────────────────────────────────────────────────────────
  const openChat = async (msgId: string) => {
    setChatOpenFor(msgId)
    setLoadingChat(true)
    setChatText('')
    setChatReplies([])
    setMentionQuery(null)
    const { data } = await supabase
      .from('inbox_replies')
      .select('*')
      .eq('inbox_message_id', msgId)
      .order('created_at', { ascending: true })
    if (data) setChatReplies(data as InboxReply[])
    setLoadingChat(false)
  }

  const closeChat = () => {
    setChatOpenFor(null)
    setChatReplies([])
    setChatText('')
    setMentionQuery(null)
  }

  const chatMessage = chatOpenFor ? messages.find(m => m.id === chatOpenFor) : null

  // @mention autocomplete logic
  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return []
    const q = mentionQuery.toLowerCase()
    return teamMembers.filter(t =>
      t.display_name.toLowerCase().includes(q) && t.id !== userId
    ).slice(0, 5)
  }, [mentionQuery, teamMembers, userId])

  const handleChatTextChange = (val: string) => {
    setChatText(val)
    const cursorPos = chatInputRef.current?.selectionStart ?? val.length
    const textUpToCursor = val.slice(0, cursorPos)
    const atMatch = textUpToCursor.match(/@(\w*)$/)
    if (atMatch) {
      setMentionQuery(atMatch[1])
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
    }
  }

  const insertMention = (member: Pick<Profile, 'id' | 'display_name'>) => {
    const cursorPos = chatInputRef.current?.selectionStart ?? chatText.length
    const textUpToCursor = chatText.slice(0, cursorPos)
    const atIdx = textUpToCursor.lastIndexOf('@')
    const before = chatText.slice(0, atIdx)
    const after = chatText.slice(cursorPos)
    const newText = `${before}@${member.display_name} ${after}`
    setChatText(newText)
    setMentionQuery(null)
    chatInputRef.current?.focus()
  }

  const extractMentions = (text: string): string[] => {
    const mentioned: string[] = []
    for (const member of teamMembers) {
      if (text.includes(`@${member.display_name}`)) {
        mentioned.push(member.id)
      }
    }
    return mentioned
  }

  const handleSendReply = async (msgId: string) => {
    if (!chatText.trim()) return
    setSaving(true)
    const msg = messages.find(m => m.id === msgId)
    const { data, error } = await supabase
      .from('inbox_replies')
      .insert({
        inbox_message_id: msgId,
        message: chatText.trim(),
        sent_by: userId,
        sent_by_name: nameWithRole,
      })
      .select()
      .single()

    if (!error && data) {
      setChatReplies(prev => {
        if (prev.some(r => r.id === data.id)) return prev
        return [...prev, data as InboxReply]
      })
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, reply_count: (m.reply_count || 0) + 1 } : m
      ))

      // Notify ticket creator of reply
      if (msg) {
        await createNotification(
          msg.sent_by,
          'reply',
          `${toProperCase(userName)} replied`,
          `${msg.ticket_ref} — ${chatText.trim().slice(0, 80)}`,
          msgId,
        )

        // Send notifications for @mentions
        const mentionedIds = extractMentions(chatText)
        for (const mentionedId of mentionedIds) {
          if (mentionedId === msg.sent_by) continue
          await createNotification(
            mentionedId,
            'mention',
            `${toProperCase(userName)} mentioned you`,
            `${msg.ticket_ref} — ${chatText.trim().slice(0, 80)}`,
            msgId,
          )
        }
      }

      setChatText('')
      setMentionQuery(null)
      toast('Reply sent')
    } else {
      toast('Failed to send reply', 'error')
    }
    setSaving(false)
  }

  // ── Mark done / reopen ──────────────────────────────────────────────────
  const handleMarkDone = async (msgId: string) => {
    const msg = messages.find(m => m.id === msgId)
    const doneAt = new Date().toISOString()
    const { error } = await supabase
      .from('inbox_messages')
      .update({
        status: 'done',
        done_by: userId,
        done_by_name: nameWithRole,
        done_at: doneAt,
      })
      .eq('id', msgId)

    if (!error) {
      setMessages(prev => prev.map(m => m.id === msgId ? {
        ...m,
        status: 'done' as const,
        done_by: userId,
        done_by_name: nameWithRole,
        done_at: doneAt,
      } : m))
      if (msg) {
        await supabase
          .from('tickets')
          .update({
            status: 'Resolved',
            need_team_check: false,
            last_updated_by: userId,
            last_updated_by_name: nameWithRole,
            last_change_note: 'Resolved via Inbox',
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', msg.ticket_id)
      }
      toast('Marked as done & ticket resolved')
    }
  }

  const handleReopen = async (msgId: string) => {
    const msg = messages.find(m => m.id === msgId)
    const { error } = await supabase
      .from('inbox_messages')
      .update({
        status: 'open',
        done_by: null,
        done_by_name: null,
        done_at: null,
      })
      .eq('id', msgId)

    if (!error) {
      setMessages(prev => prev.map(m => m.id === msgId ? {
        ...m,
        status: 'open' as const,
        done_by: null,
        done_by_name: null,
        done_at: null,
      } : m))
      if (msg) {
        await supabase
          .from('tickets')
          .update({
            status: 'Escalated to Admin',
            last_updated_by: userId,
            last_updated_by_name: nameWithRole,
            last_change_note: 'Reopened via Inbox',
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', msg.ticket_id)
      }
      toast('Reopened & ticket re-escalated')
    }
  }

  // ── Delete / Archive (admin only) ───────────────────────────────────────
  const isAdmin = userRole === 'administrator' || userRole === 'admin'

  const handleDelete = async (msgId: string) => {
    const { error } = await supabase
      .from('inbox_messages')
      .delete()
      .eq('id', msgId)

    if (!error) {
      setMessages(prev => prev.filter(m => m.id !== msgId))
      if (chatOpenFor === msgId) closeChat()
      toast('Message deleted')
    } else {
      toast('Failed to delete', 'error')
    }
    setTrashDropdownFor(null)
  }

  const handleArchiveNow = async (msgId: string) => {
    const archiveDate = new Date()
    archiveDate.setDate(archiveDate.getDate() - (ARCHIVE_DAYS + 1))
    const { error } = await supabase
      .from('inbox_messages')
      .update({
        status: 'done',
        done_by: userId,
        done_by_name: nameWithRole,
        done_at: archiveDate.toISOString(),
      })
      .eq('id', msgId)

    if (!error) {
      setMessages(prev => prev.map(m => m.id === msgId ? {
        ...m,
        status: 'done' as const,
        done_by: userId,
        done_by_name: nameWithRole,
        done_at: archiveDate.toISOString(),
      } : m))
      if (chatOpenFor === msgId) closeChat()
      toast('Moved to archive')
    } else {
      toast('Failed to archive', 'error')
    }
    setTrashDropdownFor(null)
  }

  // ── Filters ─────────────────────────────────────────────────────────────
  const isUnread = (msg: InboxMessage) => {
    if (!lastReadAt) return false
    return new Date(msg.created_at) > new Date(lastReadAt)
  }

  const isNeedsAttention = (msg: InboxMessage) => msg.message.startsWith('[Needs Attention]')

  const archiveCutoff = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - ARCHIVE_DAYS)
    return d
  }, [])

  const isArchived = (msg: InboxMessage) =>
    msg.status === 'done' && msg.done_at && new Date(msg.done_at) < archiveCutoff

  const activeMessages = useMemo(() => messages.filter(m => !isArchived(m)), [messages, archiveCutoff])
  const archivedMessages = useMemo(() => messages.filter(m => isArchived(m)), [messages, archiveCutoff])

  const tabFiltered = useMemo(() => {
    if (tab === 'archive') return archivedMessages
    const source = activeMessages
    if (tab === 'open') return source.filter(m => m.status === 'open')
    if (tab === 'done') return source.filter(m => m.status === 'done')
    if (tab === 'mine') return source.filter(m => m.assigned_to === userId)
    return source
  }, [tab, activeMessages, archivedMessages, userId])

  const filtered = useMemo(() => {
    let list = tabFiltered

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        m.ticket_ref?.toLowerCase().includes(q) ||
        m.clinic_name?.toLowerCase().includes(q) ||
        m.message?.toLowerCase().includes(q) ||
        m.sent_by_name?.toLowerCase().includes(q) ||
        m.assigned_to_name?.toLowerCase().includes(q)
      )
    }

    if (dateFrom) {
      const from = new Date(dateFrom)
      from.setHours(0, 0, 0, 0)
      list = list.filter(m => new Date(m.created_at) >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      list = list.filter(m => new Date(m.created_at) <= to)
    }

    return list
  }, [tabFiltered, search, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => { setPage(1) }, [tab, search, dateFrom, dateTo])

  const openCount = activeMessages.filter(m => m.status === 'open').length
  const doneCount = activeMessages.filter(m => m.status === 'done').length
  const mineCount = activeMessages.filter(m => m.assigned_to === userId).length
  const unreadCount = activeMessages.filter(isUnread).length

  // ── Render helpers ──────────────────────────────────────────────────────

  const renderMentionText = (text: string) => {
    const parts = text.split(/(@\w[\w\s]*?)(?=\s@|\s[^@]|$)/)
    return parts.map((part, i) => {
      const memberMatch = teamMembers.find(t => part === `@${t.display_name}`)
      if (memberMatch) {
        return <span key={i} className="text-indigo-400 font-medium">{part}</span>
      }
      return <span key={i}>{part}</span>
    })
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="h-8 w-32 skeleton rounded mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 skeleton rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-bold text-text-primary">Inbox</h1>
        {unreadCount > 0 && (
          <span className="px-2 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-400 rounded-full">
            {unreadCount} new
          </span>
        )}
        {openCount > 0 && (
          <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full">
            {openCount} open
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {([
          { key: 'all' as const, label: `All (${activeMessages.length})`, color: 'purple' },
          { key: 'open' as const, label: `Open (${openCount})`, color: 'amber' },
          { key: 'mine' as const, label: `Mine (${mineCount})`, color: 'indigo' },
          { key: 'done' as const, label: `Done (${doneCount})`, color: 'green' },
          { key: 'archive' as const, label: `Archive (${archivedMessages.length})`, color: 'zinc' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t.key
                ? t.color === 'purple' ? 'bg-purple-500/20 text-purple-400'
                  : t.color === 'amber' ? 'bg-amber-500/20 text-amber-400'
                  : t.color === 'indigo' ? 'bg-indigo-500/20 text-indigo-400'
                  : t.color === 'green' ? 'bg-green-500/20 text-green-400'
                  : 'bg-zinc-500/20 text-zinc-400'
                : 'bg-surface-raised text-text-tertiary hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search + Date filter */}
      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ticket, clinic, message, assignee..."
            className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary
                       placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary p-1"
            >
              <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-2.5 py-2 bg-surface border border-border rounded-lg text-xs text-text-secondary
                       focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-2.5 py-2 bg-surface border border-border rounded-lg text-xs text-text-secondary
                       focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="px-2 py-2 text-xs text-text-tertiary hover:text-text-primary"
              title="Clear dates"
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {(search || dateFrom || dateTo) && (
        <p className="text-xs text-text-tertiary mb-3">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} found
        </p>
      )}

      {paged.length === 0 ? (
        <EmptyState
          icon={
            <svg className="size-8 text-text-muted" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          }
          title={
            search || dateFrom || dateTo
              ? 'No matching messages'
              : tab === 'archive' ? 'No archived messages'
              : tab === 'mine' ? 'Nothing assigned to you'
              : tab === 'open' ? 'No open messages'
              : tab === 'done' ? 'No completed messages'
              : 'No messages yet'
          }
          description={
            tab === 'all' && !search && !dateFrom && !dateTo
              ? 'Messages will appear here when tickets are escalated or flagged.'
              : tab === 'archive'
              ? 'Done messages older than 30 days will appear here.'
              : undefined
          }
        />
      ) : (
        <>
          <div className="space-y-2">
            {paged.map((msg) => {
              const unread = isUnread(msg)
              const isDone = msg.status === 'done'
              const hasReplies = (msg.reply_count || 0) > 0
              const attention = isNeedsAttention(msg)
              const isHigh = msg.priority === 'high'
              return (
                <div
                  key={msg.id}
                  className={`relative p-4 rounded-lg border transition-colors ${
                    isHigh && !isDone
                      ? 'border-l-4 border-l-red-500 border-t-border border-r-border border-b-border bg-red-500/5'
                      : isDone
                        ? 'border-border bg-surface opacity-75'
                        : unread
                          ? attention
                            ? 'border-l-4 border-l-amber-500 border-t-border border-r-border border-b-border bg-amber-500/5'
                            : 'border-l-4 border-l-purple-500 border-t-border border-r-border border-b-border bg-purple-500/5'
                          : 'border-border bg-surface'
                  }`}
                >
                  {/* Top-right badges */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    {isDone && (
                      <>
                        {(msg.done_by_name || msg.done_at) && (
                          <span
                            className="text-[10px] text-text-tertiary"
                            title={msg.done_at ? `Marked done at ${format(new Date(msg.done_at), 'd MMM yyyy, h:mm a')}` : undefined}
                          >
                            by <span className="text-text-secondary font-medium">{msg.done_by_name ? toProperCase(msg.done_by_name) : 'unknown'}</span>
                            {msg.done_at && <> · {formatDistanceToNow(new Date(msg.done_at), { addSuffix: true })}</>}
                          </span>
                        )}
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-green-500/20 text-green-400 rounded">
                          Done
                        </span>
                      </>
                    )}
                    {isHigh && !isDone && (
                      <span className="px-2 py-0.5 text-[10px] font-semibold bg-red-500/20 text-red-400 rounded animate-pulse">
                        HIGH
                      </span>
                    )}
                  </div>

                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-text-primary">
                          {toProperCase(msg.sent_by_name)}
                        </span>
                        <span className="text-xs text-text-tertiary">
                          {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                        </span>
                        {!isDone && unread && (
                          <span className={`size-2 rounded-full flex-shrink-0 ${attention ? 'bg-amber-400' : 'bg-purple-400'}`} />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          attention
                            ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-purple-500/15 text-purple-400'
                        }`}>
                          {attention ? 'Needs Attention' : 'Escalation'}
                        </span>
                        <button
                          onClick={() => router.push(`/tickets/${msg.ticket_id}`)}
                          className={`text-xs font-mono px-1.5 py-0.5 rounded transition-colors ${
                            attention
                              ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                              : 'text-purple-400 bg-purple-500/10 hover:bg-purple-500/20'
                          }`}
                        >
                          {msg.ticket_ref}
                        </button>
                        <span className="text-xs text-text-secondary truncate">
                          {msg.clinic_name}
                        </span>
                        {msg.assigned_to_name && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 font-medium">
                            {toProperCase(msg.assigned_to_name)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-text-secondary">
                        {attention ? msg.message.replace('[Needs Attention] ', '') : msg.message}
                      </p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => router.push(`/tickets/${msg.ticket_id}`)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-raised border border-border text-text-secondary hover:text-text-primary hover:border-zinc-500/30 transition-colors"
                    >
                      View Ticket
                    </button>
                    <button
                      onClick={() => openChat(msg.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        attention
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                          : 'bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/20'
                      }`}
                    >
                      {hasReplies ? `Chat (${msg.reply_count})` : 'Reply'}
                    </button>

                    {/* Assign dropdown */}
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setAssignDropdownFor(assignDropdownFor === msg.id ? null : msg.id) }}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                      >
                        {msg.assigned_to_name ? `Assigned to ${toProperCase(msg.assigned_to_name)}` : 'Assign'}
                      </button>
                      {assignDropdownFor === msg.id && (
                        <div
                          className="absolute z-50 left-0 top-full mt-1 w-48 bg-surface border border-border rounded-lg shadow-xl overflow-hidden"
                          onClick={e => e.stopPropagation()}
                        >
                          {msg.assigned_to && (
                            <button
                              onClick={() => handleAssign(msg.id, null)}
                              className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors border-b border-border"
                            >
                              Remove assignment
                            </button>
                          )}
                          {teamMembers.map(member => (
                            <button
                              key={member.id}
                              onClick={() => handleAssign(msg.id, member.id)}
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-surface-raised transition-colors ${
                                msg.assigned_to === member.id
                                  ? 'text-indigo-400 bg-indigo-500/10'
                                  : 'text-text-secondary'
                              }`}
                            >
                              {toProperCase(member.display_name)}
                              {member.id === userId && <span className="text-text-muted ml-1">(you)</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Priority toggle */}
                    <button
                      onClick={() => handleTogglePriority(msg.id)}
                      title={isHigh ? 'Set to normal priority' : 'Set to high priority'}
                      className={`px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        isHigh
                          ? 'bg-red-500/15 border-red-500/25 text-red-400 hover:bg-red-500/25'
                          : 'bg-surface-raised border-border text-text-tertiary hover:text-red-400 hover:border-red-500/20'
                      }`}
                    >
                      <svg className="size-3.5" fill={isHigh ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18m0-18l9 4.5L21 3v12l-9 4.5L3 15" />
                      </svg>
                    </button>

                    {isDone ? (
                      <button
                        onClick={() => handleReopen(msg.id)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors"
                      >
                        Reopen
                      </button>
                    ) : (
                      <button
                        onClick={() => handleMarkDone(msg.id)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors"
                      >
                        Mark Done
                      </button>
                    )}

                    {isAdmin && (
                      <div className="relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setTrashDropdownFor(trashDropdownFor === msg.id ? null : msg.id) }}
                          title="Delete or archive"
                          className={`px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            trashDropdownFor === msg.id
                              ? 'bg-red-500/10 border-red-500/20 text-red-400'
                              : 'bg-surface-raised border-border text-text-tertiary hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/10'
                          }`}
                        >
                          <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        {trashDropdownFor === msg.id && (
                          <div
                            className="absolute z-50 right-0 top-full mt-1 w-40 bg-surface border border-border rounded-lg shadow-xl overflow-hidden"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              onClick={() => handleArchiveNow(msg.id)}
                              className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-surface-raised transition-colors flex items-center gap-2"
                            >
                              <svg className="size-3.5 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                              </svg>
                              Archive
                            </button>
                            <button
                              onClick={() => handleDelete(msg.id)}
                              className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors border-t border-border flex items-center gap-2"
                            >
                              <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <span className="ml-auto text-[11px] text-text-muted">
                      {format(new Date(msg.created_at), 'dd MMM yyyy, h:mm a')}
                    </span>
                  </div>

                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-5">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="px-2 py-1.5 text-xs font-medium rounded-lg bg-surface-raised border border-border
                           text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                &laquo;
              </button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-surface-raised border border-border
                           text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                &lsaquo; Prev
              </button>
              <span className="px-3 py-1.5 text-xs text-text-secondary">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-surface-raised border border-border
                           text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                Next &rsaquo;
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="px-2 py-1.5 text-xs font-medium rounded-lg bg-surface-raised border border-border
                           text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                &raquo;
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Chat Panel ─────────────────────────────────────────────────── */}
      <SlidePanel
        open={!!chatOpenFor}
        onClose={closeChat}
        title={chatMessage ? `${chatMessage.ticket_ref} — ${chatMessage.clinic_name}` : 'Chat'}
      >
        {chatMessage && (
          <div className="flex flex-col h-full -mx-4 -mb-4">
            <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-3">
              {/* Original message */}
              {chatMessage.sent_by === userId ? (
                <div className="flex justify-end">
                  <div className="max-w-[80%]">
                    <div className="flex items-center gap-2 mb-0.5 justify-end">
                      <span className="text-[10px] text-text-muted">
                        {format(new Date(chatMessage.created_at), 'dd MMM, h:mm a')}
                      </span>
                      <span className="text-xs font-medium text-purple-400">You</span>
                    </div>
                    <div className="bg-purple-500/15 rounded-2xl rounded-tr-sm px-3 py-2">
                      <p className="text-sm text-text-primary">{chatMessage.message}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex justify-start">
                  <div className="max-w-[80%]">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-purple-400">
                        {toProperCase(chatMessage.sent_by_name)}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        {format(new Date(chatMessage.created_at), 'dd MMM, h:mm a')}
                      </span>
                    </div>
                    <div className="bg-surface-raised rounded-2xl rounded-tl-sm px-3 py-2">
                      <p className="text-sm text-text-primary">{chatMessage.message}</p>
                    </div>
                  </div>
                </div>
              )}

              {(chatReplies.length > 0 || loadingChat) && (
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] text-text-muted uppercase">Replies</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}

              {loadingChat ? (
                <div className="space-y-3">
                  <div className="h-12 skeleton rounded" />
                  <div className="h-12 skeleton rounded" />
                </div>
              ) : (
                chatReplies.map((reply) => {
                  const isMe = reply.sent_by === userId
                  return isMe ? (
                    <div key={reply.id} className="flex justify-end">
                      <div className="max-w-[80%]">
                        <div className="flex items-center gap-2 mb-0.5 justify-end">
                          <span className="text-[10px] text-text-muted">
                            {format(new Date(reply.created_at), 'dd MMM, h:mm a')}
                          </span>
                          <span className="text-xs font-medium text-green-400">You</span>
                        </div>
                        <div className="bg-green-500/15 rounded-2xl rounded-tr-sm px-3 py-2">
                          <p className="text-sm text-text-primary">{renderMentionText(reply.message)}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div key={reply.id} className="flex justify-start">
                      <div className="max-w-[80%]">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-green-400">
                            {reply.sent_by_name}
                          </span>
                          <span className="text-[10px] text-text-muted">
                            {format(new Date(reply.created_at), 'dd MMM, h:mm a')}
                          </span>
                        </div>
                        <div className="bg-surface-raised rounded-2xl rounded-tl-sm px-3 py-2">
                          <p className="text-sm text-text-primary">{renderMentionText(reply.message)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Reply input with @mention autocomplete */}
            <div className="border-t border-border px-4 py-3">
              <div className="relative">
                {/* @mention dropdown */}
                {mentionQuery !== null && mentionMatches.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 w-full bg-surface border border-border rounded-lg shadow-xl overflow-hidden z-10">
                    {mentionMatches.map((member, i) => (
                      <button
                        key={member.id}
                        onMouseDown={(e) => { e.preventDefault(); insertMention(member) }}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                          i === mentionIndex
                            ? 'bg-indigo-500/15 text-indigo-400'
                            : 'text-text-secondary hover:bg-surface-raised'
                        }`}
                      >
                        <span className="text-indigo-400 mr-1">@</span>
                        {toProperCase(member.display_name)}
                      </button>
                    ))}
                    <div className="px-3 py-1.5 border-t border-border">
                      <span className="text-[10px] text-text-muted">Type @ to mention someone</span>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={chatInputRef}
                    value={chatText}
                    onChange={(e) => handleChatTextChange(e.target.value)}
                    placeholder="Type a reply... Use @ to mention"
                    className="flex-1 px-3 py-2 bg-surface-inset border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                    onKeyDown={(e) => {
                      if (mentionQuery !== null && mentionMatches.length > 0) {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault()
                          setMentionIndex(i => Math.min(mentionMatches.length - 1, i + 1))
                          return
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault()
                          setMentionIndex(i => Math.max(0, i - 1))
                          return
                        }
                        if (e.key === 'Tab' || e.key === 'Enter') {
                          e.preventDefault()
                          insertMention(mentionMatches[mentionIndex])
                          return
                        }
                        if (e.key === 'Escape') {
                          setMentionQuery(null)
                          return
                        }
                      }
                      if (e.key === 'Enter' && !e.shiftKey && chatText.trim()) {
                        e.preventDefault()
                        handleSendReply(chatOpenFor!)
                      }
                    }}
                    autoFocus
                  />
                  <button
                    onClick={() => handleSendReply(chatOpenFor!)}
                    disabled={!chatText.trim() || saving}
                    className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg text-sm font-medium hover:bg-purple-500/30 transition-colors disabled:opacity-40"
                  >
                    {saving ? '...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </SlidePanel>
    </div>
  )
}
