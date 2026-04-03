import { DashboardSkeleton } from '@/components/Skeleton'

// WHY: Next.js file convention — shows skeleton instantly while page data loads.
// Eliminates blank white screen during server component rendering.
export default function Loading() {
  return <DashboardSkeleton />
}
