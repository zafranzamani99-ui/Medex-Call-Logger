// Tiny in-memory snapshot cache so list pages paint INSTANTLY when you navigate
// back to them, instead of blanking to a skeleton and re-downloading everything.
//
// This is NOT a full cache library (no TTL, no GC, no dedup of in-flight requests).
// It just keeps the last-known-good list per key for the browser session. Pages:
//   1. seed their state from the snapshot on mount (instant paint), and
//   2. keep the snapshot in sync via `useEffect(() => setSnapshot(key, list), [list])`.
// The page's normal fetch still runs in the background to revalidate — the snapshot
// only removes the blank-skeleton wait, it never replaces a real fetch.
//
// Snapshots live in module scope, so they survive route changes but reset on full
// page reload (which is exactly when you want fresh data anyway).

const snapshots = new Map<string, unknown>()

export function getSnapshot<T>(key: string): T | undefined {
  return snapshots.get(key) as T | undefined
}

export function setSnapshot<T>(key: string, value: T): void {
  snapshots.set(key, value)
}

export function clearSnapshot(key: string): void {
  snapshots.delete(key)
}
