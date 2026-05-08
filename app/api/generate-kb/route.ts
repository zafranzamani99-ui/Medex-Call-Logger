import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { embedText, vectorLiteral } from '@/lib/embeddings'

// WHY: Server-side AI KB generation. Phase-1 dedupe upgrade:
//
//   1. Embed the new ticket text (cheap, no images).
//   2. Cosine-search top KB candidates.
//   3. similarity ≥ HIGH (0.92) → skip generation entirely. Link the ticket
//      to the existing article and bump its match_count. No Gemini call.
//   4. similarity ≥ MID  (0.80) → generate, but seed prompt with the existing
//      article so the AI improves it instead of starting from scratch
//      (shorter output, fewer tokens).
//   5. otherwise → standard fresh generation.
//
// Plus per-call diet: maxOutputTokens 8192→1024, image cap 5→2, examples 3→2.
// All decisions echoed back in the response so the UI can show what happened.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const HIGH_SIMILARITY = 0.92  // skip generation outright
const MID_SIMILARITY  = 0.80  // generate-as-improvement
const MAX_IMAGES      = 2     // was 5
const MAX_OUTPUT_TOK  = 1024  // was 8192
const FEWSHOT_LIMIT   = 2     // was 3

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 })
  }

  const body = await req.json()
  const { ticket_id, issue_type, issue, my_response, next_step, agent_name } = body

  if (!ticket_id || !issue_type || !issue) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // ─── Phase 1 dedupe gate ────────────────────────────────────────────
  const ticketEmbeddingText = `${issue}\n\n${my_response || ''}`.slice(0, 8000)
  const ticketEmbedding = await embedText(ticketEmbeddingText)

  type Candidate = { id: string; issue: string; fix: string; similarity: number }
  let topMatches: Candidate[] = []

  if (ticketEmbedding) {
    // pgvector cosine: distance = 1 - similarity. Lower distance = more similar.
    // Use <=> for cosine distance, ORDER BY ASC, then convert to similarity in JS.
    const { data: candidates, error: searchErr } = await supabase.rpc('kb_similarity_search', {
      query_embedding: vectorLiteral(ticketEmbedding),
      max_results: 3,
    })
    if (searchErr) {
      // RPC missing or failed → fall through to standard generation. Don't fail the call.
      console.warn('[generate-kb] kb_similarity_search RPC failed, skipping dedupe:', searchErr.message)
    } else {
      topMatches = (candidates || []) as Candidate[]
    }
  }

  const best = topMatches[0]
  const isExactMatch = best && best.similarity >= HIGH_SIMILARITY
  const isVariant    = best && best.similarity >= MID_SIMILARITY && !isExactMatch

  // ─── Path A: skip generation, link ticket to existing KB ─────────────
  if (isExactMatch) {
    await supabase
      .from('tickets')
      .update({ kb_match_id: best.id })
      .eq('id', ticket_id)

    await supabase.rpc('increment_kb_match_count', { kb_id: best.id })
      .then(({ error }) => {
        // Non-fatal — we still link the ticket even if the counter fails to bump.
        if (error) console.warn('[generate-kb] match_count bump failed:', error.message)
      })

    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'similar_kb_exists',
      similarity: best.similarity,
      matched_kb: { id: best.id, issue: best.issue },
    })
  }

  // ─── Path B & C: generate (with or without seed) ─────────────────────

  // Fetch ticket's attachment images for multimodal analysis
  const { data: ticketRow } = await supabase
    .from('tickets')
    .select('attachment_urls')
    .eq('id', ticket_id)
    .single()
  const imageUrls: string[] = ticketRow?.attachment_urls || []

  // Convert images to base64 for Gemini vision API (capped to MAX_IMAGES)
  const imageParts: { inlineData: { mimeType: string; data: string } }[] = []
  for (const url of imageUrls.slice(0, MAX_IMAGES)) {
    try {
      const res = await fetch(url)
      const buffer = Buffer.from(await res.arrayBuffer())
      const mimeType = res.headers.get('content-type') || 'image/png'
      imageParts.push({ inlineData: { mimeType, data: buffer.toString('base64') } })
    } catch { /* skip failed image fetches */ }
  }

  // Style examples — published or polished drafts. Skip raw JSON-wrapped entries.
  const { data: recentKB } = await supabase
    .from('knowledge_base')
    .select('issue, fix')
    .in('status', ['published', 'draft'])
    .order('created_at', { ascending: false })
    .limit(8)

  let examplesBlock = ''
  if (recentKB && recentKB.length > 0) {
    const examples = recentKB
      .filter(kb => kb.fix && !kb.fix.trim().startsWith('{'))
      .slice(0, FEWSHOT_LIMIT)
      .map(kb => `Issue: ${kb.issue}\nFix: ${kb.fix}`)
      .join('\n\n---\n\n')
    if (examples) {
      examplesBlock = `\n\nReal articles written by our agents (match this tone):\n\n${examples}\n\n---\n\n`
    }
  }

  const imageContextBlock = imageUrls.length > 0 ? `
ATTACHED SCREENSHOTS: ${Math.min(imageUrls.length, MAX_IMAGES)} image(s) attached.
- IDENTIFY what software/screen is shown
- EXTRACT error codes/messages VERBATIM (agents search KB by these)
- CONNECT image to the agent's description
` : ''

  // ─── Variant mode: seed prompt with the existing article ────────────
  let seedBlock = ''
  if (isVariant && best) {
    seedBlock = `
EXISTING RELATED ARTICLE (similarity ${best.similarity.toFixed(2)}):
Issue: ${best.issue}
Fix: ${best.fix}

This new ticket is RELATED to the article above. Improve or vary it:
- If new ticket reveals a different cause/symptom → write a fresh article that distinguishes itself
- If new ticket is the same issue with extra details → output a tightened version of the existing fix
- Keep the output SHORT — don't repeat what the existing article already covers
`
  }

  // Compact prompt — trimmed structural padding from earlier version.
  const prompt = `You are writing internal KB articles for Medex support agents. Practical, agents read these on a live call.
${examplesBlock}${seedBlock}
TICKET DATA:
- Type: ${issue_type}
- Issue: ${issue}
- Response/Solution: ${my_response || 'Not provided'}
- Next Steps: ${next_step || 'None'}
${imageContextBlock}
ARTICLE STRUCTURE:
1. "Cause:" — what is going wrong and why
2. "Possible causes:" — only if genuinely ambiguous (2-3 ranked)
3. Numbered fix steps — practical, reference visible screenshot details, include menu paths
4. "How we handle this:" — ONE line on the team's standard approach (from the agent response)
5. "Note:" — only if there's a real warning

TONE: Senior agent → junior. 80-200 words for the fix. No padding, no bold/markdown.

OUTPUT (JSON ONLY, no fences):
{
  "issue": "Clear title with error code if any (max 80 chars)",
  "fix": "Cause + steps + how we handle + optional note"
}`

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, ...imageParts] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: MAX_OUTPUT_TOK,
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      console.error('Gemini API error:', err)
      return NextResponse.json({ error: 'Gemini API failed' }, { status: 502 })
    }

    const geminiData = await geminiRes.json()
    const parts = geminiData.candidates?.[0]?.content?.parts || []
    const rawText = parts.filter((p: { text?: string }) => p.text).pop()?.text || ''

    // Strip markdown fences + extract JSON object even if surrounded by prose
    let jsonStr = rawText.replace(/```(?:json)?\s*/gi, '').trim()
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (jsonMatch) jsonStr = jsonMatch[0]

    let parsed: { issue: string; fix: string }
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      // Last resort: extract issue/fix from raw text via regex
      const issueMatch = rawText.match(/"issue"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      const fixMatch = rawText.match(/"fix"\s*:\s*"((?:[^"\\]|\\.)*)"/)
      parsed = {
        issue: issueMatch ? issueMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : issue.slice(0, 80),
        fix: fixMatch ? fixMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : rawText.replace(/```(?:json)?/gi, '').replace(/[{}]/g, '').trim(),
      }
    }

    // Embed the new article so future tickets can dedupe against it.
    const articleEmbedding = await embedText(`${parsed.issue}\n\n${parsed.fix}`.slice(0, 8000))
    const embeddingPayload = articleEmbedding ? { embedding: vectorLiteral(articleEmbedding) } : {}

    // Upsert by source_ticket_id (re-resolve case)
    const { data: existing } = await supabase
      .from('knowledge_base')
      .select('id')
      .eq('source_ticket_id', ticket_id)
      .eq('status', 'draft')
      .limit(1)
      .single()

    let data, error
    if (existing) {
      ;({ data, error } = await supabase
        .from('knowledge_base')
        .update({
          issue_type,
          issue: parsed.issue,
          fix: parsed.fix,
          added_by: agent_name || 'AI (Gemini)',
          image_urls: imageUrls,
          ...embeddingPayload,
        })
        .eq('id', existing.id)
        .select()
        .single())
    } else {
      ;({ data, error } = await supabase
        .from('knowledge_base')
        .insert({
          issue_type,
          issue: parsed.issue,
          fix: parsed.fix,
          added_by: agent_name || 'AI (Gemini)',
          status: 'draft',
          source_ticket_id: ticket_id,
          image_urls: imageUrls,
          ...embeddingPayload,
        })
        .select()
        .single())
    }

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: 'Failed to save KB draft' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      skipped: false,
      mode: isVariant ? 'variant' : 'fresh',
      similarity: best?.similarity ?? null,
      kb_entry: data,
    })
  } catch (err) {
    console.error('Generate KB error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
