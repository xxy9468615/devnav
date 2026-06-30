/**
 * Tests for scripts/search-server.mjs
 *
 * The server module has top-level side effects (process.exit, app.listen,
 * dynamic supabase import) that prevent simple module import. We mock:
 *   - express: to capture registered route handlers without starting a real server
 *   - @supabase/supabase-js: to avoid real database connections
 *   - global.fetch: to control XFYUN embedding API responses
 *
 * The captured handlers are called directly with mock request / response
 * objects so we can assert on the behaviour without any HTTP networking.
 */

import { vi, describe, it, expect, beforeAll, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Captured route handlers and startup state (populated when module is imported)
// ---------------------------------------------------------------------------
let capturedRoutes = {};
let listenCalledWithPort = null;

// ---------------------------------------------------------------------------
// vi.hoisted ensures these variables are initialised before vi.mock factories
// run (vi.mock calls are hoisted to the top of the module by Vitest).
// ---------------------------------------------------------------------------
const { mockRpc, mockCreateClient, mockJsonMiddleware, mockExpressApp } = vi.hoisted(() => {
  const mockRpc = vi.fn();
  const mockCreateClient = vi.fn(() => ({ rpc: mockRpc }));

  // A lightweight stand-in for an Express application that records route
  // registrations instead of starting a real HTTP server.
  const mockExpressApp = {
    use: vi.fn(),
    get: vi.fn((path, handler) => { capturedRoutes[`GET ${path}`] = handler; }),
    post: vi.fn((path, handler) => { capturedRoutes[`POST ${path}`] = handler; }),
    listen: vi.fn((port, cb) => {
      listenCalledWithPort = port;
      cb && cb();
    }),
  };

  const mockJsonMiddleware = vi.fn();

  return { mockRpc, mockCreateClient, mockJsonMiddleware, mockExpressApp };
});

// Mock express — the factory must return the default export (a function that
// returns the app object) AND attach the static .json() helper.
vi.mock('express', () => {
  const expressFn = vi.fn(() => mockExpressApp);
  expressFn.json = vi.fn(() => mockJsonMiddleware);
  return { default: expressFn };
});

// Mock @supabase/supabase-js
vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

// ---------------------------------------------------------------------------
// Module import — this runs all top-level side effects (process.env checks,
// app route registrations, app.listen) using our mocks.
// ---------------------------------------------------------------------------
beforeAll(async () => {
  // Provide required env vars BEFORE the module loads
  vi.stubEnv('SUPABASE_URL', 'http://supabase.test');
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-service-key');
  vi.stubEnv('XFYUN_API_KEY', 'test-xfyun-key');
  vi.stubEnv('XFYUN_BASE_URL', 'http://xfyun.test/v2');
  vi.stubEnv('PORT', '37299');

  // Replace global fetch before the module is loaded
  global.fetch = vi.fn();

  // Dynamically import — this populates capturedRoutes via our mocked app
  await import('../scripts/search-server.mjs');
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake successful XFYUN embedding response */
function makeEmbeddingResponse(embedding = [0.1, 0.2, 0.3]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: [{ embedding }] }),
    text: async () => '',
  };
}

/** Create a minimal mock Express request object */
function mockReq(body = {}) {
  return { body };
}

/** Create a mock Express response object that records calls */
function mockRes() {
  const res = {
    _status: 200,
    _body: null,
    status(code) { this._status = code; return this; },
    json(data) { this._body = data; return this; },
  };
  return res;
}

// ===========================================================================
// Server startup
// ===========================================================================
describe('server startup', () => {
  it('registers a GET /health route', () => {
    expect(capturedRoutes['GET /health']).toBeTypeOf('function');
  });

  it('registers a POST /search route', () => {
    expect(capturedRoutes['POST /search']).toBeTypeOf('function');
  });

  it('calls app.listen with the configured port', () => {
    // listenCalledWithPort is set outside vi.clearAllMocks() scope so it persists
    expect(listenCalledWithPort).not.toBeNull();
  });
});

// ===========================================================================
// GET /health
// ===========================================================================
describe('GET /health', () => {
  it('returns status ok with service name', () => {
    const req = mockReq();
    const res = mockRes();

    capturedRoutes['GET /health'](req, res);

    expect(res._body).toEqual({ status: 'ok', service: 'devnav-search' });
  });
});

