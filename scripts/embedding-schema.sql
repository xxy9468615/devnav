-- Create resource_embeddings table
-- Separate from resources table to avoid schema bloat

CREATE TABLE IF NOT EXISTS resource_embeddings (
  id TEXT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
  embedding vector(1024) NOT NULL,
  model TEXT NOT NULL DEFAULT 'xop3qwen8bembedding',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IVFFlat index for cosine similarity
CREATE INDEX IF NOT EXISTS resource_embeddings_idx
  ON resource_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_resource_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS resource_embeddings_updated_at ON resource_embeddings;
CREATE TRIGGER resource_embeddings_updated_at
  BEFORE UPDATE ON resource_embeddings
  FOR EACH ROW EXECUTE FUNCTION update_resource_embeddings_updated_at();

-- Verify
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'resource_embeddings'
ORDER BY ordinal_position;
