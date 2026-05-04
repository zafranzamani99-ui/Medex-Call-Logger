// WHY: Shared helpers for the KB dedupe pipeline. Used by /api/embed-kb-backfill
// (one-shot admin backfill) and /api/generate-kb (per-ticket inline embed).
// Single source of truth for the model + dimension + serialization format.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
// gemini-embedding-001 is the current GA Gemini embedding model. It returns
// 3072 dims by default; we explicitly request 768 via outputDimensionality so
// it matches our pgvector(768) column. Older `text-embedding-004` is not
// available on every Gemini API key tier — gemini-embedding-001 is.
const EMBED_MODEL = 'gemini-embedding-001'
const EMBED_DIMS = 768

export type EmbedResult =
  | { ok: true; values: number[] }
  | { ok: false; error: string }

/**
 * Compute a single embedding for arbitrary text. Returns a tagged result so the
 * caller can surface the failure reason (Vercel logs alone aren't enough when
 * the Settings UI counter shows lots of failures).
 */
export async function embedText(text: string): Promise<number[] | null> {
  const r = await embedTextDetailed(text)
  return r.ok ? r.values : null
}

export async function embedTextDetailed(text: string): Promise<EmbedResult> {
  if (!GEMINI_API_KEY) return { ok: false, error: 'GEMINI_API_KEY env var missing' }
  if (!text || !text.trim()) return { ok: false, error: 'Empty text' }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text: text.slice(0, 8000) }] },  // hard cap; longer text is wasted on similarity
          outputDimensionality: EMBED_DIMS,
        }),
      }
    )
    if (!res.ok) {
      const body = await res.text()
      const msg = `${res.status} ${res.statusText}: ${body.slice(0, 300)}`
      console.error('[embedText]', msg)
      return { ok: false, error: msg }
    }
    const json = await res.json() as { embedding?: { values?: number[] } }
    const values = json.embedding?.values
    if (!values || values.length === 0) {
      console.error('[embedText] Empty embedding response', json)
      return { ok: false, error: 'Empty embedding response' }
    }
    if (values.length !== EMBED_DIMS) {
      const msg = `Unexpected dim: got ${values.length}, expected ${EMBED_DIMS}`
      console.error('[embedText]', msg)
      return { ok: false, error: msg }
    }
    // Matryoshka models (gemini-embedding-001) need L2 normalization when you
    // request fewer than 3072 dims, otherwise cosine similarity is skewed.
    return { ok: true, values: l2Normalize(values) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[embedText] threw:', msg)
    return { ok: false, error: msg }
  }
}

/**
 * Postgres pgvector accepts the literal string '[0.1,0.2,…]' for vector columns
 * when you pass it through supabase-js. Stringify here so callers don't have to.
 */
export function vectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}

function l2Normalize(v: number[]): number[] {
  let sumSq = 0
  for (const x of v) sumSq += x * x
  const norm = Math.sqrt(sumSq)
  if (norm === 0) return v
  return v.map(x => x / norm)
}
