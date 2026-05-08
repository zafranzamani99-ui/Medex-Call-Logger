-- 082: Invoice Number + Description for admin payment tracking
-- WHY: Admin (clerk) logs AR/MTN/Label calls — needs invoice number and a
-- general description. Issue + Response are optional for admin workflow.
--
-- Run this in Supabase SQL Editor (after migration 081).

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;
