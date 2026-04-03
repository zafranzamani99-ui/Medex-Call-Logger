# V2 — AI-Powered Knowledge Base Generation

## Overview
When an agent resolves a ticket that has `issue`, `my_response`, and `next_step` filled in, the system automatically generates a clean, professional KB article using AI. The article is saved as a **draft** for the agent to review and edit before publishing.

## Why
- Agents solve the same issues repeatedly but rarely document solutions
- Raw ticket notes are messy — AI transforms them into clear step-by-step guides
- Builds institutional knowledge automatically over time
- New agents can find solutions faster

## User Flow
1. Agent fills in a call log: issue, my response, next step
2. Agent sets status to **Resolved** and submits
3. System detects resolved ticket with sufficient data
4. AI generates a KB draft in the background
5. Agent sees a toast: "KB draft generated — review it in KB page"
6. In KB page, drafts appear in a separate "Drafts" tab with yellow badge
7. Agent can **edit**, **publish**, or **discard** the draft

## AI Transform Example

### Raw Ticket Input
- **Issue Type:** Printing
- **Issue:** clinic cannot print receipt, says printer offline but printer is on
- **My Response:** asked them to go settings, printer config, remove the printer and re-add it, then restart the app
- **Next Step:** resolved, clinic confirmed printing works now

### AI-Generated KB Article
- **Title:** Receipt Printing — Printer Shows Offline But Is Connected
- **Issue:** Clinic reports that receipts cannot be printed. The printer status shows "offline" in the system even though the physical printer is powered on and connected.
- **Fix:**
  1. Navigate to **Settings → Printer Configuration**
  2. Select the problematic printer from the list
  3. Click **Remove Printer** to delete the current configuration
  4. Click **Add Printer** and re-select the same printer
  5. Restart the application
  6. Test by printing a sample receipt

  **Root cause:** The printer connection cache becomes stale. Removing and re-adding forces a fresh connection handshake.

## Technical Design

### AI Provider
- **Gemini Flash** (Google) — free tier available, fast inference
- API: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
- Env var: `GEMINI_API_KEY`

### API Route
- `app/api/generate-kb/route.ts`
- Accepts: `{ issue_type, issue, my_response, next_step, ticket_id }`
- Calls Gemini with a structured prompt
- Returns: `{ issue, fix }` (cleaned up by AI)
- Saves to `knowledge_base` table with `status: 'draft'` and `source_ticket_id`

### Prompt Template
```
You are a technical support documentation writer for a medical clinic software system (Medex).

Given a resolved support ticket, generate a clear Knowledge Base article.

Rules:
- Title: short, specific problem statement
- Issue: 1-2 sentences describing what the customer experienced
- Fix: numbered step-by-step instructions, clear and actionable
- Add a "Root cause" note if the reason is apparent
- Use bold for menu paths (e.g., **Settings → Printer Config**)
- Keep it concise — agents read this during live calls
- Write in English

Input:
- Issue Type: {issue_type}
- Issue: {issue}
- Agent's Response: {my_response}
- Next Step: {next_step}

Output as JSON:
{ "issue": "...", "fix": "..." }
```

### Database Changes (Migration 011 — already created)
```sql
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
  CHECK (status IN ('draft', 'published'));
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS source_ticket_id UUID REFERENCES tickets(id);
```

### KB Page Updates
- Add tab toggle: **Published** | **Drafts (3)**
- Draft entries show yellow "Draft" badge
- Draft actions: **Publish** (changes status to published), **Edit** (opens modal), **Discard** (deletes)
- Published entries remain as they are today

### Log Call Page Updates
- After successful ticket save with status "Resolved":
  - Fire background `fetch('/api/generate-kb', { ... })`
  - Show toast: "AI is generating a KB draft..."
  - On success: update toast to "KB draft ready — review in KB page"
  - On failure: silently log error, don't block the user

### Duplicate Detection
- Before generating, check if a KB entry with the same `issue_type` and similar `issue` text already exists
- If found, skip generation and optionally notify: "Similar KB entry already exists"
- Can use simple substring matching or Fuse.js fuzzy match

## Files to Create/Modify
| File | Action |
|------|--------|
| `app/api/generate-kb/route.ts` | CREATE — Gemini API route |
| `app/(app)/log/page.tsx` | MODIFY — trigger KB generation after resolve |
| `app/(app)/kb/page.tsx` | MODIFY — add drafts tab, publish/discard actions |
| `lib/types.ts` | DONE — added `status` and `source_ticket_id` to KnowledgeBaseEntry |
| `supabase/migrations/011_kb_ai_drafts.sql` | DONE — migration ready |
| `.env.local` | ADD — `GEMINI_API_KEY=...` |

## Environment Variable Needed
```
GEMINI_API_KEY=your_gemini_api_key_here
```
Get it from: https://aistudio.google.com/apikey
