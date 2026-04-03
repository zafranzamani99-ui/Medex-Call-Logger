# Medex Call Logger — V2 Improvements Plan

## Dashboard (`app/(app)/page.tsx`)

### 1. Per-Agent Stats
- Show today's calls broken down by agent (e.g. zafran: 5, sarah: 3)
- Small bar or row of chips under the existing stats bar
- Data already available — just group `tickets` by `created_by_name` where `created_at` is today

### 2. Today's Activity Feed
- List of today's calls/tickets below charts — like a shift log
- Shows what everyone did today at a glance (no need to go to History and filter)
- Reuse the same card style as History page
- Already fetching all tickets — just filter by today's date

### 3. Match Open Ticket Cards to History Style
- Add caller phone (emerald, after ticket ref)
- Highlighted agent name (blue chip)
- MTN badge after clinic name
- Status badge on the right side next to flags

---

## History (`app/(app)/tickets/page.tsx`)

### 4. Search by Phone Number
- Currently can only filter by logged-by, status, issue type, date
- Add ability to search/filter by `caller_tel` — useful when checking missed calls

---

## Settings (`app/(app)/settings/page.tsx`)

### 5. Agent Activity Summary
- Show each agent's total calls this week/month
- Simple table: Agent | Today | This Week | This Month

---

## Log Call (`app/(app)/log/page.tsx`)

### 6. Recent Calls Quick View
- Small section showing last 3-5 calls logged by the current agent
- Helps avoid duplicate entries and gives context

---

## AI — Knowledge Base Auto-Generation (Gemini)

### 9. Auto-Generate KB from Resolved Tickets
- **Trigger**: When agent changes ticket status to "Resolved"
- **Input**: `issue_type`, `issue`, `my_response`, `next_step` from the ticket
- **AI does**: Gemini rewrites into a clean, professional, step-by-step KB article
  - Clear issue title
  - Structured fix with numbered steps
  - Straight to the point, no fluff
- **Output**: Saved to `knowledge_base` table with `status = 'draft'` and `source_ticket_id`
- **Agent review**: KB page shows drafts with a "Publish" / "Edit" / "Discard" option
- **Flow**:
  1. Agent resolves ticket → toast: "AI is generating KB article..."
  2. API route `/api/generate-kb` calls Gemini with prompt + ticket data
  3. Result saved as draft → agent sees it in KB page under "AI Drafts" tab
  4. Agent reviews → publish (makes it available to all) or discard

### Implementation
- **API route**: `app/api/generate-kb/route.ts` — server-side Gemini call
- **ENV**: `GEMINI_API_KEY` in `.env.local`
- **Trigger point**: ticket detail page, when status changes to "Resolved"
- **KB page update**: Add draft/published filter, publish button on drafts
- **DB**: Already has `status` (draft/published) and `source_ticket_id` columns (migration 011)

---

## General

### 7. Export Today's Report
- One-click button on dashboard to export today's calls as CSV/PDF
- For end-of-day reporting to management

### 8. Notification Sound
- Optional audio ping when a new ticket comes in via real-time subscription
- Useful when agents have the dashboard open but aren't looking at it
