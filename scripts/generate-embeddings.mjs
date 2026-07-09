#!/usr/bin/env node
/**
 * Generate embeddings for all resources using iFlytek Spark.
 * Model: xop3qwen8bembedding (1024-dim)
 * Concurrency: 10 parallel requests
 *
 * Run with: node --env-file .env scripts/generate-embeddings.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const EMBED_WORKER_URL = process.env.EMBED_WORKER_URL || 'https://embed-worker-production.up.railway.app';
const EMBED_WORKER_API_KEY = process.env.EMBED_WORKER_API_KEY;
const XFYUN_MODEL = 'xop3qwen8bembedding';
const CONCURRENCY = 10;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { enabled: false },
});

async function getEmbedding(text) {
  const res = await fetch(`${EMBED_WORKER_URL}/embed`, {
    method: 'POST',
    headers: {
      ...(EMBED_WORKER_API_KEY ? { 'Authorization': `Bearer ${EMBED_WORKER_API_KEY}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ texts: [text] }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`embed-worker ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.embeddings[0];
}

function buildResourceText(r) {
  return [r.title, r.description, r.category, ...(r.tags || [])]
    .filter(Boolean)
    .join(' | ');
}

// Process items with concurrency limit
async function processItems(items) {
  const results = [];
  let processed = 0, errors = 0;

  const process = async (item) => {
    const text = buildResourceText(item);
    if (!text.trim()) {
      console.warn(`  Skip empty: ${item.id}`);
      return { id: item.id, embedding: null, skipped: true };
    }

    try {
      const embedding = await getEmbedding(text);
      return { id: item.id, embedding, model: XFYUN_MODEL, skipped: false };
    } catch (err) {
      console.error(`  ❌ ${item.id}: ${err.message}`);
      return { id: item.id, embedding: null, error: err.message, skipped: false };
    }
  };

  // Run in batches of CONCURRENCY
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(batch.map(process));

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        const r = result.value;
        if (r.skipped) continue;
        if (r.error) { errors++; continue; }
        results.push({ id: r.id, embedding: r.embedding, model: r.model });
        processed++;
      } else {
        errors++;
      }
    }

    // Batch upsert to Supabase
    if (results.length > 0) {
      const { error: e } = await supabase
        .from('resource_embeddings')
        .upsert(results);

      if (e) console.error(`  ❌ Upsert error: ${e.message}`);
      results.length = 0; // clear batch
    }

    const total = i + batch.length;
    if (total % 100 === 0 || total === items.length) {
      console.log(`  ${total}/${items.length} (${processed} ok, ${errors} err)`);
    }
  }

  return { processed, errors };
}

async function main() {
  console.log('Fetching all resources...');

  let allResources = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('resources')
      .select('id, title, description, category, tags')
      .range(offset, offset + pageSize - 1);

    if (error) { console.error('Fetch error:', error); process.exit(1); }
    if (!data || data.length === 0) break;
    allResources = allResources.concat(data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`Total: ${allResources.length} resources`);

  // Check table exists
  const { error: colError } = await supabase
    .from('resource_embeddings').select('id').limit(1);

  if (colError) {
    console.error('\n❌ Missing table: resource_embeddings');
    console.log('Run in Supabase SQL Editor:');
    console.log('\n  CREATE EXTENSION IF NOT EXISTS vector;\n');
    console.log('  CREATE TABLE IF NOT EXISTS resource_embeddings (');
    console.log('    id TEXT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,');
    console.log('    embedding vector(1024) NOT NULL,');
    console.log('    model TEXT NOT NULL DEFAULT \'xop3qwen8bembedding\',');
    console.log('    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),');
    console.log('    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
    console.log('  );');
    console.log('  CREATE INDEX IF NOT EXISTS resource_embeddings_idx');
    console.log('    ON resource_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);\n');
    process.exit(1);
  }

  console.log(`Starting embedding generation (concurrency: ${CONCURRENCY})...\n`);

  const { processed, errors } = await processItems(allResources);

  console.log(`\n✅ Done. ${processed} processed, ${errors} errors`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
