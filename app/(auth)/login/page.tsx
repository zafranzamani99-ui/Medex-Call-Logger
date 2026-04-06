'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// WHY: Login page — spec Section 14. Email + password via Supabase Auth.
// Redirects to dashboard on success. Shows error on failure.
// Middleware handles redirecting already-authenticated users away from this page.
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // WHY: Clear any stale session before login attempt.
    await supabase.auth.signOut()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 relative overflow-hidden bg-background" style={{
      backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.12), transparent 70%)',
    }}>
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.015]" style={{
        backgroundImage: 'linear-gradient(var(--text-muted) 1px, transparent 1px), linear-gradient(90deg, var(--text-muted) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
      }} />

      <div className="w-full max-w-[380px] relative z-10">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-11 rounded-xl bg-indigo-500/10 mb-5" style={{
            boxShadow: '0 0 20px -4px rgba(99, 102, 241, 0.2)',
          }}>
            <svg className="size-5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-text-primary">Sign in to Medex</h1>
          <p className="text-text-tertiary text-[13px] mt-1.5">Call Logger · Support Team</p>
        </div>

        {/* Login Form */}
        <div className="card p-7 shadow-theme-lg">
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="bg-red-500/8 border border-red-500/15 rounded-lg px-3.5 py-2.5 text-red-400 text-[13px]">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-[12px] font-medium text-text-tertiary mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 bg-surface-inset border border-border rounded-lg text-text-primary text-[13px]
                           placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[var(--ring)]
                           focus:border-transparent focus-glow transition-all"
                placeholder="agent@medex.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-[12px] font-medium text-text-tertiary mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3 py-2.5 bg-surface-inset border border-border rounded-lg text-text-primary text-[13px]
                           placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[var(--ring)]
                           focus:border-transparent focus-glow transition-all"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50
                         text-white text-[13px] font-semibold rounded-lg transition-all mt-1 shadow-theme-sm
                         active:translate-y-px active:shadow-none"
            >
              {loading ? 'Signing in...' : 'Continue'}
            </button>
          </form>
        </div>

        <p className="text-center text-[13px] text-text-tertiary mt-5">
          No account?{' '}
          <Link href="/register" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}
