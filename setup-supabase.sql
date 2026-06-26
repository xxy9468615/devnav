-- DevNav: Create resources table in Supabase
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS resources (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  url           TEXT NOT NULL UNIQUE,
  description   TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'uncategorized',
  tags          TEXT[] NOT NULL DEFAULT '{}',
  source        TEXT NOT NULL,
  icon          TEXT,
  featured      BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  last_checked  TIMESTAMPTZ DEFAULT now(),
  is_alive      BOOLEAN DEFAULT true
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category);
CREATE INDEX IF NOT EXISTS idx_resources_source ON resources(source);
CREATE INDEX IF NOT EXISTS idx_resources_tags ON resources USING GIN(tags);

-- RLS: public read, service-role write
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

-- Allow anonymous reads (for the frontend)
CREATE POLICY "public read" ON resources FOR SELECT USING (true);

-- Allow service-role writes (for the fetch script)
CREATE POLICY "service write" ON resources FOR ALL USING (true) WITH CHECK (true);
