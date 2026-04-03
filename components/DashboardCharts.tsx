'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { CHART_TOOLTIP_STYLE, getIssueHexColor, theme } from '@/lib/theme'

// WHY: Spec Section 7.4 — Dashboard charts.
// - Calls per day (last 14 days bar chart)
// - Issue type breakdown (donut chart)
// Uses Recharts — lightweight, React-native, works well with Next.js.
// Colors imported from lib/theme.ts — single source of truth.

interface ChartData {
  dailyCalls: { date: string; count: number }[]
  issueBreakdown: { name: string; count: number }[]
}

export default function DashboardCharts({ data }: { data: ChartData }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      {/* Calls per day — last 14 days */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-zinc-400 mb-4">Calls per Day (Last 14 Days)</h3>
        <div className="h-40 sm:h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.dailyCalls}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: theme.textTertiary }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: theme.textTertiary }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: theme.textSecondary }}
                itemStyle={{ color: theme.foreground }}
              />
              <Bar dataKey="count" fill={theme.accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Issue type breakdown — donut */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-zinc-400 mb-4">Issue Type Breakdown</h3>
        <div className="h-40 sm:h-48 flex items-center justify-center">
          {data.issueBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.issueBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="count"
                >
                  {data.issueBreakdown.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={getIssueHexColor(entry.name)}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-zinc-500">No data yet</p>
          )}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-2 justify-center">
          {data.issueBreakdown.map((entry) => (
            <div key={entry.name} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: getIssueHexColor(entry.name) }}
              />
              <span className="text-xs text-zinc-400">{entry.name} ({entry.count})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
