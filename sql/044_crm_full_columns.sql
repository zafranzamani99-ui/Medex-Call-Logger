-- Migration 044: Add all missing Excel CRM columns + custom columns support
-- These columns mirror the full Excel CRM file (48 columns total).
-- Custom columns use JSONB for user-defined fields.

-- ── 26 missing Excel CRM columns ──

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS cloud_start text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS cloud_end text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS m1g_dealer_case text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS pass_to_dealer text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS product text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS signed_up text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS cms_running_no text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS clinic_group text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS company_reg text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS remark_additional_pc text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS customer_cert_no text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS cms_install_date text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS address1 text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS address3 text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS address4 text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS contact_tel text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS race text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS invoice_no text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS billing_address text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS account_manager text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS info text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS clinic_type text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS einv_no_reason text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS status_renewal text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS remarks_followup text;

-- ── Custom columns support ──

-- JSONB column for arbitrary user-defined data
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS custom_data jsonb DEFAULT '{}';

-- Team-shared custom column definitions
CREATE TABLE IF NOT EXISTS crm_custom_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_key text UNIQUE NOT NULL,
  column_name text NOT NULL,
  column_type text NOT NULL DEFAULT 'text',
  display_order int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_custom_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_custom_cols" ON crm_custom_columns
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_custom_cols" ON crm_custom_columns
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_custom_cols" ON crm_custom_columns
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "auth_delete_custom_cols" ON crm_custom_columns
  FOR DELETE TO authenticated USING (true);
