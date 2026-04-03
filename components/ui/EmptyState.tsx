// WHY: Reusable empty state replacing 7+ inline empty states across pages.
// Uses clean SVG icons instead of emojis for professional look.

import { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

// Pre-built icon set for common empty states
export const EmptyIcons = {
  phone: (
    <svg className="size-8 text-text-muted" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  ),
  search: (
    <svg className="size-8 text-text-muted" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  ),
  key: (
    <svg className="size-8 text-text-muted" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  ),
  clipboard: (
    <svg className="size-8 text-text-muted" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.251 2.251 0 011.65.828m-5.8 0c-.376.023-.75.05-1.124.08C8.845 4.01 8 4.973 8 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
    </svg>
  ),
  checkCircle: (
    <svg className="size-8 text-text-muted" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
} as const

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="bg-surface border border-border rounded-lg p-8 text-center">
      <div className="flex justify-center mb-3">{icon}</div>
      <p className="text-text-secondary text-sm font-medium text-pretty">{title}</p>
      {description && (
        <p className="text-text-tertiary text-xs mt-1 text-pretty">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 text-sm text-accent hover:text-accent-hover transition-colors font-medium"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
