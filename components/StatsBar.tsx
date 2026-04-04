'use client'

import type { DashboardStats } from '@/lib/types'

interface StatsBarProps {
  stats: DashboardStats
  yesterdayStats?: DashboardStats
  onCardClick?: (key: string) => void
}

const cards = [
  { key: 'callsToday' as const, label: 'Calls Today', accent: 'bg-indigo-400', textAccent: 'text-indigo-400' },
  { key: 'openTickets' as const, label: 'Open Tickets', accent: 'bg-sky-400', textAccent: 'text-sky-400' },
  { key: 'needsAttention' as const, label: 'Needs Attention', alert: true, accent: 'bg-red-400', textAccent: 'text-red-400' },
  { key: 'stale' as const, label: 'Stale Tickets', warn: true, accent: 'bg-amber-400', textAccent: 'text-amber-400' },
  { key: 'resolvedToday' as const, label: 'Resolved Today', success: true, accent: 'bg-emerald-400', textAccent: 'text-emerald-400' },
]

function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous
  if (diff === 0) return null

  const isUp = diff > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
      <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      {cards.map((card) => {
        const value = stats[card.key]
        const hasAlert = card.alert && value > 0
        const hasWarn = card.warn && value > 0

        return (
          <button
            key={card.key}
            onClick={() => onCardClick?.(card.key)}
            className={`relative overflow-hidden card p-4 text-left transition-all group ${
              onCardClick ? 'cursor-pointer hover:shadow-theme-md hover:-translate-y-0.5' : 'cursor-default'
            } ${hasAlert ? 'border-red-500/20' : hasWarn ? 'border-amber-500/20' : ''}`}
          >
            {/* Left accent bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${card.accent} ${
              hasAlert || hasWarn || (card.success && value > 0) ? 'opacity-80' : 'opacity-25 group-hover:opacity-50'
            } transition-opacity`} />

            <p className="text-[12px] font-medium text-text-tertiary pl-2">{card.label}</p>
            <div className="flex items-baseline gap-2 mt-1.5 pl-2">
              <span className={`text-2xl font-bold tabular-nums ${
                hasAlert ? 'text-red-400' : hasWarn ? 'text-amber-400' : card.success && value > 0 ? 'text-emerald-400' : 'text-text-primary'
              }`}>
                {value}
              </span>
              {yesterdayStats && (
                <TrendIndicator current={value} previous={yesterdayStats[card.key]} />
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
