// WHY: Single source of truth for hex values used in JS contexts.
// Recharts, inline styles, and canvas can't use CSS variables — they need raw hex.
// All values match the CSS custom properties in globals.css.

export const theme = {
  background: '#0b0d14',
  surface: '#111318',
  surfaceRaised: '#171a24',
  surfaceOverlay: '#1e2230',
  border: '#1e2235',
  foreground: '#e2e4ed',
  textPrimary: '#eef0f6',
  textSecondary: '#8b91a5',
  textTertiary: '#5c6278',
  textMuted: '#363c52',
  accent: '#6366f1',
  accentHover: '#4f46e5',
} as const

// Recharts tooltip style — reusable across all chart components
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: '10px',
  fontSize: '12px',
  boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.3)',
} as const

// Issue type hex colors for Recharts & inline style contexts
// Must match ISSUE_TYPE_COLORS in constants.ts
export const ISSUE_HEX_COLORS: Record<string, string> = {
  'Enquiry':          '#94a3b8',
  'Login Issue':      '#fb7185',
  'Printing':         '#fbbf24',
  'Schedule':         '#818cf8',
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

export const DEFAULT_ISSUE_HEX = '#5c6278'

export function getIssueHexColor(issueType: string): string {
  return ISSUE_HEX_COLORS[issueType] || DEFAULT_ISSUE_HEX
}

// Issue category hex colors for Recharts & inline style contexts
export const ISSUE_CATEGORY_HEX_COLORS: Record<string, string> = {
  'Service':               '#22d3ee',
  'System Implementation': '#818cf8',
  'User':                  '#34d399',
  'Data Issue':            '#fbbf24',
  'System Issue':          '#f87171',
  'Change Request':        '#a78bfa',
}

export function getIssueCategoryHexColor(cat: string): string {
  return ISSUE_CATEGORY_HEX_COLORS[cat] || DEFAULT_ISSUE_HEX
}
