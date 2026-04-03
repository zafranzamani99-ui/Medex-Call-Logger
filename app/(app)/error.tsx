'use client'

// WHY: Error boundary catches any unhandled errors in the (app) route group.
// Without this, a crash shows the generic Next.js error page.
// With this, users see a friendly recovery UI and can retry.

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <h2 className="text-lg font-semibold text-white mb-2">Something went wrong</h2>
      <p className="text-sm text-zinc-400 mb-4 max-w-md">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
      >
        Try Again
      </button>
    </div>
  )
}
