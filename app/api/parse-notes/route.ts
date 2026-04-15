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

  const prompt = `You are a data extraction assistant for MedexOne, a medical clinic software support company in Malaysia.
Agents write VERY SHORT shorthand notes while servicing clinics. Extract structured data from these terse, often misspelled notes.
Malaysian agents mix English, Malay, and abbreviations freely. Expect typos (e.g. "AVAIABLE", "bfr", "aftr").

WORK NOTES:
"""
${notes}
"""

=== SHORTHAND DICTIONARY ===

VERSION & DATABASE (these are TWO SEPARATE things):
- PROGRAM VERSION = the Medex software version. Full format like "2026.1.1.23" but agents write shorthand like "321" or "415"
- DB VERSION = the database schema version. Can be written as "426", "DB426", "db 426", "database 426"
- "321-426" or "321/426" = version_before: "321" (program), db_version_before: "426" (database) — a PAIR
- "version 415 to 426" or "ver 415>426" or "update from 415 to 426" = version_before: "415", program_version_after: "426" (program UPDATE)
- "v426" or "updated 426" or "updated to 426" or "after update 426" = program_version_after: "426"
- "db420" or "db ver 420" or "db to 420" or "db version 420" = db_version_after: "420" (this is DATABASE version, not program)
- "pro 321 db 426" or "program 321 database 426" = version_before: "321", db_version_before: "426"
- "current 415" or "running 415" = version_before: "415"
- IMPORTANT: When a number follows "db" or "database", it is a DB VERSION. When it follows "version"/"ver"/"program"/"pro"/"update", it is a PROGRAM VERSION. Do NOT confuse them.

DB SIZE:
- "500MB" or "500mb" or "287,480 KB" or "5,008,840 KB" or "1.2GB" = database size (include the unit exactly as written)
- "DB SIZE BFR SAME WITH AFTER" / "db bfr and aftr same" / "db same" / "db bfr=aftr" = BOTH before AND after are the SAME value
- "db bfr 500mb aftr 600mb" / "db before 500mb after 600mb" = different before/after sizes
- "db size 500mb (same)" / "db unchanged" = same before and after
- If only one DB size mentioned with "same"/"unchanged"/"bfr=aftr", duplicate it to BOTH fields

DISK SPACE:
- "c:50gb" / "c 120g" / "C DISK SPACE AVAIABLE : 311 GB" / "c disk 91 GB" / "c drive 100gb" / "C=100GB" = C drive free space
- "d:500gb" / "d disk 201 GB" / "d drive 200gb" / "D=200GB" = D drive free space
- "c 100g d 200g" = both on one line
- "ONLY HAVE C DISK" / "no d drive" / "no d" / "single partition" = no D drive, leave space_d empty
- "USE SSD" / "SSD" / "all ssd" = disk type SSD for ALL mentioned drives
- "HDD" / "use hdd" = disk type HDD
- "c ssd d hdd" / "ssd c hdd d" = mixed drive types (set each separately)

WORKSTATIONS:
- "4PC" / "4 pc" / "4ws" / "4 workstation" / "4 unit" / "4unit pc" / "total 4 pc" / "4 komputer" = total_workstation: "4"

SERVER/PC NAME:
- "SERVER" / "SVR01" / "RECEPTION" / "FRONT-DESK" / "FRONTDESK" / "KAUNTER" = main_pc_name
- "server name: SVR01" / "pc name SERVER" / "main pc: RECEPTION" / "server name SVR01" = main_pc_name
- A standalone UPPERCASE word that looks like a computer name = main_pc_name
- IMPORTANT: Do NOT confuse "need server" (boolean) with a PC name. "need server" / "perlu server" = need_server: true

SYSTEM SPECS:
- "8gb ram" / "8g ram" / "ram 8gb" / "16g" / "ram: 16gb" / "8GB" (when clearly about RAM) = ram
- "i5" / "i7 10th" / "i7-10700" / "processor i5" / "cpu i7" / "i5 gen10" / "ryzen 5" = processor

REMOTE ACCESS:
- "uv 123456789 abc123" / "UV: 123456789 / abc123" / "ultraviewer 123456789 pw abc123" = ultraviewer_id + ultraviewer_pw
- "ad 987654321 xyz789" / "AD: 987654321 / xyz789" / "anydesk 987654321 pw xyz789" = anydesk_id + anydesk_pw
- UltraViewer IDs are typically 9-digit numbers, AnyDesk IDs are typically 9-10 digits
- The password follows the ID on the same line (separated by space, slash, "pw", or "password")

BACKUP:
- "BACKUP OKAY" / "BACKUP OK" / "backup done" / "bkp ok" / "backup running" / "auto backup ok" = auto_backup_30days: true
- "NO BACKUP" / "backup fail" / "no auto backup" / "backup not set" / "xde backup" = auto_backup_30days: false
- "EXT HDD" / "ext harddisk" / "external hdd" / "ada ext hdd" / "ext hdd ok" = ext_hdd_backup: true
- "no ext hdd" / "xde ext hdd" = ext_hdd_backup: false

CONTACTS (Malaysian phone format: 01X-XXXXXXX or 03-XXXXXXXX):
- "pic: ali 0123456789" / "pic ali tel 0123456789" / "contact person ali" = contact_person + contact_tel
- "dr ahmad" / "doc sarah" / "doctor: dr lee" = doctor_name
- "dr hp 0198765432" / "doc tel 0123456789" = doctor_phone
- "nurse fatimah 0123456789" = contact_person + contact_tel

SERVICE DETAILS:
- Anything describing the problem = issue_detail (e.g. "pc hang", "cannot print", "network slow", "blue screen", "error login")
- Anything describing what was done = service_done (e.g. "update program", "clean temp", "reinstall", "format pc", "tukar cable", "setup new pc", "migrate server")
- Anything about recommendations = suggestion (e.g. "suggest add ram", "need new pc", "cadangkan tukar server")
- General notes/comments = remark

MALAY TERMS:
- "siap" = done/completed, "rosak" = broken, "tukar" = change/replace, "pasang" = install
- "tak boleh" / "x boleh" = cannot, "lambat" = slow, "baru" = new, "lama" = old
- "cadangan" / "cadangkan" = suggestion, "masalah" = problem/issue
- "xde" / "takde" = don't have / none, "ada" = have/exists
- "komputer" = computer, "cetak" = print, "rangkaian" = network

=== FEW-SHOT EXAMPLES ===

NOTES: "USE SSD\\nC DISK SPACE AVAIABLE : 311 GB\\nONLY HAVE C DISK\\nDB SIZE BFR SAME WITH AFTER : 287,480 KB"
ANSWER:
{"space_c":"311 GB","space_c_type":"SSD","space_d":"","space_d_type":"","service_db_size_before":"287,480 KB","service_db_size_after":"287,480 KB"}

NOTES: "version 415 to 426\\ndb bfr and aftr same - 5,008,840 KB\\nUSE SSD\\nc disk 91 GB\\nd disk 201 GB\\nBACKUP OKAY"
ANSWER:
{"version_before":"415","program_version_after":"426","service_db_size_before":"5,008,840 KB","service_db_size_after":"5,008,840 KB","space_c":"91 GB","space_c_type":"SSD","space_d":"201 GB","space_d_type":"SSD","auto_backup_30days":true}

NOTES: "321-426 4PC SERVER 500MB-1GB"
ANSWER:
{"version_before":"321","db_version_before":"426","total_workstation":"4","main_pc_name":"SERVER","service_db_size_before":"500MB-1GB"}

NOTES: "5pc FRONTDESK\\n321-426 updated to 426\\ndb bfr 800mb aftr 850mb\\nc 50gb d 200gb hdd\\n8gb ram i5\\nuv 987654321 test123\\nad 123456789 abc456\\nbackup ok ext hdd\\npic sarah 0123456789\\ndr lee hp 0198765432\\npc hang sometimes, restart ok\\nupdate program, clean temp files\\nsuggest add more ram"
ANSWER:
{"total_workstation":"5","main_pc_name":"FRONTDESK","version_before":"321","db_version_before":"426","program_version_after":"426","service_db_size_before":"800mb","service_db_size_after":"850mb","space_c":"50gb","space_c_type":"HDD","space_d":"200gb","space_d_type":"HDD","ram":"8gb","processor":"i5","ultraviewer_id":"987654321","ultraviewer_pw":"test123","anydesk_id":"123456789","anydesk_pw":"abc456","auto_backup_30days":true,"ext_hdd_backup":true,"contact_person":"sarah","contact_tel":"0123456789","doctor_name":"dr lee","doctor_phone":"0198765432","issue_detail":"pc hang sometimes, restart ok","service_done":"update program, clean temp files","suggestion":"suggest add more ram"}

NOTES: "update from 321 to 426\\ndb same 500mb\\n3unit pc KAUNTER\\nssd\\nc 120g only c\\nram 16g i7 10th\\nbkp ok xde ext hdd\\nuv 111222333 pw medex1"
ANSWER:
{"version_before":"321","program_version_after":"426","service_db_size_before":"500mb","service_db_size_after":"500mb","total_workstation":"3","main_pc_name":"KAUNTER","space_c":"120g","space_c_type":"SSD","space_d":"","space_d_type":"","ram":"16g","processor":"i7 10th","auto_backup_30days":true,"ext_hdd_backup":false,"ultraviewer_id":"111222333","ultraviewer_pw":"medex1"}

NOTES: "cannot print label\\ntukar usb cable\\nsiap ok now\\nneed server"
ANSWER:
{"issue_detail":"cannot print label","service_done":"tukar usb cable","remark":"siap ok now","need_server":true}

NOTES: "migrate server from old pc to new pc\\ninstall program v426\\ndb restored 2.5GB\\nnew server name SVR-CLINIC01\\n6 workstation\\nc ssd 200gb d hdd 1tb\\n32gb ram i7-12700\\nsetup auto backup\\npasang ext hdd 2tb"
ANSWER:
{"service_done":"migrate server from old pc to new pc, install program v426, db restored","program_version_after":"426","service_db_size_before":"2.5GB","main_pc_name":"SVR-CLINIC01","total_workstation":"6","space_c":"200gb","space_c_type":"SSD","space_d":"1tb","space_d_type":"HDD","ram":"32gb","processor":"i7-12700","auto_backup_30days":true,"ext_hdd_backup":true}

=== END EXAMPLES ===

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
  "space_c_type": "",
  "space_d": "",
  "space_d_type": "",
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

DISAMBIGUATION RULES:
- "321-426" = two numbers joined by dash/slash = version_before + db_version_before (a PAIR describing current state)
- "version X to Y" / "update from X to Y" = an UPDATE happened: version_before + program_version_after
- "db same" / "db bfr same" / "db unchanged" = copy the db size value to BOTH before AND after
- "SERVER" alone = main_pc_name. "need server" / "perlu server" = need_server: true (boolean)
- "4PC" / "4 unit" = total_workstation. "PC4" / "WS01" = likely a PC name
- "USE SSD" without specifying drives = applies to ALL drives. "c ssd d hdd" = per-drive types
- Phone numbers (01X-XXXXXXX) belong to the contact mentioned on the same line
- UltraViewer/AnyDesk IDs are 9-10 digit numbers; distinguish from phone numbers by context ("uv"/"ad" prefix)
- If a line describes an action done (verbs: update, install, tukar, pasang, clean, format, setup) → service_done
- If a line describes a problem (cannot, error, fail, hang, slow, rosak) → issue_detail
- If a line is a recommendation (suggest, need, cadangkan, should) → suggestion
- For boolean fields, only set true/false if explicitly mentioned, otherwise leave as null
- Return ONLY valid JSON, no markdown, no explanation, no extra text`

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
