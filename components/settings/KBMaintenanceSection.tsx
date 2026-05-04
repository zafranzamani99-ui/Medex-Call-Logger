'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

// WHY: Admin-only "Backfill KB Embeddings" runner. After migration 075 ships,
// existing KB rows have no embedding — the dedupe gate in /api/generate-kb
// can't compare against them until they're embedded.
// This loops the chunked endpoint until everything is processed.

interface BatchResult {
  total: number
  missing_before: number
  processed: number
  failed: number
  remaining: number
  sample_errors?: string[]
}

export default function KBMaintenanceSection() {
  const { toast } = useToast()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null)
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [errorSamples, setErrorSamples] = useState<string[]>([])

  const runBackfill = async () => {
    if (running) return
    setRunning(true)
    setProgress(null)
    setLastResult(null)
    setErrorSamples([])
    let done = 0
    let failed = 0
    let total = 0
    let safetyCounter = 0
    let collectedSamples: string[] = []
    try {
      while (true) {
        if (++safetyCounter > 50) {
          throw new Error('Safety stop: too many batches (>50). Run again.')
        }
        const res = await fetch('/api/embed-kb-backfill', { method: 'POST' })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }))
          throw new Error(err.error || `HTTP ${res.status}`)
        }
        const json = await res.json() as BatchResult
        total = json.total
        done += json.processed
        failed += json.failed
        setProgress({ done, total, failed })
        if (json.sample_errors && json.sample_errors.length > 0 && collectedSamples.length < 3) {
          collectedSamples = [...collectedSamples, ...json.sample_errors].slice(0, 3)
          setErrorSamples(collectedSamples)
        }
        if (json.remaining === 0) break
        // Safety: if a batch processed 0 + failed 0, no progress is being made
        if (json.processed === 0 && json.failed === 0) {
          throw new Error('No progress on last batch — stopping')
        }
        // If every row in this batch failed, stop early so the user can see
        // the error instead of looping through hundreds of failures.
        if (json.processed === 0 && json.failed > 0) {
          throw new Error(`Batch failed entirely (${json.failed} errors) — stopping. See details below.`)
        }
      }
      const msg = failed > 0
        ? `Done: ${done} embedded, ${failed} failed (check server logs)`
        : `Done: ${done} articles embedded`
      setLastResult(msg)
      toast(msg, failed > 0 ? 'error' : 'success')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setLastResult(`Failed: ${msg}`)
      toast(`Backfill failed: ${msg}`, 'error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-4 sm:p-6 mb-6">
      <h2 className="text-sm font-medium text-text-secondary mb-1">KB Maintenance</h2>
      <p className="text-xs text-text-tertiary mb-4">
        After migration 075, run this once to embed every existing KB article so the dedupe gate has something to compare against. Safe to re-run — already-embedded rows are skipped.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="primary" size="md" onClick={runBackfill} disabled={running}>
          {running ? 'Running…' : 'Backfill KB Embeddings'}
        </Button>
        {progress && (
          <span className="text-xs text-text-tertiary tabular-nums">
            {progress.done}/{progress.total} embedded
            {progress.failed > 0 && <span className="text-red-400"> · {progress.failed} failed</span>}
          </span>
        )}
        {lastResult && !running && (
          <span className="text-xs text-text-secondary">{lastResult}</span>
        )}
      </div>
      {errorSamples.length > 0 && (
        <div className="mt-3 px-3 py-2 rounded-md border border-red-500/30 bg-red-500/5">
          <p className="text-[11px] font-medium text-red-300 mb-1">Sample errors ({errorSamples.length}):</p>
          <ul className="space-y-0.5 text-[11px] text-red-300/80 font-mono break-all">
            {errorSamples.map((e, i) => <li key={i}>· {e}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
