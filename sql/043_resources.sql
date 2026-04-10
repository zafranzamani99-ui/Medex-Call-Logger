-- Migration 043: Resources table for team link management
-- WHY: Central hub for OneDrive links to system versions, DB files, templates, SOPs, etc.
-- No Supabase storage needed — just URLs. Admins manage, support staff consume.

CREATE TABLE resources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'System Versions',
    'Database Files',
    'Templates',
    'SOPs & Guides',
    'Training',
    'Tools & Utilities'
  )),
  tags TEXT[] DEFAULT '{}',
  version TEXT,
  is_pinned BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_by_name TEXT NOT NULL,
  updated_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read resources"
  ON resources FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert resources"
  ON resources FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update resources"
  ON resources FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete resources"
  ON resources FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX idx_resources_category ON resources(category);
CREATE INDEX idx_resources_pinned ON resources(is_pinned DESC, updated_at DESC);
CREATE INDEX idx_resources_tags ON resources USING GIN(tags);
