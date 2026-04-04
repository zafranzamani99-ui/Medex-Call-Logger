'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { CHART_TOOLTIP_STYLE, getIssueHexColor, theme } from '@/lib/theme'

// WHY: Spec Section 7.4 — Dashboard charts.

interface ChartData {
  dailyCalls: { date: string; count: number }[]
  issueBreakdown: { name: string; count: number }[]
}

export default function DashboardCharts({ data }: { data: ChartData }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-10">
      {/* Calls per day */}
      <div className="card p-5">
        <h3 className="text-[12px] font-semibold text-text-muted uppercase tracking-wider mb-4">Calls per Day</h3>
        <div className="h-40 sm:h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.dailyCalls}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: theme.textMuted }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: theme.textMuted }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={{ color: theme.textSecondary }}
                itemStyle={{ color: theme.foreground }}
              />
              <Bar dataKey="count" fill={theme.accent} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Issue type breakdown — donut */}
      <div className="card p-5">
        <h3 className="text-[12px] font-semibold text-text-muted uppercase tracking-wider mb-4">Issue Breakdown</h3>
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
            <p className="text-[13px] text-text-muted">No data yet</p>
          )}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 justify-center">
          {data.issueBreakdown.map((entry) => (
            <div key={entry.name} className="flex items-center gap-1.5">
              <div
                className="size-2 rounded-full"
                style={{ backgroundColor: getIssueHexColor(entry.name) }}
              />
              <span className="text-[11px] text-text-tertiary">{entry.name} ({entry.count})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
