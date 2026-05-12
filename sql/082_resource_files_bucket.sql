-- 082: Storage bucket for resource file uploads (.bat, .cmd, .ps1, .sh, .txt)
-- Run in Supabase SQL Editor

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resource-files',
  'resource-files',
  true,
  2097152,
  ARRAY['application/octet-stream', 'application/x-bat', 'application/x-msdos-program', 'application/bat', 'text/plain', 'text/x-sh', 'text/x-shellscript']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload resource files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'resource-files');

CREATE POLICY "Authenticated users can delete resource files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'resource-files');

CREATE POLICY "Public read access for resource files"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'resource-files');
