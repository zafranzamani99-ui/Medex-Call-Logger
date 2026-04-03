import { RENEWAL_COLORS } from '@/lib/constants'

// WHY: Colour-coded renewal status badge — VALID MN (green), EXPIRING (amber), EXPIRED (red).
// Shown in clinic search dropdown and on ticket detail to give agents instant
// visibility into whether the clinic's maintenance is current.
export default function RenewalBadge({ status }: { status: string | null }) {
  if (!status) return null

  const colors = RENEWAL_COLORS[status] || { bg: 'bg-gray-500/20', text: 'text-gray-400' }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
      {status}
    </span>
  )
}
