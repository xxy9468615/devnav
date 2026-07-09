#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const EMBED_WORKER_URL = process.env.EMBED_WORKER_URL || 'https://embed-worker-production.up.railway.app';
const EMBED_WORKER_API_KEY = process.env.EMBED_WORKER_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { enabled: false } });

async function workerEmbed(texts) {
  const res = await fetch(`${EMBED_WORKER_URL}/embed`, {
    method: 'POST',
    headers: { ...(EMBED_WORKER_API_KEY ? { Authorization: `Bearer ${EMBED_WORKER_API_KEY}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
  });
  if (!res.ok) throw new Error(`embed-worker /embed ${res.status}: ${await res.text()}`);
  return (await res.json()).embeddings;
}

async function workerRerank(query, documents) {
  const res = await fetch(`${EMBED_WORKER_URL}/rerank`, {
    method: 'POST',
    headers: { ...(EMBED_WORKER_API_KEY ? { Authorization: `Bearer ${EMBED_WORKER_API_KEY}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, documents }),
  });
  if (!res.ok) throw new Error(`embed-worker /rerank ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.results || []).map((r) => r.index);
}

function buildDoc(r) {
  return [r.title, r.description, r.category, ...(r.tags || [])].filter(Boolean).join(' | ');
}

async function test() {
  const query = '免费图床';
  const [embedding] = await workerEmbed([query]);
  console.log(`Embedding: ${embedding.length}-dim`);

  // 1. Vector recall (top 20 candidates)
  const { data: candidates, error } = await supabase.rpc('search_resources', {
    query_embedding: embedding,
    match_count: 20,
  });
  if (error) throw error;
  if (!candidates || candidates.length === 0) {
    console.log('No candidates returned.');
    return;
  }
  console.log(`\nVector candidates: ${candidates.length}`);

  // 2. Rerank candidates with the worker
  let reranked = candidates;
  let usedRerank = false;
  try {
    const idx = await workerRerank(query, candidates.map(buildDoc));
    reranked = idx.map((i) => candidates[i]).filter(Boolean);
    usedRerank = true;
  } catch (e) {
    console.error(`Rerank failed (fallback to vector order): ${e.message}`);
  }

  console.log(`Rerank: ${usedRerank ? 'APPLIED' : 'FALLBACK'}\n`);
  console.log('Top 5 (reranked):');
  reranked.slice(0, 5).forEach((r, i) =>
    console.log(`  ${i + 1}. ${(r.similarity * 100).toFixed(1)}% | ${r.title} | ${r.category}`)
  );

  if (usedRerank && candidates.length >= 2) {
    const before = candidates[0]?.title;
    const after = reranked[0]?.title;
    console.log(`\n#1 changed by rerank: ${before !== after ? 'YES' : 'no'} (was "${before}", now "${after}")`);
  }
}

test().catch((e) => { console.error(e); process.exit(1); });
