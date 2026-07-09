-- Upgrade resource_embeddings 768 -> 1024 dims by dropping and recreating the table.
-- pgvector locks dimension per value; 768-vec rows can't be cast in place, so we
-- drop the whole table and recreate it at 1024, then re-embed all rows (Step 2).
CREATE EXTENSION IF NOT EXISTS vector;

DROP TABLE IF EXISTS resource_embeddings;

CREATE TABLE resource_embeddings (
  id TEXT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
  embedding vector(1024) NOT NULL,
  model TEXT NOT NULL DEFAULT 'xop3qwen8bembedding',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX resource_embeddings_idx
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

-- After Step 2 (re-embed) finishes, run from SQL Editor:
--   ANALYZE resource_embeddings;
--   -- optional, only if search ever errors with "index not trained":
--   -- REINDEX INDEX resource_embeddings_idx;
