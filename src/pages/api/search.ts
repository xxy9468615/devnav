import { createClient } from '@supabase/supabase-js';

const XFYUN_URL = import.meta.env.XFYUN_BASE_URL || 'https://maas-api.cn-huabei-1.xf-yun.com/v2';
const XFYUN_KEY = import.meta.env.XFYUN_API_KEY;
const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.SUPABASE_SERVICE_KEY;

async function getEmbedding(text) {
  const res = await fetch(`${XFYUN_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${XFYUN_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'xop3qwen8bembedding', input: [text] }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

export async function POST({ request }) {
  try {
    // Auth check
    const auth = request.headers.get('x-api-key');
    const API_KEY = import.meta.env.SEARCH_API_KEY;
    if (API_KEY && auth !== API_KEY) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { query } = await request.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Generate query embedding
    const embedding = await getEmbedding(query.trim());

    // 2. Vector search via Supabase REST API
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      realtime: { enabled: false },
    });

    const { data: results } = await supabase.rpc('search_resources', {
      query_embedding: embedding,
      match_count: 10,
    });

    if (!results) {
      return new Response(JSON.stringify({ query, results: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Format and return
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

    return new Response(JSON.stringify({ query: query.trim(), total: formatted.length, results: formatted }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Search error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
