import { RECORD_TYPE_LABELS } from '@/lib/constants'
import type { RecordType } from '@/lib/types'
import Badge from '@/components/ui/Badge'

// WHY: Label-only badge — neutral styling since record type is not a scanning signal.
// Color is reserved for Status and Issue Type badges.
export default function RecordTypeBadge({ recordType }: { recordType: RecordType }) {
  return (
    <Badge bg="bg-zinc-500/10" text="text-text-tertiary">
      {RECORD_TYPE_LABELS[recordType]}
    </Badge>
  )
}
