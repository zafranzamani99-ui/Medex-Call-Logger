import { RENEWAL_COLORS } from '@/lib/constants'

function computeStatus(mtnExpiry: string | null | undefined, fallback: string | null): string | null {
  if (!mtnExpiry) return fallback
  const exp = new Date(mtnExpiry)
  exp.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((exp.getTime() - today.getTime()) / 86400000)
  if (diffDays < -180) return 'LONG EXPIRED'
  if (diffDays < 0) return 'EXPIRED'
  if (diffDays <= 30) return 'EXPIRING'
  return 'VALID MN'
}

export default function RenewalBadge({ status, mtnExpiry }: { status: string | null; mtnExpiry?: string | null }) {
  const resolved = computeStatus(mtnExpiry, status)
  if (!resolved) return null

  const colors = RENEWAL_COLORS[resolved] || { bg: 'bg-gray-500/20', text: 'text-gray-400' }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
      {resolved}
    </span>
  )
}
