'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTheme } from '@/lib/ThemeProvider'
import { formatDistanceToNow } from 'date-fns'
import type { Notification } from '@/lib/types'

// WHY: Redesigned sidebar with spatial hierarchy — prominent CTA, notification dots, quick stats.
// Mobile uses Instagram-style elevated center button for Log Call.

interface NavBarProps {
  displayName: string
  todayCalls?: number
  openTickets?: number
  kbDrafts?: number
  inboxUnread?: number
  notifCount?: number
  missedCalls?: number
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
    href: '/shift', label: 'Shift', shortLabel: 'Shift', dotKey: null,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>,
  },
  {
    href: '/call-log', label: 'Call Log', shortLabel: 'Calls', dotKey: 'missedCalls' as const,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>,
  },
  {
    href: '/inbox', label: 'Inbox', shortLabel: 'Inbox', dotKey: 'inboxUnread' as const,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>,
  },
  {
    href: '/tickets', label: 'History', shortLabel: 'History', dotKey: 'openTickets' as const,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
]

const DATA_ITEMS = [
  {
    href: '/crm', label: 'CRM', dotKey: null,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>,
  },
  {
    href: '/schedule', label: 'Calendar', dotKey: null,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" /></svg>,
  },
  {
    href: '/resources', label: 'Resources', dotKey: null,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H2.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>,
  },
  {
    href: '/lk', label: 'License Key', dotKey: null,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg>,
  },
  {
    href: '/job-sheets', label: 'Job Sheets', dotKey: null,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  },
  {
    href: '/kb', label: 'Knowledge Base', dotKey: 'kbDrafts' as const,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
  },
  {
    href: '/activity', label: 'Activity', dotKey: null,
    icon: <svg className="size-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
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
  { href: '/inbox', label: 'Inbox', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg> },
  { href: '/shift', label: 'Shift', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg> },
  { href: '/call-log', label: 'Call Log', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg> },
  { href: '/crm', label: 'CRM', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg> },
  { href: '/schedule', label: 'Calendar', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" /></svg> },
  { href: '/resources', label: 'Resources', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H2.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg> },
  { href: '/lk', label: 'License Key', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg> },
  { href: '/job-sheets', label: 'Job Sheets', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
  { href: '/kb', label: 'Knowledge Base', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> },
  { href: '/activity', label: 'Activity', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg> },
  { href: '/settings', label: 'Settings', icon: <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
]

// Dot colors for notification indicators
const DOT_COLORS: Record<string, string> = {
  openTickets: 'bg-red-400',
  kbDrafts: 'bg-blue-400',
  inboxUnread: 'bg-purple-400',
  missedCalls: 'bg-red-500',
}

export default function NavBar({ displayName, todayCalls = 0, openTickets = 0, kbDrafts = 0, inboxUnread = 0, notifCount: initialNotifCount = 0, missedCalls = 0 }: NavBarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [collapsed, setCollapsed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  // Notification bell state
  const [bellOpen, setBellOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notifCount, setNotifCount] = useState(initialNotifCount)
  const [notifLoading, setNotifLoading] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-width',
      collapsed ? '60px' : '220px'
    )
  }, [collapsed])

  const handleCollapse = () => {
    document.documentElement.setAttribute('data-sidebar-animating', '')
    setCollapsed(!collapsed)
    setTimeout(() => document.documentElement.removeAttribute('data-sidebar-animating'), 220)
  }
  const { theme: currentTheme, toggleTheme } = useTheme()

  // Notification bell: fetch + realtime
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setNotifications(data as Notification[])
    setNotifLoading(false)
  }, [supabase])

  // Get user ID on mount so we can filter realtime subscription
  useEffect(() => {
    async function getUid() {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user) setCurrentUserId(data.session.user.id)
    }
    getUid()
  }, [supabase])

  // Subscribe to realtime notifications only after we have the user ID
  useEffect(() => {
    if (!currentUserId) return
    const channel = supabase
      .channel('notif-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const notif = payload.new as Notification
          setNotifications(prev => [notif, ...prev].slice(0, 20))
          setNotifCount(c => c + 1)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, currentUserId])

  useEffect(() => {
    if (!bellOpen) return
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [bellOpen])

  const handleOpenBell = async () => {
    const opening = !bellOpen
    setBellOpen(opening)
    if (opening) {
      await fetchNotifications()
      // Mark all as read
      if (notifCount > 0) {
        await supabase.from('notifications').update({ is_read: true }).eq('is_read', false)
        setNotifCount(0)
      }
    }
  }

  const NOTIF_ICONS: Record<string, { bg: string; text: string; label: string }> = {
    assignment: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', label: 'Assigned' },
    mention: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: 'Mentioned' },
    priority: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'High Priority' },
    ot_claim: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'OT Claim' },
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const dotCounts: Record<string, number> = { openTickets, kbDrafts, inboxUnread, missedCalls }

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
            : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-raised'
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
            <span className="flex-1">{item.label}</span>
            {dotCount > 0 && (
              <span className="text-[10px] tabular-nums font-medium text-text-muted bg-surface-inset px-1.5 py-0.5 rounded-md">
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
        className={`hidden md:flex flex-col fixed top-0 left-0 h-dvh z-40 bg-surface border-r border-border ${
          collapsed ? 'w-[60px]' : 'w-[220px]'
        }`}
      >
        {/* Logo + collapse */}
        <div className="flex items-center justify-between px-4 pt-5 pb-4 flex-shrink-0">
          {!collapsed && (
            <Link href="/" className="flex-1 flex items-center justify-center mr-2">
              <img src="/medexone-logo.png" alt="MedexOne" className="h-7 object-contain" />
            </Link>
          )}
          <button
            onClick={handleCollapse}
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
      <header className="md:hidden sticky top-0 z-40 bg-surface border-b border-border">
        <div className="flex items-center justify-between h-12 px-4">
          <Link href="/" className="flex items-center">
            <img src="/medexone-logo.png" alt="MedexOne" className="h-5 object-contain" />
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
                    : 'text-text-tertiary hover:text-text-primary hover:bg-surface-raised'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
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

      {/* ===== Notification FAB — bottom-right, all screens ===== */}
      <div ref={bellRef} className="fixed z-50 right-5 bottom-[84px] md:bottom-6 print:hidden">
        <div className="relative">
          <button
            onClick={handleOpenBell}
            className={`relative size-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 ${
              bellOpen
                ? 'bg-indigo-500 text-white shadow-indigo-500/30'
                : 'bg-surface-raised border border-border text-text-secondary hover:text-indigo-400 hover:border-indigo-500/30 shadow-theme-lg'
            }`}
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            {notifCount > 0 && (
              <span className="absolute -top-1 -right-1 size-5 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-[var(--color-surface)]">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute bottom-14 right-0 w-80 bg-surface border border-border rounded-xl shadow-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">Notifications</span>
                {notifications.length > 0 && (
                  <button
                    onClick={() => { setBellOpen(false); router.push('/inbox') }}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    View Inbox
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifLoading ? (
                  <div className="p-4 space-y-3">
                    <div className="h-10 skeleton rounded" />
                    <div className="h-10 skeleton rounded" />
                    <div className="h-10 skeleton rounded" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-6 text-center">
                    <svg className="size-8 text-text-muted mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                    </svg>
                    <p className="text-xs text-text-muted">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map(n => {
                    const nStyle = NOTIF_ICONS[n.type] || NOTIF_ICONS.assignment
                    return (
                      <button
                        key={n.id}
                        onClick={() => { setBellOpen(false); if (n.link) router.push(n.link) }}
                        className={`w-full text-left px-4 py-3 border-b border-border/50 last:border-0 hover:bg-surface-raised transition-colors ${
                          !n.is_read ? 'bg-indigo-500/5' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${nStyle.bg} ${nStyle.text}`}>
                            {nStyle.label}
                          </span>
                          <span className="text-[10px] text-text-muted ml-auto">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-xs text-text-primary font-medium truncate">{n.title}</p>
                        {n.body && <p className="text-[11px] text-text-tertiary truncate mt-0.5">{n.body}</p>}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
