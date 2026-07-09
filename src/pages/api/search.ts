import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.SUPABASE_SERVICE_KEY;

// Remote embedding/rerank worker — offloads iFlytek inference off Vercel.
const EMBED_WORKER_URL = import.meta.env.EMBED_WORKER_URL || 'https://embed-worker-production.up.railway.app';
// The embed-worker runs on Railway's private network and does NOT validate this header
// (no inbound auth). Passing it through is harmless and future-proofs enabling auth later.
const EMBED_WORKER_API_KEY = import.meta.env.EMBED_WORKER_API_KEY;

// Pull this many candidates from the vector search, then rerank down to `limit`.
const RERANK_CANDIDATES = 20;

async function workerEmbed(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${EMBED_WORKER_URL}/embed`, {
    method: 'POST',
    headers: {
      ...(EMBED_WORKER_API_KEY ? { 'Authorization': `Bearer ${EMBED_WORKER_API_KEY}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ texts }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`embed-worker /embed error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.embeddings as number[][];
}

async function workerRerank(query: string, documents: string[]): Promise<number[]> {
  const res = await fetch(`${EMBED_WORKER_URL}/rerank`, {
    method: 'POST',
    headers: {
      ...(EMBED_WORKER_API_KEY ? { 'Authorization': `Bearer ${EMBED_WORKER_API_KEY}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, documents }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`embed-worker /rerank error ${res.status}: ${err}`);
  }

  const data = await res.json();
  // results: [{ index, document, relevance_score }] sorted desc by score
  return (data.results as { index: number; relevance_score: number }[]).map((r) => r.index);
}

async function getQueryEmbedding(text: string): Promise<number[]> {
  const [emb] = await workerEmbed([text]);
  return emb;
}

function buildDoc(r: any): string {
  return [r.title, r.description, r.category, ...(r.tags || [])]
    .filter(Boolean)
    .join(' | ');
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

    const body = await request.json();
    const query = body.query;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const limit = Math.min(parseInt(body.limit, 10) || 10, 20);
    const candidateCount = Math.max(limit, RERANK_CANDIDATES);

    // 1. Generate query embedding (remote worker)
    const embedding = await getQueryEmbedding(query.trim());

    // 2. Vector search via Supabase RPC (cosine similarity candidates)
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      realtime: { enabled: false },
    });

    const { data: candidates } = await supabase.rpc('search_resources', {
      query_embedding: embedding,
      match_count: candidateCount,
    });

    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({ query: query.trim(), results: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Rerank candidates with the remote rerank model (graceful fallback to vector order)
    let ordered = candidates;
    let rerankApplied = true;
    try {
      const docs = candidates.map(buildDoc);
      const rankedIdx = await workerRerank(query.trim(), docs);
      ordered = rankedIdx
        .map((i) => candidates[i])
        .filter(Boolean);
      if (ordered.length === 0) {
        throw new Error('rerank returned no usable indices');
      }
    } catch (err) {
      // Rerank unavailable (worker down / model error) — fall back to vector order
      // but surface it so the failure is observable instead of silent.
      rerankApplied = false;
      console.error('[search] rerank FALLBACK to vector order:', err.message);
      ordered = candidates;
    }

    const top = ordered.slice(0, limit);

    // 4. Format and return — x-rerank header makes rerank health observable to callers/metrics
    const formatted = top.map((r, i) => ({
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

    return new Response(
      JSON.stringify({ query: query.trim(), total: formatted.length, results: formatted }),
      {
        headers: {
          'Content-Type': 'application/json',
          'x-rerank': rerankApplied ? 'applied' : 'fallback',
        },
      }
    );

  } catch (err) {
    console.error('Search error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
