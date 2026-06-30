#!/usr/bin/env node
/**
 * Incremental embedding sync — only generate embeddings for resources
 * that don't have one yet. Safe to run repeatedly (idempotent).
 *
 * Designed for GitHub Actions cron. Uses env vars directly (no .env file).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, XFYUN_BASE_URL, XFYUN_API_KEY
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const XFYUN_URL = process.env.XFYUN_BASE_URL || 'https://maas-api.cn-huabei-1.xf-yun.com/v2';
const XFYUN_KEY = process.env.XFYUN_API_KEY;
const XFYUN_MODEL = 'xop3qwen8bembedding';
const CONCURRENCY = 10;

if (!SUPABASE_URL || !SUPABASE_KEY || !XFYUN_KEY) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_KEY, XFYUN_API_KEY');
  process.exit(1);
}

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
    body: JSON.stringify({ model: XFYUN_MODEL, input: [text] }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`iFlytek ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

function buildResourceText(r) {
  return [r.title, r.description, r.category, ...(r.tags || [])]
    .filter(Boolean)
    .join(' | ');
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
  console.log(`Total resources: ${allResources.length}`);

  // Fetch existing embedding ids to find missing
  let existingIds = new Set();
  let embOffset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('resource_embeddings')
      .select('id')
      .range(embOffset, embOffset + pageSize - 1);
    if (error) { console.error('Embeddings fetch error:', error); process.exit(1); }
    if (!data || data.length === 0) break;
    data.forEach(r => existingIds.add(r.id));
    if (data.length < pageSize) break;
    embOffset += pageSize;
  }
  console.log(`Existing embeddings: ${existingIds.size}`);

  const todo = allResources.filter(r => !existingIds.has(r.id));
  console.log(`Missing embeddings: ${todo.length}`);

  if (todo.length === 0) {
    console.log('✅ All resources have embeddings. Nothing to do.');
    return;
  }

  let processed = 0, errors = 0;
  const batch = [];

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const chunk = todo.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map(async (item) => {
      const text = buildResourceText(item);
      if (!text.trim()) return { id: item.id, embedding: null, skipped: true };
      const embedding = await getEmbedding(text);
      return { id: item.id, embedding, model: XFYUN_MODEL, skipped: false };
    }));

    for (const r of results) {
      if (r.status !== 'fulfilled') { errors++; continue; }
      const v = r.value;
      if (v.skipped) continue;
      if (!v.embedding) { errors++; continue; }
      batch.push({ id: v.id, embedding: v.embedding, model: v.model });
      processed++;
    }

    if (batch.length > 0) {
      const { error: e } = await supabase.from('resource_embeddings').upsert(batch);
      if (e) console.error(`  Upsert error: ${e.message}`);
      batch.length = 0;
    }

    const total = i + chunk.length;
    if (total % 100 === 0 || total === todo.length) {
      console.log(`  ${total}/${todo.length} (${processed} ok, ${errors} err)`);
    }
  }

  console.log(`\n✅ Done. ${processed} new embeddings, ${errors} errors`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