// ===========================================================================
// POST /search — input validation
// ===========================================================================
describe('POST /search — input validation', () => {
  it('returns 400 when body has no query field', async () => {
    const req = mockReq({});
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/query is required/i);
  });

  it('returns 400 when query is an empty string', async () => {
    const req = mockReq({ query: '' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/query is required/i);
  });

  it('returns 400 when query is whitespace only', async () => {
    const req = mockReq({ query: '   ' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/query is required/i);
  });

  it('returns 400 when query is a number (non-string)', async () => {
    const req = mockReq({ query: 42 });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/query is required/i);
  });

  it('returns 400 when query is null', async () => {
    const req = mockReq({ query: null });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/query is required/i);
  });
});

// ===========================================================================
// POST /search — successful results
// ===========================================================================
describe('POST /search — successful results', () => {
  it('returns formatted results for a valid query', async () => {
    const embedding = [0.5, 0.6, 0.7];
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse(embedding));
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'res-1',
          title: 'TypeScript Docs',
          url: 'https://typescriptlang.org',
          description: 'Official TS docs',
          category: 'language',
          tags: ['typescript', 'docs'],
          similarity: 0.92,
          featured: true,
        },
      ],
    });

    const req = mockReq({ query: 'typescript' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(res._status).toBe(200);
    expect(res._body.query).toBe('typescript');
    expect(res._body.total).toBe(1);
    expect(res._body.results).toHaveLength(1);

    const first = res._body.results[0];
    expect(first.rank).toBe(1);
    expect(first.id).toBe('res-1');
    expect(first.title).toBe('TypeScript Docs');
    expect(first.url).toBe('https://typescriptlang.org');
    expect(first.similarity).toBeCloseTo(0.92);
    expect(first.featured).toBe(true);
    expect(first.tags).toEqual(['typescript', 'docs']);
  });

  it('trims whitespace from the query before processing', async () => {
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: [] });

    const req = mockReq({ query: '  react  ' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(res._body.query).toBe('react');

    const fetchCall = global.fetch.mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body);
    expect(requestBody.input).toEqual(['react']);
  });

  it('assigns sequential ranks starting from 1', async () => {
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({
      data: [
        { id: 'a', title: 'A', url: '', description: '', category: '', tags: null, similarity: 0.9, featured: false },
        { id: 'b', title: 'B', url: '', description: '', category: '', tags: null, similarity: 0.8, featured: false },
        { id: 'c', title: 'C', url: '', description: '', category: '', tags: null, similarity: 0.7, featured: false },
      ],
    });

    const req = mockReq({ query: 'test' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(res._body.results[0].rank).toBe(1);
    expect(res._body.results[1].rank).toBe(2);
    expect(res._body.results[2].rank).toBe(3);
    expect(res._body.total).toBe(3);
  });

  it('defaults null tags to empty array', async () => {
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({
      data: [{ id: 'x', title: 'X', url: '', description: '', category: '', tags: null, similarity: 0.5, featured: false }],
    });

    const req = mockReq({ query: 'anything' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(res._body.results[0].tags).toEqual([]);
  });

  it('converts similarity to a float number', async () => {
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({
      data: [{ id: 'y', title: 'Y', url: '', description: '', category: '', tags: [], similarity: '0.8765', featured: false }],
    });

    const req = mockReq({ query: 'float test' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(typeof res._body.results[0].similarity).toBe('number');
    expect(res._body.results[0].similarity).toBeCloseTo(0.8765);
  });

  it('returns empty results when supabase RPC returns null', async () => {
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: null });

    const req = mockReq({ query: 'nothing found' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(res._status).toBe(200);
    expect(res._body.total).toBe(0);
    expect(res._body.results).toEqual([]);
  });

  it('returns empty results when supabase RPC returns empty array', async () => {
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: [] });

    const req = mockReq({ query: 'empty' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(res._status).toBe(200);
    expect(res._body.total).toBe(0);
    expect(res._body.results).toEqual([]);
  });
});

// ===========================================================================
// POST /search — limit capping
// ===========================================================================
describe('POST /search — limit capping', () => {
  it('caps limit at 20 when a higher value is provided', async () => {
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: [] });

    const req = mockReq({ query: 'cap test', limit: 100 });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    const rpcCall = mockRpc.mock.calls[0];
    expect(rpcCall[0]).toBe('search_resources');
    expect(rpcCall[1].match_count).toBe(20);
  });

  it('uses the provided limit when within the allowed range', async () => {
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: [] });

    const req = mockReq({ query: 'limit test', limit: 5 });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    const rpcCall = mockRpc.mock.calls[0];
    expect(rpcCall[1].match_count).toBe(5);
  });

  it('defaults to limit 10 when not specified', async () => {
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: [] });

    const req = mockReq({ query: 'default limit' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    const rpcCall = mockRpc.mock.calls[0];
    expect(rpcCall[1].match_count).toBe(10);
  });
});

