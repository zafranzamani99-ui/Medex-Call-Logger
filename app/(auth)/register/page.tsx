'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// WHY: Register page — spec Section 14. Creates auth.users + profiles row.
// Display name is critical — it appears on every ticket and timeline entry
// as "Logged by: Zafran" or "Added by: Hazleen".
export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Step 1: Create the auth user
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

    // Step 2: Create the profiles row with display_name
    // WHY: The profiles table stores the display_name that appears on all log entries.
    // This must happen immediately after auth signup.
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

  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">MEDEX CALL LOGGER</h1>
          <p className="text-zinc-500 text-sm mt-1">Create your account</p>
        </div>

        {/* Register Form */}
        <form onSubmit={handleRegister} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="displayName" className="block text-sm text-zinc-400 mb-1">
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-white
                         placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50
                         focus:border-blue-500/50"
              placeholder="Zafran"
            />
            <p className="text-xs text-zinc-500 mt-1">
              This name appears on every ticket you log
            </p>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm text-zinc-400 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-white
                         placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50
                         focus:border-blue-500/50"
              placeholder="agent@medex.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-zinc-400 mb-1">
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
              className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-white
                         placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50
                         focus:border-blue-500/50"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50
                       text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-500 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-400 hover:text-blue-300">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  )
}
