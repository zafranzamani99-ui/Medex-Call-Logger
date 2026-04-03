import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// WHY: Server-side API route to call Gemini AI and generate a KB draft from a resolved ticket.
// Runs on server so API key stays secret. Uses service role to write to knowledge_base.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

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

  // Fetch ticket's attachment images for multimodal analysis
  const { data: ticketRow } = await supabase
    .from('tickets')
    .select('attachment_urls')
    .eq('id', ticket_id)
    .single()
  const imageUrls: string[] = ticketRow?.attachment_urls || []

  // Convert images to base64 for Gemini vision API (max 5)
  const imageParts: { inlineData: { mimeType: string; data: string } }[] = []
  for (const url of imageUrls.slice(0, 5)) {
    try {
      const res = await fetch(url)
      const buffer = Buffer.from(await res.arrayBuffer())
      const mimeType = res.headers.get('content-type') || 'image/png'
      imageParts.push({ inlineData: { mimeType, data: buffer.toString('base64') } })
    } catch { /* skip failed image fetches */ }
  }

  // Pull from published AND polished drafts — polished drafts have clean text
  // (not JSON-wrapped), so they're valid style examples even before publishing.
  // This means: polish a draft → next AI generation already learns from it.
  const { data: recentKB } = await supabase
    .from('knowledge_base')
    .select('issue, fix')
    .in('status', ['published', 'draft'])
    .order('created_at', { ascending: false })
    .limit(10)

  // Build few-shot examples — skip JSON-wrapped entries (unpolished raw AI output)
  let examplesBlock = ''
  if (recentKB && recentKB.length > 0) {
    const examples = recentKB
      .filter(kb => kb.fix && !kb.fix.trim().startsWith('{'))
      .slice(0, 3)
      .map(kb => `Issue: ${kb.issue}\nFix: ${kb.fix}`)
      .join('\n\n---\n\n')

    if (examples) {
      examplesBlock = `\n\nHERE ARE REAL KB ARTICLES WRITTEN BY OUR AGENTS — match this style closely:\n\n${examples}\n\n---\n\n`
    }
  }

  // Build image context block for prompt
  const imageContextBlock = imageUrls.length > 0 ? `
ATTACHED SCREENSHOTS: ${imageUrls.length} image(s) attached by the agent.
These are screenshots from the actual issue — error dialogs, settings screens, proof, etc.

You MUST deeply understand each image, not just read text from it:
- IDENTIFY what software/screen/module is shown (e.g., "MDOCMS login screen", "SQL Server Management Studio", "Windows Firewall settings")
- EXTRACT error codes and error messages VERBATIM — agents will search KB by these exact codes (e.g., "Error 1045", "HTTP 500", "ORA-12154")
- UNDERSTAND the root cause shown in the image — connect it to the agent's description
- If the image shows PROOF (e.g., a receipt, confirmation screen, successful result), note what it proves in the article
` : ''

  // Build cross-reference block
  const crossRefBlock = examplesBlock ? `
CROSS-REFERENCE WITH EXISTING KB:
You were given existing KB articles above as style examples. But also USE them as knowledge:
- If any existing article relates to this issue (same error, same module, similar symptoms), reference it: "See also: [article title]"
- If the issue is a VARIATION of a known problem, say so: "This is similar to [known issue] but caused by [different reason]"
- If no existing article matches, say nothing — don't force a reference
` : ''

  // Build the prompt
  const prompt = `You are writing internal KB articles for Medex support agents. Keep it practical — agents read these while on a live call.
${examplesBlock}
TICKET DATA:
- Issue Type: ${issue_type}
- Issue: ${issue}
- Response/Solution: ${my_response || 'Not provided'}
- Next Steps: ${next_step || 'None'}
${imageContextBlock}${crossRefBlock}
ARTICLE STRUCTURE — write the KB article as a diagnostic guide, not just a fix list:
1. "Cause:" — what is likely going wrong and why (connect the image + agent's description)
2. "Possible causes:" — ONLY if genuinely ambiguous. List 2-3 possibilities ranked by likelihood. Skip this if the cause is obvious
3. Numbered fix steps — practical suggestions on HOW to approach it, not just "do X"
   - Reference what's visible in screenshots where relevant (e.g., "In the screenshot, the Server Name field shows the old IP — change it to...")
   - Include specific paths/menus/buttons where relevant
   - One sub-bullet per step max, only if needed
4. "How we handle this:" — ONE line on how the Medex support team typically deals with this (based on the agent's response/solution provided in the ticket data). This helps junior agents know the team's standard approach
5. "Note:" — ONLY if there's a genuine warning or gotcha. Skip if not needed

TONE: Like a senior agent writing a quick guide for a junior — clear, confident, no padding. Aim for 80-200 words in the fix. Match the style of the example articles above if provided.

DO NOT:
- Over-explain simple actions
- Add "Important Notes and Warnings" sections with multiple paragraphs
- Repeat information from the steps
- Use bold/markdown formatting

OUTPUT FORMAT (return ONLY this JSON, no markdown, no code fences):
{
  "issue": "Clear issue title — include error code if extracted from screenshot (max 80 chars)",
  "fix": "Cause + optional possible causes + fix steps + how we handle this + optional note"
}`

  try {
    // Call Gemini API
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, ...imageParts] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,
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

    // WHY: Gemini 2.5 Flash has "thinking" — parts array may contain a thought part
    // followed by the actual response. Get the LAST text part (the real answer).
    const parts = geminiData.candidates?.[0]?.content?.parts || []
    const rawText = parts.filter((p: { text?: string }) => p.text).pop()?.text || ''

    // Parse the JSON from Gemini response (strip markdown fences if present)
    const jsonStr = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    let parsed: { issue: string; fix: string }

    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      // Fallback: use raw text as fix
      parsed = {
        issue: issue.slice(0, 80),
        fix: rawText.trim(),
      }
    }

    // Save to knowledge_base as draft (update existing draft if re-resolved)
    // Check for existing draft from this ticket — prevents duplicates on re-resolve
    const { data: existing } = await supabase
      .from('knowledge_base')
      .select('id')
      .eq('source_ticket_id', ticket_id)
      .eq('status', 'draft')
      .limit(1)
      .single()

    let data, error
    if (existing) {
      // Update existing draft instead of creating a duplicate
      ;({ data, error } = await supabase
        .from('knowledge_base')
        .update({
          issue_type,
          issue: parsed.issue,
          fix: parsed.fix,
          added_by: agent_name || 'AI (Gemini)',
          image_urls: imageUrls,
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
        })
        .select()
        .single())
    }

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: 'Failed to save KB draft' }, { status: 500 })
    }

    return NextResponse.json({ success: true, kb_entry: data })
  } catch (err) {
    console.error('Generate KB error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
