'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// WHY: Register page — spec Section 14. Creates auth.users + profiles row.
// Display name is critical — it appears on every ticket and timeline entry.
export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validate invite code server-side before creating account
    try {
      const inviteRes = await fetch('/api/validate-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode }),
      })
      const inviteData = await inviteRes.json()
      if (!inviteData.valid) {
        setError(inviteData.error || 'Invalid invite code')
        setLoading(false)
        return
      }
    } catch {
      setError('Could not validate invite code. Try again.')
      setLoading(false)
      return
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (!authData.user) {
      setError('Registration failed. Please try again.')
      setLoading(false)
      return
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        display_name: displayName.trim(),
        email: email.trim(),
      })

    if (profileError) {
      setError('Account created but profile setup failed: ' + profileError.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  const inputClasses = `w-full px-3 py-2.5 bg-surface-inset border border-border rounded-lg text-text-primary text-[13px]
    placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[var(--ring)]
    focus:border-transparent focus-glow transition-all`

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 relative overflow-hidden bg-background" style={{
      backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.12), transparent 70%)',
    }}>
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.015]" style={{
        backgroundImage: 'linear-gradient(var(--text-muted) 1px, transparent 1px), linear-gradient(90deg, var(--text-muted) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
      }} />

      <div className="w-full max-w-[380px] relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-11 rounded-xl bg-indigo-500/10 mb-5" style={{
            boxShadow: '0 0 20px -4px rgba(99, 102, 241, 0.2)',
          }}>
            <svg className="size-5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-text-primary">Create your account</h1>
          <p className="text-[13px] text-text-tertiary mt-1.5">Join the Medex support team</p>
        </div>

        {/* Form */}
        <div className="card p-7 shadow-theme-lg">
          <form onSubmit={handleRegister} className="space-y-4">
            {error && (
              <div className="bg-red-500/8 border border-red-500/15 rounded-lg px-3.5 py-2.5 text-red-400 text-[13px]">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="displayName" className="block text-[12px] font-medium text-text-tertiary mb-1.5">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className={inputClasses}
                placeholder="Zafran"
              />
              <p className="text-[11px] text-text-muted mt-1">
                This name appears on every ticket you log
              </p>
            </div>

            <div>
              <label htmlFor="inviteCode" className="block text-[12px] font-medium text-text-tertiary mb-1.5">
                Invite Code
              </label>
              <input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required
                className={inputClasses}
                placeholder="Enter invite code"
              />
              <p className="text-[11px] text-text-muted mt-1">
                Get this from your admin
              </p>
            </div>

            <div>
              <label htmlFor="email" className="block text-[12px] font-medium text-text-tertiary mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={inputClasses}
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
                minLength={6}
                autoComplete="new-password"
                className={inputClasses}
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
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-[13px] text-text-tertiary mt-5">
          Already have an account?{' '}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  )
}
