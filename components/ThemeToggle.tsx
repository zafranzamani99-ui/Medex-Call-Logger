'use client'

import { useRef } from 'react'
import { useTheme } from '@/lib/ThemeProvider'

// WHY: Theme toggle with a soft pulse animation during the breathing transition.
// The button gently pulses when clicked to match the breathing theme effect.

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const btnRef = useRef<HTMLButtonElement>(null)

  const handleClick = () => {
    // Trigger pulse animation on the button
    const btn = btnRef.current
    if (btn) {
      btn.classList.remove('theme-spin')
      // Force reflow to restart animation
      void btn.offsetWidth
      btn.classList.add('theme-spin')
    }
    toggleTheme()
  }

  return (
    <button
      ref={btnRef}
      onClick={handleClick}
      className="fixed top-4 right-4 z-30 hidden md:flex print:!hidden items-center justify-center size-8 rounded-full bg-surface-raised border border-border text-text-secondary hover:text-text-primary hover:border-text-muted transition-colors"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? (
        <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      ) : (
        <svg className="size-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
        </svg>
      )}
    </button>
  )
}
