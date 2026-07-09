-- Vector similarity search function
CREATE OR REPLACE FUNCTION search_resources(
  query_embedding vector(1024),
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id text, title text, url text, description text,
  category text, tags text[], source text, icon text,
  featured boolean, similarity float
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id, r.title, r.url, r.description, r.category, r.tags,
    r.source, r.icon, r.featured,
    1 - (re.embedding <=> query_embedding) AS similarity
  FROM resources r
  JOIN resource_embeddings re ON r.id = re.id
  ORDER BY re.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;
