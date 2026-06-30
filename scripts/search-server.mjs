#!/usr/bin/env node
/**
 * devnav-search — HTTP server for semantic resource search
 * Deploy to your Node.js server
 *
 * Run: node --env-file .env scripts/search-server.mjs
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY, XFYUN_BASE_URL, XFYUN_API_KEY
 */

import express from 'express';

const app = express();
const PORT = process.env.PORT || 3721;

app.use(express.json({ limit: '1mb' }));

// --- Config ---
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

// --- Helpers ---
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

async function doSearch(query, limit) {
  const embedding = await getEmbedding(query);
  const { data: results } = await supabase.rpc('search_resources', {
    query_embedding: embedding,
    match_count: limit,
  });
  if (!results) return [];
  return results.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    title: r.title,
    url: r.url,
    description: (r.description || '').slice(0, 120),
    category: r.category,
    tags: r.tags || [],
    similarity: parseFloat(r.similarity),
    featured: r.featured,
  }));
}

// --- Routes ---

// MCP SSE endpoint
app.get('/mcp', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write('event: endpoint\n');
  res.write(`data: ${req.protocol}://${req.get('host')}/mcp/messages\n\n`);

  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);
  req.on('close', () => clearInterval(keepAlive));
});

// MCP message handler
app.post('/mcp/messages', async (req, res) => {
  const { jsonrpc, method, params, id } = req.body;

  try {
    let result;

    switch (method) {
      case 'initialize': {
        result = {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'devnav-search', version: '1.0.0' },
        };
        break;
      }

      case 'tools/list': {
        result = {
          tools: [{
            name: 'search_resources',
            description: 'Semantic search devnav developer resources.',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search keywords, e.g. "免费图床", "React 部署", "AI API"' },
                limit: { type: 'number', description: 'Number of results (default 10, max 20)', default: 10 },
              },
              required: ['query'],
            },
          }],
        };
        break;
      }

      case 'tools/call': {
        const { name, arguments: args } = params;
        if (name === 'search_resources') {
          const query = args.query?.trim();
          if (!query) throw new Error('query is required');
          const limit = Math.min(args.limit || 10, 20);
          const results = await doSearch(query, limit);
          result = {
            content: [{ type: 'text', text: JSON.stringify({ query, total: results.length, results }, null, 2) }],
          };
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }
        break;
      }

      default:
        throw new Error(`Unknown method: ${method}`);
    }

    res.json({ jsonrpc: '2.0', result, id });
  } catch (err) {
    res.json({ jsonrpc: '2.0', error: { code: -32600, message: err.message }, id });
  }
});

// REST endpoints
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
    const results = await doSearch(q, matchCount);
    res.json({ query: q, total: results.length, results });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`devnav-search running on http://0.0.0.0:${PORT}`);
  console.log(`  MCP:   http://0.0.0.0:${PORT}/mcp`);
  console.log(`  REST:  http://0.0.0.0:${PORT}/search`);
  console.log(`  Health: http://0.0.0.0:${PORT}/health`);
});
