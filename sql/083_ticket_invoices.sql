-- 083: Multiple invoices per ticket (JSONB)
-- WHY: Admin tracks multiple invoices per call, each with its own amount.
-- amount_hutang stays as the running balance (sum of invoices - collected).
--
-- Run this in Supabase SQL Editor (after migration 082).

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS invoices JSONB DEFAULT '[]';

-- Migrate existing single-invoice data into the new JSONB array
UPDATE tickets
SET invoices = jsonb_build_array(
  jsonb_build_object('invoice_number', invoice_number, 'amount', amount_hutang)
)
WHERE invoice_number IS NOT NULL
  AND invoice_number != ''
  AND (amount_hutang IS NOT NULL AND amount_hutang > 0);
