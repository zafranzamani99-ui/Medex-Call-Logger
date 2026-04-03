import { RECORD_TYPE_COLORS, RECORD_TYPE_LABELS } from '@/lib/constants'
import type { RecordType } from '@/lib/types'
import Badge from '@/components/ui/Badge'

// WHY: Visual indicator to distinguish call logs from tickets at a glance.
// Cyan for calls (routine), violet for tickets (needs attention).
export default function RecordTypeBadge({ recordType }: { recordType: RecordType }) {
  const colors = RECORD_TYPE_COLORS[recordType] || { bg: 'bg-gray-500/20', text: 'text-gray-400' }

  return (
    <Badge bg={colors.bg} text={colors.text}>
      {RECORD_TYPE_LABELS[recordType]}
    </Badge>
  )
}
