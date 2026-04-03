-- 029: Add image_urls column to knowledge_base for screenshot references
-- WHY: When AI generates KB drafts from tickets with attached screenshots,
-- we store the image URLs so agents can see the original screenshots in KB articles.
-- Run this in Supabase SQL Editor

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';
