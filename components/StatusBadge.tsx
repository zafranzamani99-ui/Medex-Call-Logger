import { STATUS_COLORS } from '@/lib/constants'
import type { TicketStatus } from '@/lib/types'
import Badge from '@/components/ui/Badge'

// WHY: Colour-coded status badge used in History table, Dashboard, Ticket Detail.
// Colours from spec Section 13.2 — each status has a distinct colour so agents
// can scan the ticket list at a glance without reading text.
export default function StatusBadge({ status }: { status: TicketStatus }) {
  const colors = STATUS_COLORS[status] || { bg: 'bg-gray-500/20', text: 'text-gray-400' }

  return (
    <Badge bg={colors.bg} text={colors.text}>
      {status}
    </Badge>
  )
}
