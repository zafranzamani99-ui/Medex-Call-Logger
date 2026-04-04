// WHY: Shared badge primitive used by StatusBadge, RecordTypeBadge, IssueTypeBadge, FlagBadge.
// Ensures consistent sizing, rounding, and font across all badge types.

interface BadgeProps {
  children: React.ReactNode
  bg: string
  text: string
  className?: string
  pulse?: boolean
}

export default function Badge({ children, bg, text, className = '', pulse }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${bg} ${text} ${pulse ? 'animate-pulse' : ''} ${className}`}>
      {children}
    </span>
  )
}
