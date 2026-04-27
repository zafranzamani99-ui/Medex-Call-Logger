'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// WHY: Browser tab shows the current page name (e.g. "Calendar", "Inbox")
// instead of the static "Medex Workspace" everywhere. Mounted once in the
// (app) layout — no per-page change needed.

const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'Dashboard'],
  [/^\/my-log/, 'My Log'],
  [/^\/inbox/, 'Inbox'],
  [/^\/tickets\/[^/]+/, 'Ticket'],
  [/^\/tickets/, 'History'],
  [/^\/log/, 'Log'],
  [/^\/crm/, 'CRM'],
  [/^\/schedule/, 'Calendar'],
  [/^\/resources/, 'Resources'],
  [/^\/lk/, 'License Key'],
  [/^\/job-sheets\/[^/]+/, 'Job Sheet'],
  [/^\/job-sheets/, 'Job Sheets'],
  [/^\/kb\/[^/]+/, 'Article'],
  [/^\/kb/, 'Knowledge Base'],
  [/^\/activity/, 'Activity'],
  [/^\/settings/, 'Settings'],
]

const titleFor = (path: string): string => {
  for (const [re, title] of TITLES) {
    if (re.test(path)) return title
  }
  return 'Medex Workspace'
}

export default function PageTitle() {
  const pathname = usePathname()
  useEffect(() => {
    document.title = titleFor(pathname || '/')
  }, [pathname])
  return null
}
