#!/usr/bin/env node
/**
 * devnav-search — HTTP server for semantic resource search
 *
 * Run: node --env-file .env scripts/search-server.mjs
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY, XFYUN_BASE_URL, XFYUN_API_KEY
 */

import express from 'express';

const app = express();
const PORT = process.env.PORT || 3721;

app.use(express.json({ limit: '1mb' }));

const XFYUN_URL = process.env.XFYUN_BASE_URL || 'https://maas-api.cn-huabei-1.xf-yun.com/v2';
const XFYUN_KEY = process.env.XFYUN_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const EMBED_MODEL = 'xop3qwen8bembedding';

if (!SUPABASE_URL || !SUPABASE_KEY || !XFYUN_KEY) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_KEY, XFYUN_API_KEY');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { enabled: false },
});

async function getEmbedding(text) {
  const res = await fetch(`${XFYUN_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${XFYUN_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: [text] }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'devnav-search' });
});

app.post('/search', async (req, res) => {
  try {
    const { query, limit = 10 } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'query is required (string)' });
    }

    const q = query.trim();
    const matchCount = Math.min(limit, 20);

    const embedding = await getEmbedding(q);

    const { data: results } = await supabase.rpc('search_resources', {
      query_embedding: embedding,
      match_count: matchCount,
    });

    if (!results) {
      return res.json({ query: q, total: 0, results: [] });
    }

    const formatted = results.map((r, i) => ({
      rank: i + 1,
      id: r.id,
      title: r.title,
      url: r.url,
      description: r.description,
      category: r.category,
      tags: r.tags || [],
      similarity: parseFloat(r.similarity),
      featured: r.featured,
    }));

    res.json({ query: q, total: formatted.length, results: formatted });

  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`devnav-search running on http://0.0.0.0:${PORT}`);
});
