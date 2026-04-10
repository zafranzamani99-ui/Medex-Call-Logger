// WHY: baseline-ui says use structural skeletons for loading states,
// not "Loading..." text. Skeletons show the shape of what's coming.

export function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`skeleton h-4 ${className}`} />
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />
}

export function DashboardSkeleton() {
  return (
    <div>
      {/* Stats bar skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} className="h-20" />
        ))}
      </div>
      {/* Chart skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <SkeletonCard className="h-48" />
        <SkeletonCard className="h-48" />
      </div>
      {/* List skeleton */}
      <SkeletonLine className="w-32 mb-3" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="h-16" />
        ))}
      </div>
    </div>
  )
}

export function HistorySkeleton() {
  return (
    <div>
      <SkeletonCard className="h-64 mb-4" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} className="h-16" />
        ))}
      </div>
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="max-w-5xl mx-auto">
      <SkeletonLine className="w-20 mb-3" />
      <SkeletonLine className="w-48 h-6 mb-2" />
      <SkeletonLine className="w-64 mb-6" />
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 lg:w-3/5 space-y-4">
          <SkeletonCard className="h-64" />
          <SkeletonCard className="h-48" />
        </div>
        <div className="lg:w-2/5 space-y-4">
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-40" />
          <SkeletonCard className="h-32" />
        </div>
      </div>
    </div>
  )
}

export function KBSkeleton() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <SkeletonLine className="w-40 h-6" />
        <SkeletonCard className="w-24 h-9" />
      </div>
      <SkeletonCard className="h-12 mb-4" />
      <SkeletonCard className="h-10 mb-4" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} className="h-20" />
        ))}
      </div>
    </div>
  )
}

export function ActivitySkeleton() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <SkeletonLine className="w-32 h-6" />
        <SkeletonLine className="w-20" />
      </div>
      <div className="flex gap-3 mb-4">
        <SkeletonCard className="w-32 h-9" />
        <SkeletonCard className="w-32 h-9" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} className="h-16" />
        ))}
      </div>
    </div>
  )
}

export function ResourcesSkeleton() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <SkeletonLine className="w-32 h-6 mb-1" />
          <SkeletonLine className="w-56" />
        </div>
        <SkeletonCard className="w-28 h-9" />
      </div>
      <SkeletonCard className="h-10 mb-3" />
      <div className="flex gap-2 mb-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} className="w-24 h-8" />
        ))}
      </div>
      <SkeletonLine className="w-28 mb-3" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} className="h-20" />
        ))}
      </div>
    </div>
  )
}

export function MyLogSkeleton() {
  return (
    <div className="max-w-4xl mx-auto">
      <SkeletonLine className="w-24 h-6 mb-1" />
      <SkeletonLine className="w-40 mb-4" />
      <div className="flex gap-1.5 mb-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} className="w-20 h-9" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="h-16" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} className="h-16" />
        ))}
      </div>
    </div>
  )
}
