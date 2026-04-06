'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'
import { useTheme } from '@/lib/ThemeProvider'

// WHY: Redesigned sidebar with spatial hierarchy — prominent CTA, notification dots, quick stats.
// Mobile uses Instagram-style elevated center button for Log Call.

interface NavBarProps {
  displayName: string
  todayCalls?: number
  openTickets?: number
  kbDrafts?: number
}

const NAV_ITEMS = [
  {
    href: '/', label: 'Dashboard', shortLabel: 'Home', dotKey: null,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  },
  {
    href: '/my-log', label: 'My Log', shortLabel: 'My Log', dotKey: null,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  },
  {
    href: '/tickets', label: 'History', shortLabel: 'History', dotKey: 'openTickets' as const,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
]

const DATA_ITEMS = [
  {
    href: '/lk', label: 'License Key', dotKey: null,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg>,
  },
  {
    href: '/kb', label: 'Knowledge Base', dotKey: 'kbDrafts' as const,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
  },
  {
    href: '/schedule', label: 'Calendar', dotKey: null,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" /></svg>,
  },
  {
    href: '/activity', label: 'Activity', dotKey: null,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
  },
  {
    href: '/job-sheets', label: 'Job Sheets', dotKey: null,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  },
]

const SYSTEM_ITEMS = [
  {
    href: '/settings', label: 'Settings', dotKey: null,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
]

// Mobile tabs: Home, History, [elevated +], My Log, More
const MOBILE_TABS = [
  { href: '/', label: 'Home', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> },
  { href: '/tickets', label: 'History', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
  { href: '/log', label: 'Log', elevated: true, icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> },
  { href: '/my-log', label: 'My Log', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
  { href: 'more', label: 'More', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" /></svg> },
]

const MORE_ITEMS = [
  { href: '/lk', label: 'License Key', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg> },
  { href: '/kb', label: 'Knowledge Base', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> },
  { href: '/schedule', label: 'Calendar', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" /></svg> },
  { href: '/activity', label: 'Activity', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg> },
  { href: '/job-sheets', label: 'Job Sheets', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
  { href: '/settings', label: 'Settings', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
]

// Dot colors for notification indicators
const DOT_COLORS: Record<string, string> = {
  openTickets: 'bg-red-400',
  kbDrafts: 'bg-blue-400',
}

export default function NavBar({ displayName, todayCalls = 0, openTickets = 0, kbDrafts = 0 }: NavBarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [collapsed, setCollapsed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-width',
      collapsed ? '60px' : '220px'
    )
  }, [collapsed])
  const { theme: currentTheme, toggleTheme } = useTheme()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const dotCounts: Record<string, number> = { openTickets, kbDrafts }

  // Render a nav link with optional notification dot
  const renderNavLink = (item: { href: string; label: string; icon: React.ReactNode; dotKey: string | null }, isCollapsed: boolean) => {
    const active = isActive(item.href)
    const dotCount = item.dotKey ? dotCounts[item.dotKey] || 0 : 0
    return (
      <Link
        key={item.href}
        href={item.href}
        title={isCollapsed ? item.label : undefined}
        className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-150 ${
          active
            ? 'bg-indigo-500/10 text-indigo-400 font-medium'
            : 'text-text-tertiary hover:text-text-secondary hover:bg-white/[0.03]'
        } ${isCollapsed ? 'justify-center px-0' : ''}`}
      >
        {active && !isCollapsed && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-3.5 rounded-r-full bg-indigo-400" />
        )}
        <span className="relative flex-shrink-0">
          {item.icon}
          {dotCount > 0 && (
            <span className={`absolute -top-1 -right-1 size-2 rounded-full ${item.dotKey ? DOT_COLORS[item.dotKey] : ''}`} />
          )}
        </span>
        {!isCollapsed && (
          <>
            <span className="flex-1">{item.label}{item.label === 'Job Sheets' && <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wider text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded">beta</span>}</span>
            {dotCount > 0 && (
              <span className="text-[10px] tabular-nums font-medium text-text-muted bg-white/[0.06] px-1.5 py-0.5 rounded-md">
                {dotCount}
              </span>
            )}
          </>
        )}
      </Link>
    )
  }

  return (
    <>
      {/* ===== Desktop Sidebar ===== */}
      <aside
        className={`hidden md:flex flex-col fixed top-0 left-0 h-dvh z-40 transition-[width] duration-200 will-change-[width] bg-surface border-r border-border ${
          collapsed ? 'w-[60px]' : 'w-[220px]'
        }`}
      >
        {/* Logo + collapse */}
        <div className="flex items-center justify-between h-14 px-4 flex-shrink-0">
          {!collapsed && (
            <Link href="/" className="flex items-center gap-2.5">
              <div className="size-7 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                <svg className="size-3.5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <span className="text-[13px] font-semibold text-text-primary tracking-wide">Medex</span>
            </Link>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-text-muted hover:text-text-secondary transition-colors p-1 rounded-md"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {collapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
              )}
            </svg>
          </button>
        </div>

        {/* Prominent Log Call CTA */}
        <div className="px-3 mb-3 flex-shrink-0">
          <Link
            href="/log"
            className={`flex items-center justify-center gap-2 w-full rounded-lg text-[13px] font-semibold transition-all duration-150 active:translate-y-px ${
              isActive('/log')
                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                : 'bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 hover:text-indigo-300'
            } ${collapsed ? 'px-0 py-2.5' : 'px-4 py-2.5'}`}
          >
            <svg className="size-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {!collapsed && <span>Log Call</span>}
          </Link>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-1 px-2">
          {/* Main */}
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => renderNavLink(item, collapsed))}
          </div>

          {/* Data group */}
          <div className="mt-5 pt-4 border-t border-border">
            {!collapsed && (
              <span className="px-3 text-[10px] font-semibold text-text-muted uppercase tracking-[0.08em] mb-1.5 block">
                Data
              </span>
            )}
            <div className="space-y-0.5">
              {DATA_ITEMS.map((item) => renderNavLink(item, collapsed))}
            </div>
          </div>

          {/* System group */}
          <div className="mt-5 pt-4 border-t border-border">
            {!collapsed && (
              <span className="px-3 text-[10px] font-semibold text-text-muted uppercase tracking-[0.08em] mb-1.5 block">
                System
              </span>
            )}
            <div className="space-y-0.5">
              {SYSTEM_ITEMS.map((item) => renderNavLink(item, collapsed))}
            </div>
          </div>
        </nav>

        {/* Quick stats at bottom */}
        {!collapsed && (
          <div className="px-4 py-3 flex-shrink-0 border-t border-border">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-muted">Today</span>
              <span className="text-text-secondary tabular-nums font-medium">
                {todayCalls} {todayCalls === 1 ? 'call' : 'calls'}
              </span>
            </div>
            {openTickets > 0 && (
              <div className="flex items-center justify-between text-[11px] mt-1">
                <span className="text-text-muted">Open</span>
                <span className="text-red-400 tabular-nums font-medium">{openTickets}</span>
              </div>
            )}
          </div>
        )}

        {/* User section */}
        <div className="p-3 flex-shrink-0 border-t border-border">
          {collapsed ? (
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center p-2 rounded-lg text-text-muted hover:text-red-400 transition-colors"
              title={`${displayName} — Logout`}
            >
              <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="size-7 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-[11px] font-semibold text-indigo-400">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-[13px] text-text-secondary truncate">{displayName}</span>
              </div>
              <button
                onClick={handleLogout}
                className="text-text-muted hover:text-red-400 transition-colors p-1 rounded-md flex-shrink-0"
                title="Logout"
              >
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ===== Mobile Top Bar ===== */}
      <header className="md:hidden sticky top-0 z-40 safe-top bg-surface/85 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between h-12 px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="size-6 rounded-md bg-indigo-500/15 flex items-center justify-center">
              <svg className="size-3 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <span className="text-[13px] font-semibold text-text-primary">Medex</span>
          </Link>
          <div className="flex items-center gap-3">
            {openTickets > 0 && (
              <span className="text-[10px] tabular-nums font-medium text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-md">
                {openTickets} open
              </span>
            )}
            <span className="text-xs text-text-tertiary">{displayName}</span>
          </div>
        </div>
      </header>

      {/* ===== Mobile Bottom Tab Bar ===== */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 safe-bottom bg-surface/85 backdrop-blur-xl border-t border-border">
        <div className="flex items-end justify-around h-16 px-1">
          {MOBILE_TABS.map((item) => {
            if (item.href === 'more') {
              return (
                <button
                  key="more"
                  onClick={() => setMoreOpen(!moreOpen)}
                  className={`flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-2 py-1 rounded-lg transition-colors ${
                    moreOpen ? 'text-indigo-400' : 'text-text-muted'
                  }`}
                >
                  {item.icon}
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              )
            }

            // Elevated center button for Log Call
            if ('elevated' in item && item.elevated) {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex flex-col items-center -mt-3 relative"
                >
                  <div className={`size-12 rounded-2xl flex items-center justify-center transition-all duration-150 active:scale-95 ${
                    active
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                      : 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
                  }`}>
                    {item.icon}
                  </div>
                  <span className={`text-[10px] font-medium mt-0.5 ${active ? 'text-indigo-400' : 'text-text-muted'}`}>
                    {item.label}
                  </span>
                </Link>
              )
            }

            const active = isActive(item.href)
            const dotKey = item.href === '/tickets' ? 'openTickets' : null
            const dotCount = dotKey ? dotCounts[dotKey] || 0 : 0
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={`flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] px-2 py-1 rounded-lg transition-colors ${
                  active ? 'text-indigo-400' : 'text-text-muted'
                }`}
              >
                <span className="relative">
                  {item.icon}
                  {dotCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-red-400" />
                  )}
                </span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* ===== Mobile "More" Sheet ===== */}
      {moreOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => setMoreOpen(false)}
          />
          <div className="md:hidden fixed bottom-16 left-2 right-2 z-50 rounded-2xl shadow-theme-lg px-2 py-3 safe-bottom animate-slideUp bg-surface-raised border border-border">
            {MORE_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${
                  isActive(item.href)
                    ? 'bg-indigo-500/10 text-indigo-400 font-medium'
                    : 'text-text-tertiary hover:text-text-primary hover:bg-white/[0.03]'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.label === 'Job Sheets' && <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded">beta</span>}
              </Link>
            ))}
            <button
              onClick={() => { toggleTheme(); setMoreOpen(false) }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-text-tertiary hover:text-text-primary hover:bg-surface-raised transition-colors w-full mt-1 border-t border-border"
            >
              {currentTheme === 'dark' ? (
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
              ) : (
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>
              )}
              <span>{currentTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors w-full"
            >
              <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Logout</span>
            </button>
          </div>
        </>
      )}
    </>
  )
}
