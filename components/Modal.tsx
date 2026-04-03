'use client'

import { useEffect, useRef } from 'react'

// Reusable overlay + panel primitives.
// SlidePanel: slides in from right — used for filters, settings.
// ModalDialog: centered — used for previews, confirmations.

interface BaseProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
}

function Overlay({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/60 transition-opacity duration-200"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      {children}
    </div>
  )
}

export function SlidePanel({ open, onClose, title, children }: BaseProps) {
  return (
    <Overlay open={open} onClose={onClose}>
      <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-surface border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          {title && <h3 className="font-semibold text-white">{title}</h3>}
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-1 -mr-1 ml-auto" aria-label="Close">
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </Overlay>
  )
}

const MODAL_SIZES = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const

export function ModalDialog({ open, onClose, title, children, size = 'md' }: BaseProps & { size?: keyof typeof MODAL_SIZES }) {
  return (
    <Overlay open={open} onClose={onClose}>
      <div className="flex items-end sm:items-center justify-center min-h-full p-2 sm:p-4">
        <div className={`bg-surface border border-border rounded-xl w-full ${MODAL_SIZES[size]} max-h-[85vh] flex flex-col shadow-2xl`}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            {title && <h3 className="font-semibold text-white">{title}</h3>}
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-1 -mr-1 ml-auto" aria-label="Close">
              <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    </Overlay>
  )
}
