import { NextRequest, NextResponse } from 'next/server'

// WHY: Takes an agent's rough edit (broken English, informal notes) and polishes it
// into a clean KB article. Keeps all technical content (table names, SQL, paths) intact —
// only fixes grammar, formatting, and structure.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 })
  }

  const { issue, fix } = await req.json()

  if (!issue || !fix) {
    return NextResponse.json({ error: 'Missing issue or fix' }, { status: 400 })
  }

  const prompt = `You are a technical editor for Medex support KB articles. An agent has written a rough fix in informal English. Your job:

1. Fix grammar and sentence structure — make it read like a professional guide
2. Keep the EXACT same technical content: table names, column names, SQL commands, file paths, menu paths, Medex-specific terms
3. Format as:
   - "Cause:" line (1 sentence)
   - Numbered steps (direct, actionable)
   - "Note:" at end only if genuinely needed
4. Do NOT add steps the agent didn't mention
5. Do NOT remove steps the agent wrote
6. Keep it concise — 80-150 words for the fix

AGENT'S ROUGH DRAFT:
Issue: ${issue}
Fix: ${fix}

OUTPUT FORMAT (return ONLY this JSON, no markdown, no code fences):
{
  "issue": "Clean issue title (max 80 chars)",
  "fix": "Polished fix with Cause + numbered steps + optional Note"
}`

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      console.error('Gemini polish error:', err)
      return NextResponse.json({ error: 'Gemini API failed' }, { status: 502 })
    }

    const geminiData = await geminiRes.json()
    const parts = geminiData.candidates?.[0]?.content?.parts || []
    const rawText = parts.filter((p: { text?: string }) => p.text).pop()?.text || ''

    const jsonStr = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

    try {
      const parsed = JSON.parse(jsonStr)
      return NextResponse.json({ success: true, issue: parsed.issue, fix: parsed.fix })
    } catch {
      return NextResponse.json({ success: true, issue, fix: rawText.trim() })
    }
  } catch (err) {
    console.error('Polish KB error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