// ===========================================================================
// POST /search — embedding API (XFYUN)
// ===========================================================================
describe('POST /search — embedding API', () => {
  it('calls the XFYUN embeddings endpoint with correct parameters', async () => {
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse([0.1, 0.2]));
    mockRpc.mockResolvedValueOnce({ data: [] });

    const req = mockReq({ query: 'vector query' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, options] = global.fetch.mock.calls[0];

    expect(url).toContain('/embeddings');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toMatch(/^Bearer /);
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.input).toEqual(['vector query']);
    expect(body.model).toBe('xop3qwen8bembedding');
  });

  it('passes the embedding vector returned by XFYUN to supabase RPC', async () => {
    const embedding = [1, 2, 3, 4, 5];
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse(embedding));
    mockRpc.mockResolvedValueOnce({ data: [] });

    const req = mockReq({ query: 'embedding passthrough' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    const rpcCall = mockRpc.mock.calls[0];
    expect(rpcCall[1].query_embedding).toEqual(embedding);
  });

  it('returns 500 when the XFYUN API returns a non-ok response', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    });

    const req = mockReq({ query: 'embedding failure' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(res._status).toBe(500);
    expect(res._body.error).toMatch(/embedding error 503/i);
  });

  it('returns 500 when the XFYUN API call throws a network error', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network failure'));

    const req = mockReq({ query: 'network error' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(res._status).toBe(500);
    expect(res._body.error).toBe('Network failure');
  });
});

// ===========================================================================
// POST /search — supabase RPC error handling
// ===========================================================================
describe('POST /search — supabase RPC errors', () => {
  it('returns 500 when supabase RPC throws', async () => {
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockRejectedValueOnce(new Error('Supabase RPC failed'));

    const req = mockReq({ query: 'rpc failure' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(res._status).toBe(500);
    expect(res._body.error).toBe('Supabase RPC failed');
  });
});

// ===========================================================================
// POST /search — boundary / regression cases
// ===========================================================================
describe('POST /search — boundary cases', () => {
  it('handles a single-character query', async () => {
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: [] });

    const req = mockReq({ query: 'a' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(res._status).toBe(200);
    expect(res._body.query).toBe('a');
  });

  it('handles a very long query string', async () => {
    const longQuery = 'x'.repeat(2000);
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: [] });

    const req = mockReq({ query: longQuery });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(res._status).toBe(200);
    expect(res._body.query).toBe(longQuery);
  });

  it('returns all expected fields in each result object', async () => {
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'full-id',
          title: 'Full Title',
          url: 'https://example.com',
          description: 'Full description',
          category: 'tools',
          tags: ['tag1', 'tag2'],
          similarity: 0.99,
          featured: true,
        },
      ],
    });

    const req = mockReq({ query: 'full result' });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    const result = res._body.results[0];
    expect(result).toMatchObject({
      rank: 1,
      id: 'full-id',
      title: 'Full Title',
      url: 'https://example.com',
      description: 'Full description',
      category: 'tools',
      tags: ['tag1', 'tag2'],
      featured: true,
    });
    expect(result.similarity).toBeCloseTo(0.99);
  });

  it('limit of exactly 20 is not capped further', async () => {
    global.fetch.mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: [] });

    const req = mockReq({ query: 'boundary limit', limit: 20 });
    const res = mockRes();

    await capturedRoutes['POST /search'](req, res);

    expect(mockRpc.mock.calls[0][1].match_count).toBe(20);
  });
});