'use client'

import { createContext, useContext, useState, useEffect } from 'react'

// WHY: Theme context for dark/light mode toggle.
// Stores preference in localStorage. Defaults to dark.
// Uses View Transitions API for a breathing effect on theme switch.
// Falls back to smooth fade on unsupported browsers.

type Theme = 'dark' | 'light'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')
  const [mounted, setMounted] = useState(false)

  // Load saved preference on mount
  useEffect(() => {
    const saved = localStorage.getItem('medex-theme') as Theme | null
    if (saved === 'light' || saved === 'dark') {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved)
    }
    setMounted(true)
  }, [])

  const applyTheme = (next: Theme) => {
    setTheme(next)
    localStorage.setItem('medex-theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'

    // Use View Transitions API if available (Chrome/Edge) — breathing effect
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void }
    if (doc.startViewTransition) {
      doc.startViewTransition(() => {
        applyTheme(next)
      })
    } else {
      // Fallback: smooth fade for browsers without View Transitions
      document.documentElement.classList.add('theme-transitioning')
      applyTheme(next)
      setTimeout(() => {
        document.documentElement.classList.remove('theme-transitioning')
      }, 450)
    }
  }

  // Prevent flash of wrong theme on initial render
  if (!mounted) {
    return <>{children}</>
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
