import { NextRequest, NextResponse } from 'next/server'

// Parse free-form work notes into structured job sheet fields using Gemini Flash

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 })
  }

  const { notes } = await req.json()
  if (!notes || typeof notes !== 'string' || notes.trim().length < 3) {
    return NextResponse.json({ parsed: {} })
  }

  const prompt = `You are a data extraction assistant for MedexOne, a medical software support company in Malaysia.
Agents write VERY SHORT shorthand notes while working at clinics. Your job is to extract structured data from these terse notes.

WORK NOTES:
"""
${notes}
"""

CRITICAL SHORTHAND PATTERNS — agents write like this:
- "321-426" or "321/426" = program version 321, database version 426 (first number is program version, second is DB version)
- "4PC" or "4 pc" or "4ws" = 4 workstations/PCs
- "SERVER" or "SVR01" or a single uppercase word = main PC / server computer name
- "500MB-1GB" or "500mb" = database size (range or single value)
- "8gb ram" or "8g" = RAM
- "i5" or "i7 10th" = processor
- "c:50gb" or "c 120g" = C drive free space
- "d:500gb" = D drive free space
- "uv 123456 abc" = Ultraviewer ID: 123456, password: abc
- "ad 987654 xyz" = AnyDesk ID: 987654, password: xyz
- "v180" or "updated 180" = version after update
- "db420" or "db to 420" = DB version after update
- "dr ahmad" or "doc sarah" = doctor name
- "pic: ali 0123456789" = contact person Ali, phone 0123456789
- A standalone name like "RECEPTION" or "FRONT-DESK" = could be main PC name

Extract into this JSON. Only include fields with evidence. Leave others as empty string or null:

{
  "version_before": "",
  "db_version_before": "",
  "issue_detail": "",
  "service_done": "",
  "suggestion": "",
  "remark": "",
  "total_workstation": "",
  "program_version_after": "",
  "db_version_after": "",
  "main_pc_name": "",
  "space_c": "",
  "space_d": "",
  "service_db_size_before": "",
  "service_db_size_after": "",
  "ultraviewer_id": "",
  "ultraviewer_pw": "",
  "anydesk_id": "",
  "anydesk_pw": "",
  "ram": "",
  "processor": "",
  "auto_backup_30days": null,
  "ext_hdd_backup": null,
  "need_server": null,
  "brief_doctor": null,
  "contact_person": "",
  "contact_tel": "",
  "doctor_name": "",
  "doctor_phone": "",
  "checklist_notes": {}
}

Rules:
- Notes are VERY terse. A line with just "SERVER" means the main PC name is "SERVER".
- "321-426" on its own line = version_before: "321", db_version_before: "426"
- "4PC" = total_workstation: "4"
- "500MB-1GB" = service_db_size_before: "500MB-1GB"
- For boolean fields, only set true/false if explicitly mentioned, otherwise null
- Return ONLY valid JSON, no markdown or explanation`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
      }
    )

    if (!res.ok) {
      const errText = await res.text()
      console.error('Gemini error:', errText)
      return NextResponse.json({ error: 'AI parsing failed' }, { status: 502 })
    }

    const data = await res.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'

    // Extract JSON from response (might be wrapped in ```json blocks)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ parsed: {} })
    }

    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json({ parsed })
  } catch (err) {
    console.error('Parse notes error:', err)
    return NextResponse.json({ parsed: {} })
  }
}
