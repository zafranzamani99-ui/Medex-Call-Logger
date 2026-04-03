'use client'

import type { DashboardStats } from '@/lib/types'

// WHY: Spec Section 7.1 — 5 stat cards on the dashboard.
// Now with trend indicators (vs yesterday) and click-to-scroll behavior.

interface StatsBarProps {
  stats: DashboardStats
  yesterdayStats?: DashboardStats
  onCardClick?: (key: string) => void
}

// Clean SVG icons — Heroicons outline style, matches sidebar icons
const STAT_ICONS: Record<string, React.ReactNode> = {
  callsToday: <svg className="size-5 opacity-60" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>,
  openTickets: <svg className="size-5 opacity-60" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>,
  needsAttention: <svg className="size-5 opacity-60" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>,
  stale: <svg className="size-5 opacity-60" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  resolvedToday: <svg className="size-5 opacity-60" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
}

const cards = [
  { key: 'callsToday' as const, label: 'Calls Today', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20 hover:border-cyan-500/40' },
  { key: 'openTickets' as const, label: 'Open Tickets', color: 'bg-violet-500/15 text-violet-400 border-violet-500/20 hover:border-violet-500/40' },
  { key: 'needsAttention' as const, label: 'Needs Attention', color: 'bg-red-500/15 text-red-400 border-red-500/20 hover:border-red-500/40' },
  { key: 'stale' as const, label: 'Stale Tickets', color: 'bg-orange-500/15 text-orange-400 border-orange-500/20 hover:border-orange-500/40' },
  { key: 'resolvedToday' as const, label: 'Resolved Today', color: 'bg-green-500/15 text-green-400 border-green-500/20 hover:border-green-500/40' },
]

function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous
  if (diff === 0) return null

  const isUp = diff > 0
  return (
    <span className={`inline-flex items-center text-xs font-medium ${isUp ? 'text-green-400' : 'text-red-400'}`}>
      <svg className="size-3 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
          d={isUp ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
        />
      </svg>
      {Math.abs(diff)}
    </span>
  )
}

export default function StatsBar({ stats, yesterdayStats, onCardClick }: StatsBarProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <button
          key={card.key}
          onClick={() => onCardClick?.(card.key)}
          className={`rounded-lg border p-4 text-left transition-colors ${card.color} ${onCardClick ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs opacity-70">{card.label}</p>
            {STAT_ICONS[card.key]}
          </div>
          <div className="flex items-end gap-2 mt-1">
            <p className="text-2xl font-bold tabular-nums">{stats[card.key]}</p>
            {yesterdayStats && (
              <TrendIndicator current={stats[card.key]} previous={yesterdayStats[card.key]} />
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
