'use client'

import { createContext, useContext, useState, useCallback, useRef } from 'react'

// WHY: Context-based toast system replaces manual inline success/error messages.
// Any page can call toast('message', 'success') without managing local state.
// Auto-dismisses: 3s for success/info, 5s for errors.

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = String(++counter.current)
    setToasts(prev => [...prev, { id, type, message }])

    const duration = type === 'error' ? 5000 : 3000
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Fixed top-right toast stack */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
          {toasts.map(t => (
            <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <svg className="size-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="size-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="size-4 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
}

const TOAST_BORDER: Record<ToastType, string> = {
  success: 'border-green-500/30',
  error: 'border-red-500/30',
  info: 'border-border',
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      className={`pointer-events-auto bg-surface border ${TOAST_BORDER[toast.type]} rounded-lg px-4 py-3 text-sm text-text-primary shadow-lg toast-enter flex items-center gap-2 max-w-sm`}
      role="alert"
    >
      {TOAST_ICONS[toast.type]}
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={onDismiss}
        className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0 p-0.5"
        aria-label="Dismiss"
      >
        <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
