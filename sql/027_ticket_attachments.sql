-- 027: Add attachment_urls column to tickets for image attachments
-- Run this in Supabase SQL Editor

-- 1. Add column for image URLs (array of text)
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS attachment_urls TEXT[] DEFAULT '{}';

-- 2. Create storage bucket for ticket attachments
-- Run this separately in Supabase Dashboard > Storage > New Bucket:
--   Name: ticket-attachments
--   Public: ON (images need public read access)
--   File size limit: 5MB
--   Allowed MIME types: image/png, image/jpeg, image/jpg
--
-- Or via SQL:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-attachments',
  'ticket-attachments',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/jpg']
) ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies — authenticated users can upload, anyone can read (public bucket)
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ticket-attachments');

CREATE POLICY "Authenticated users can delete own attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ticket-attachments');

CREATE POLICY "Public read access for attachments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'ticket-attachments');
