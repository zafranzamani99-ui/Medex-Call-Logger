// WHY: Two badges — NEEDS ATTENTION (bright red, spec says "never subtle")
// and STALE (orange warning). Used in Dashboard open list, History table,
// and Ticket Detail header. These are the primary visual signals that
// something requires action.

import Badge from '@/components/ui/Badge'
import { getIssueTypeColor, getIssueCategoryColor } from '@/lib/constants'

export function NeedsAttentionBadge() {
  return (
    <Badge bg="bg-red-500/30" text="text-red-400" pulse className="font-bold ring-1 ring-red-500/50">
      NEEDS ATTENTION
    </Badge>
  )
}

export function StaleBadge() {
  return (
    <Badge bg="bg-orange-500/20" text="text-orange-400">
      STALE — No update in 7 days
    </Badge>
  )
}

export function IssueTypeBadge({ issueType }: { issueType: string }) {
  const c = getIssueTypeColor(issueType)

  return (
    <Badge bg={c.bg} text={c.text}>
      {issueType}
    </Badge>
  )
}

export function IssueCategoryBadge({ category }: { category: string }) {
  const c = getIssueCategoryColor(category)

  return (
    <Badge bg={c.bg} text={c.text}>
      {category}
    </Badge>
  )
}
