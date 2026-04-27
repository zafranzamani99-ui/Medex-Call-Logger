'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { format, formatDistanceToNow } from 'date-fns'
import type { InboxMessage, InboxReply } from '@/lib/types'
import { toProperCase } from '@/lib/constants'
import EmptyState from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { SlidePanel } from '@/components/Modal'

// WHY: Shared inbox for "Escalated to Admin" messages.
// All agents can see all messages. Read tracking is per-user (timestamp-based).
// Replies are stored in inbox_replies table (append-only chat thread).

export default function InboxPage() {
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()

  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [lastReadAt, setLastReadAt] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')
  const [userId, setUserId] = useState('')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all')

  // Chat thread state
  const [chatOpenFor, setChatOpenFor] = useState<string | null>(null)
  const [chatReplies, setChatReplies] = useState<InboxReply[]>([])
  const [chatText, setChatText] = useState('')
  const [loadingChat, setLoadingChat] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatOpenForRef = useRef<string | null>(null)

  // Keep ref in sync so real-time handler can read current value
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

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, role')
        .eq('id', uid)
        .single()
      if (profile) {
        setUserName(profile.display_name)
        setUserRole(profile.role)
      }

      // Fetch user's last read timestamp BEFORE marking as read
      const { data: readStatus } = await supabase
        .from('inbox_read_status')
        .select('last_read_at')
        .eq('user_id', uid)
        .maybeSingle()

      setLastReadAt(readStatus?.last_read_at || '1970-01-01T00:00:00Z')

      await fetchMessages()
      setLoading(false)

      // Mark all as read (upsert last_read_at to now)
      await supabase.from('inbox_read_status').upsert({
        user_id: uid,
        last_read_at: new Date().toISOString(),
      })
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Real-time subscription for messages + replies
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
          // If chat for this message is open, append reply (deduplicate)
          if (chatOpenForRef.current === newReply.inbox_message_id) {
            setChatReplies(prev => {
              if (prev.some(r => r.id === newReply.id)) return prev
              return [...prev, newReply]
            })
          }
          // Update reply_count in list
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

  // Auto-scroll chat to bottom when replies change
  useEffect(() => {
    if (chatOpenFor && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatReplies, chatOpenFor])

  const roleLabel = userRole === 'admin' ? 'Admin' : 'Support'
  const nameWithRole = `${toProperCase(userName)} (${roleLabel})`

  const openChat = async (msgId: string) => {
    setChatOpenFor(msgId)
    setLoadingChat(true)
    setChatText('')
    setChatReplies([])
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
  }

  // The message currently open in the chat panel
  const chatMessage = chatOpenFor ? messages.find(m => m.id === chatOpenFor) : null

  const handleSendReply = async (msgId: string) => {
    if (!chatText.trim()) return
    setSaving(true)
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
      // Optimistic: append locally (real-time will deduplicate)
      setChatReplies(prev => {
        if (prev.some(r => r.id === data.id)) return prev
        return [...prev, data as InboxReply]
      })
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, reply_count: (m.reply_count || 0) + 1 } : m
      ))
      setChatText('')
      toast('Reply sent')
    } else {
      toast('Failed to send reply', 'error')
    }
    setSaving(false)
  }

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
      // Also resolve the linked ticket
      if (msg) {
        await supabase
          .from('tickets')
          .update({
            status: 'Resolved',
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
      // Revert ticket back to Escalated to Admin
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

  const isUnread = (msg: InboxMessage) => {
    if (!lastReadAt) return false
    return new Date(msg.created_at) > new Date(lastReadAt)
  }

  const filtered = filter === 'all' ? messages : messages.filter(m => m.status === filter)
  const openCount = messages.filter(m => m.status === 'open').length
  const unreadCount = messages.filter(isUnread).length

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

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-5">
        {(['all', 'open', 'done'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? f === 'open' ? 'bg-amber-500/20 text-amber-400' : f === 'done' ? 'bg-green-500/20 text-green-400' : 'bg-purple-500/20 text-purple-400'
                : 'bg-surface-raised text-text-tertiary hover:text-text-primary'
            }`}
          >
            {f === 'all' ? `All (${messages.length})` : f === 'open' ? `Open (${openCount})` : `Done (${messages.length - openCount})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={
            <svg className="size-8 text-text-muted" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          }
          title={filter === 'all' ? 'No messages yet' : filter === 'open' ? 'No open messages' : 'No completed messages'}
          description={filter === 'all' ? 'Messages will appear here when tickets are escalated to admin.' : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((msg) => {
            const unread = isUnread(msg)
            const isDone = msg.status === 'done'
            const hasReplies = (msg.reply_count || 0) > 0
            return (
              <div
                key={msg.id}
                className={`relative p-4 rounded-lg border transition-colors ${
                  isDone
                    ? 'border-border bg-surface opacity-75'
                    : unread
                      ? 'border-l-4 border-l-purple-500 border-t-border border-r-border border-b-border bg-purple-500/5'
                      : 'border-border bg-surface'
                }`}
              >
                {/* Done badge — top right, with attribution */}
                {isDone && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
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
                  </div>
                )}

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
                        <span className="size-2 rounded-full bg-purple-400 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => router.push(`/tickets/${msg.ticket_id}`)}
                        className="text-xs font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded hover:bg-purple-500/20 transition-colors"
                      >
                        {msg.ticket_ref}
                      </button>
                      <span className="text-xs text-text-secondary truncate">
                        {msg.clinic_name}
                      </span>
                    </div>
                    <p className="text-sm text-text-secondary">
                      {msg.message}
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
                  {/* Chat / Reply button */}
                  <button
                    onClick={() => openChat(msg.id)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-colors"
                  >
                    {hasReplies ? `Chat (${msg.reply_count})` : 'Reply'}
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
                  <span className="ml-auto text-[11px] text-text-muted">
                    {format(new Date(msg.created_at), 'dd MMM yyyy, h:mm a')}
                  </span>
                </div>

              </div>
            )
          })}
        </div>
      )}

      {/* Floating chat panel */}
      <SlidePanel
        open={!!chatOpenFor}
        onClose={closeChat}
        title={chatMessage ? `${chatMessage.ticket_ref} — ${chatMessage.clinic_name}` : 'Chat'}
      >
        {chatMessage && (
          <div className="flex flex-col h-full -mx-4 -mb-4">
            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-3">
              {/* Original escalation message */}
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

              {/* Divider */}
              {(chatReplies.length > 0 || loadingChat) && (
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] text-text-muted uppercase">Replies</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}

              {/* Replies */}
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
                          <p className="text-sm text-text-primary">{reply.message}</p>
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
                          <p className="text-sm text-text-primary">{reply.message}</p>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Reply input — pinned at bottom */}
            <div className="border-t border-border px-4 py-3 flex gap-2">
              <input
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                placeholder="Type a reply..."
                className="flex-1 px-3 py-2 bg-surface-inset border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                onKeyDown={(e) => {
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
        )}
      </SlidePanel>
    </div>
  )
}
