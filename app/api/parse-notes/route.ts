import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Parse free-form work notes into structured job sheet fields using Gemini Flash

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

export async function POST(req: NextRequest) {
  const userClient = createServerClient()
  const { data: userRes } = await userClient.auth.getUser()
  if (!userRes?.user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 })
  }

  const { notes } = await req.json()
  if (!notes || typeof notes !== 'string' || notes.trim().length < 3) {
    return NextResponse.json({ parsed: {} })
  }

  const prompt = `You are a data extraction AI for MedexOne, a medical clinic software support company in Malaysia.

Extract structured data from work notes written by support agents. Notes come in ANY format — terse shorthand, formal reports, system-generated output, or a mix. Use reasoning to identify what each piece of information represents regardless of format.

WORK NOTES:
"""
${notes}
"""

CONTEXT:
- MedexOne agents service clinic PCs running Medex medical software
- Agents write in mixed English/Malay with abbreviations and typos
- Notes may contain output from a system-info tool (structured "Key: Value" lines) pasted directly
- System info tool outputs labeled lines like "Program Version Before: 2026.1.1.23", "Program Version After: 2026.1.1.25", "DB Version Before: 426", "DB Version After: 428" — map these directly to version fields
- A "version pair" like "321-426" means program version 321, database version 426
- "db same" or "before=after" means duplicate the DB size to both before and after fields
- "need server" is a boolean request, not a PC name. A standalone name like "SERVER" or "RECEPTION" IS a PC name.
- Malaysian phone numbers: 01X-XXXXXXX (mobile), 03-XXXXXXXX (landline)
- Common Malay: siap=done, rosak=broken, tukar=change, pasang=install, xde/takde=none, ada=have, cadangkan=suggest, lambat=slow, baru=new, lama=old

FIELD GUIDE — extract into this JSON structure. Only include fields you find evidence for. Leave others as "" or null:

{
  "version_before": "",           // Medex program version BEFORE update (e.g. "321", "2026.1.1.23"). May appear as "Program Version Before:" in system info output
  "program_version_after": "",    // Medex program version AFTER update. May appear as "Program Version After:" in system info output
  "db_version_before": "",        // Database schema version BEFORE. May appear as "DB Version Before:" in system info output. If value looks like "426.0.0.0", extract only the first number: "426"
  "db_version_after": "",         // Database schema version AFTER. May appear as "DB Version After:" in system info output. If value looks like "426.0.0.0", extract only the first number: "426"
  "revision": "",                 // Revision number (REV) — patch/hotfix number within a version (e.g. "5", "12")
  "total_workstation": "",        // Number of PCs/workstations (e.g. "4")
  "main_pc_name": "",             // Server/main PC hostname (e.g. "SERVER", "RECEPTION", "SVR01")
  "space_c": "",                  // C drive space info (preserve original text)
  "space_c_type": "",             // C drive type: "SSD" or "HDD"
  "space_d": "",                  // D drive space info
  "space_d_type": "",             // D drive type: "SSD" or "HDD"
  "service_db_size_before": "",   // Database file size before service (preserve units as written). May appear as "DB Size Before:" in system info output
  "service_db_size_after": "",    // Database file size after service. May appear as "DB Size After:" in system info output
  "ultraviewer_id": "",           // UltraViewer ID (9-digit number)
  "ultraviewer_pw": "",           // UltraViewer password
  "anydesk_id": "",               // AnyDesk ID (9-10 digit number)
  "anydesk_pw": "",               // AnyDesk password
  "ram": "",                      // RAM amount (e.g. "8GB", "16GB")
  "processor": "",                // CPU/processor (keep full name if given)
  "auto_backup_30days": null,     // true if backup is OK/running, false if no backup. null if not mentioned
  "ext_hdd_backup": null,         // true if external HDD exists, false if not. null if not mentioned
  "need_server": null,            // true if they need/request a server
  "brief_doctor": null,           // true if doctor was briefed
  "issue_detail": "",             // What problem/issue was reported
  "service_done": "",             // What work was performed
  "suggestion": "",               // Recommendations for the clinic
  "remark": "",                   // General notes/comments
  "contact_person": "",           // Clinic contact person name
  "contact_tel": "",              // Contact phone number
  "doctor_name": "",              // Doctor name
  "doctor_phone": "",             // Doctor phone number
  "checklist_notes": {}           // Map of checklist label → notes (e.g. {"Total Workstation": "4"})
}

CHECKLIST LABELS (for checklist_notes): "Total Workstation", "Install/Update Program Version No", "Revision (REV)", "Database Version (after update)", "Apply License Key", "Open port tcp: 3050 and udp: 9050", "Change Referral Letter Header", "Install Ultraviewer/Anydesk", "Download handwriting language", "Share MDO_SERVER and setting directory", "Create System Shortcut and rename \\"Clinisys\\"", "Turn on sharing folder", "Setting region – English (Malaysia)", "Install Gprinter (*if any)", "Install Mycard Reader (*if any)", "Full Training"

Return ONLY valid JSON — no markdown, no explanation, no extra text.`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.05, maxOutputTokens: 2048 },
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
