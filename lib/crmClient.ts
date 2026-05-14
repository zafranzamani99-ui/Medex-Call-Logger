import { createClient } from '@supabase/supabase-js'

export const crmSupabase = createClient(
  process.env.CRM_SUPABASE_URL!,
  process.env.CRM_SUPABASE_KEY!
)
