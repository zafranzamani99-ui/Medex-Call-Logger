// WHY: Single source of truth for hex values used in JS contexts.
// Recharts, inline styles, and canvas can't use CSS variables — they need raw hex.
// All values match the CSS custom properties in globals.css.

export const theme = {
  background: '#09090b',
  surface: '#18181b',
  surfaceRaised: '#1c1c20',
  surfaceOverlay: '#27272a',
  border: '#27272a',
  foreground: '#e4e4e7',
  textPrimary: '#fafafa',
  textSecondary: '#a1a1aa',
  textTertiary: '#71717a',
  textMuted: '#3f3f46',
  accent: '#3b82f6',
  accentHover: '#2563eb',
} as const

// Recharts tooltip style — reusable across all chart components
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: '8px',
  fontSize: '12px',
} as const

// Issue type hex colors for Recharts & inline style contexts
// Must match ISSUE_TYPE_COLORS in constants.ts
export const ISSUE_HEX_COLORS: Record<string, string> = {
  'Enquiry':          '#94a3b8',
  'Login Issue':      '#fb7185',
  'Printing':         '#fbbf24',
  'Schedule':         '#60a5fa',
  'MTN / Sys Update': '#22d3ee',
  'Inventory':        '#fcd34d',
  'Others':           '#9ca3af',
  'Dispensary':       '#2dd4bf',
  'Report':           '#a78bfa',
  'SST':              '#fb923c',
  'E-INV':            '#fda4af',
  'WhatsApp':         '#34d399',
  'Billing':          '#4ade80',
  'Consultation':     '#c084fc',
  'Registration':     '#38bdf8',
  'Corp Invoice':     '#6ee7b7',
  'Training':         '#818cf8',
  'Bug':              '#f87171',
}

export const DEFAULT_ISSUE_HEX = '#71717a'

export function getIssueHexColor(issueType: string): string {
  return ISSUE_HEX_COLORS[issueType] || DEFAULT_ISSUE_HEX
}
