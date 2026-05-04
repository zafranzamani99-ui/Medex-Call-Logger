-- 075: KB similarity dedupe — embeddings + match counter + ticket linkage
-- WHY: Today /api/generate-kb calls Gemini Vision on every ticket resolve, even
-- when the resolved issue is a near-duplicate of an existing KB article. We add
-- per-row embeddings so the API can do a cheap pgvector similarity search before
-- deciding whether to generate at all.
--
-- After running this migration, hit /api/embed-kb-backfill once to embed all
-- existing KB rows. New rows get embedded inline by /api/generate-kb.

-- 1. pgvector extension (Supabase has this available — needs ENABLE first time)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Embedding column on knowledge_base
-- 768 dims = gemini-embedding-001 default output size.
ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS embedding vector(768);

-- 3. Counter — how many tickets matched this KB and skipped fresh generation.
-- Useful to spot the "workhorse" articles that absorb the most tickets.
ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS match_count INTEGER NOT NULL DEFAULT 0;

-- 4. Linkage on tickets — when a ticket matches an existing KB article rather
-- than triggering a new draft, record which one. Lets the History/dashboard
-- show "this ticket was covered by article X" later if we want.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS kb_match_id UUID REFERENCES knowledge_base(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_kb_match_id
  ON tickets(kb_match_id) WHERE kb_match_id IS NOT NULL;

-- 5. HNSW index for fast cosine-similarity search.
-- Only indexes rows that have an embedding (avoids wasted space pre-backfill).
-- m + ef_construction at defaults — our KB is small, perf is plenty.
CREATE INDEX IF NOT EXISTS idx_kb_embedding_cosine
  ON knowledge_base USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- 6. RPC: top-N nearest KB articles by cosine similarity.
-- Returns id, issue, fix, similarity (in [0,1]; higher = more similar).
-- /api/generate-kb calls this to decide skip / variant / fresh.
-- NOTE: parameter renamed to `max_results` to avoid collision with the
-- knowledge_base.match_count column (Postgres binds to the column otherwise,
-- and column references inside LIMIT are rejected: 42P10).
CREATE OR REPLACE FUNCTION kb_similarity_search(
  query_embedding vector(768),
  max_results int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  issue text,
  fix text,
  similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT
    kb.id,
    kb.issue,
    kb.fix,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE kb.embedding IS NOT NULL
    AND kb.status IN ('published', 'draft')
  ORDER BY kb.embedding <=> query_embedding
  LIMIT max_results;
$$;

-- 7. RPC: atomically bump match_count when a ticket is absorbed by an existing KB.
CREATE OR REPLACE FUNCTION increment_kb_match_count(kb_id uuid)
RETURNS void
LANGUAGE sql AS $$
  UPDATE knowledge_base SET match_count = match_count + 1 WHERE id = kb_id;
$$;
