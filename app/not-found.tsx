import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
      <h2 className="text-lg font-semibold text-white mb-2">Page not found</h2>
      <p className="text-sm text-zinc-400 mb-6">The page you are looking for does not exist.</p>
      <Link
        href="/"
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
      >
        Go to Dashboard
      </Link>
    </div>
  )
}
