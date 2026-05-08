# Admin Feature — Next Direction (Nice-to-Have)

Items deferred from the current sprint. Not blocking, but improve admin workflow quality.

## 1. Ticket Detail Edit Mode — Category Filtering for Admin

Currently, edit mode shows ALL issue categories. Admin's log form restricts to AR/MTN/Label/Hardware. Consider applying the same filtering in edit mode so admin doesn't accidentally re-categorise to a non-admin category.

**Scope**: `app/(app)/tickets/[id]/page.tsx` — the edit-mode category pills section (uses `ISSUE_CATEGORIES` directly instead of `ADMIN_ONLY_CATEGORIES`).

**Risk**: Low. Edit mode is for corrections — admin might legitimately need all categories on existing tickets logged by support agents.

## 2. My Log — Per-Invoice Breakdown in Attention Box

Currently My Log shows total outstanding per ticket (e.g. "Outstanding: RM 3,500"). Could show the individual invoices underneath for quick reference without opening the ticket.

**Scope**: `app/(app)/my-log/page.tsx` — the attention box that lists unresolved tickets with outstanding amounts.

## 3. Admin-Only Visibility on Ticket Detail

Currently `invoice_number` (now `invoices` JSONB) and `description` fields are visible to ALL roles on the ticket detail page (when values exist). Consider restricting display to admin/administrator only if these are sensitive.

**Decision**: Kept visible to all for now — transparency helps the whole team know context. Revisit if admin requests privacy.

## 4. Per-Invoice Collection Tracking

Currently collections (Amount Collected in follow-ups) subtract from the total outstanding. There's no way to mark which specific invoice a payment is against. For advanced tracking:

- Add `invoice_index` or `invoice_number` to `timeline_entries.amount_collected` context
- UI: dropdown in Add Update to pick which invoice the payment applies to
- Each invoice tracks its own remaining balance

**Complexity**: Medium. Requires schema change + UI for per-invoice selection.

## 5. Outstanding Filter on History Page

The Outstanding column is now visible but there's no filter for it. Admin may want:
- "Show only tickets with outstanding > 0"
- Sort by outstanding amount (already implemented via column header sort)

**Scope**: Add a `HeaderFilter` or a quick-filter toggle on the History page.

## 6. CSV Export with Invoice Data

No CSV export exists for tickets. When added, ensure it includes:
- `amount_hutang` (outstanding balance)
- `invoices` (formatted as comma-separated list: "INV-001: RM 500, INV-002: RM 1,000")
- `description`

---

*Last updated: 08/05/2026*
