/**
 * Tests for src/pages/api/search.ts
 *
 * The Astro API route exports a POST handler that:
 *   1. Validates the incoming JSON body's `query` field
 *   2. Calls the XFYUN embedding API to get a vector embedding
 *   3. Calls Supabase RPC `search_resources` with the embedding
 *   4. Returns formatted results with rank, similarity (as float), etc.
 *
 * Mocking strategy:
 *   - @supabase/supabase-js is mocked so no real DB connection is made
 *   - global.fetch is replaced per test to control XFYUN API responses
 *   - import.meta.env values are undefined in the test environment, which is
 *     acceptable since all network calls are mocked
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js before importing the module under test.
// vi.hoisted() ensures these variables are available inside the vi.mock factory
// even though vi.mock is hoisted to the top of the file.
// ---------------------------------------------------------------------------
const { mockRpc, mockCreateClient } = vi.hoisted(() => {
  const mockRpc = vi.fn();
  const mockCreateClient = vi.fn(() => ({ rpc: mockRpc }));
  return { mockRpc, mockCreateClient };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}));

// ---------------------------------------------------------------------------
// Import the handler after mocks are registered
// ---------------------------------------------------------------------------
import { POST } from '../src/pages/api/search.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock successful XFYUN embedding response */
function makeEmbeddingResponse(embedding: number[] = [0.1, 0.2, 0.3]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: [{ embedding }] }),
    text: async () => '',
  };
}

/** Build a Request-like object with a JSON body */
function makeRequest(body: unknown): { request: Request } {
  return {
    request: new Request('http://localhost/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  };
}

/** Parse a Response body as JSON */
async function parseBody(response: Response): Promise<unknown> {
  return response.json();
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------
let originalFetch: typeof global.fetch;

beforeEach(() => {
  originalFetch = global.fetch;
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

// ===========================================================================
// Input validation
// ===========================================================================
describe('POST /api/search — input validation', () => {
  it('returns 400 when the request body has no query field', async () => {
    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
    const body = await parseBody(response);
    expect((body as { error: string }).error).toMatch(/query is required/i);
  });

  it('returns 400 when query is an empty string', async () => {
    const response = await POST(makeRequest({ query: '' }));

    expect(response.status).toBe(400);
    const body = await parseBody(response);
    expect((body as { error: string }).error).toMatch(/query is required/i);
  });

  it('returns 400 when query is whitespace only', async () => {
    const response = await POST(makeRequest({ query: '   ' }));

    expect(response.status).toBe(400);
    const body = await parseBody(response);
    expect((body as { error: string }).error).toMatch(/query is required/i);
  });

  it('returns 400 when query is not a string (boolean)', async () => {
    const response = await POST(makeRequest({ query: true }));

    expect(response.status).toBe(400);
    const body = await parseBody(response);
    expect((body as { error: string }).error).toMatch(/query is required/i);
  });

  it('returns 400 when query is null', async () => {
    const response = await POST(makeRequest({ query: null }));

    expect(response.status).toBe(400);
    const body = await parseBody(response);
    expect((body as { error: string }).error).toMatch(/query is required/i);
  });

  it('returns 400 when query is a number', async () => {
    const response = await POST(makeRequest({ query: 123 }));

    expect(response.status).toBe(400);
    const body = await parseBody(response);
    expect((body as { error: string }).error).toMatch(/query is required/i);
  });

  it('returns JSON content-type on 400 error', async () => {
    const response = await POST(makeRequest({}));

    expect(response.headers.get('Content-Type')).toBe('application/json');
  });
});

// ===========================================================================
// Successful search flow
// ===========================================================================
describe('POST /api/search — successful results', () => {
  it('returns 200 with formatted results for a valid query', async () => {
    const embedding = [0.5, 0.6, 0.7];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse(embedding));
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'res-1',
          title: 'Vitest Docs',
          url: 'https://vitest.dev',
          description: 'Testing framework',
          category: 'testing',
          tags: ['vitest', 'testing'],
          similarity: 0.95,
          featured: false,
        },
      ],
    });

    const response = await POST(makeRequest({ query: 'vitest' }));

    expect(response.status).toBe(200);
    const body = await parseBody(response) as { query: string; total: number; results: unknown[] };
    expect(body.query).toBe('vitest');
    expect(body.total).toBe(1);
    expect(body.results).toHaveLength(1);
  });

  it('trims whitespace from the query before processing', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: [] });

    const response = await POST(makeRequest({ query: '  react  ' }));
    const body = await parseBody(response) as { query: string };

    expect(body.query).toBe('react');

    // Verify that the trimmed value was sent to the embedding API
    const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body);
    expect(requestBody.input).toEqual(['react']);
  });

  it('returns correct field mapping for each result', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'full-1',
          title: 'Node.js',
          url: 'https://nodejs.org',
          description: 'JavaScript runtime',
          category: 'runtime',
          tags: ['node', 'js'],
          similarity: 0.88,
          featured: true,
        },
      ],
    });

    const response = await POST(makeRequest({ query: 'node' }));
    const body = await parseBody(response) as { results: Record<string, unknown>[] };
    const result = body.results[0];

    expect(result.rank).toBe(1);
    expect(result.id).toBe('full-1');
    expect(result.title).toBe('Node.js');
    expect(result.url).toBe('https://nodejs.org');
    expect(result.description).toBe('JavaScript runtime');
    expect(result.category).toBe('runtime');
    expect(result.tags).toEqual(['node', 'js']);
    expect(result.featured).toBe(true);
    expect(result.similarity).toBeCloseTo(0.88);
  });

  it('assigns sequential ranks starting from 1', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({
      data: [
        { id: 'a', title: 'A', url: '', description: '', category: '', tags: [], similarity: 0.9, featured: false },
        { id: 'b', title: 'B', url: '', description: '', category: '', tags: [], similarity: 0.8, featured: false },
        { id: 'c', title: 'C', url: '', description: '', category: '', tags: [], similarity: 0.7, featured: false },
      ],
    });

    const response = await POST(makeRequest({ query: 'ranking' }));
    const body = await parseBody(response) as { results: { rank: number }[] };

    expect(body.results[0].rank).toBe(1);
    expect(body.results[1].rank).toBe(2);
    expect(body.results[2].rank).toBe(3);
  });

  it('returns empty results when supabase RPC returns null', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: null });

    const response = await POST(makeRequest({ query: 'no results' }));
    const body = await parseBody(response) as { query: string; results: unknown[] };

    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
  });

  it('returns empty results when supabase RPC returns empty array', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: [] });

    const response = await POST(makeRequest({ query: 'empty results' }));
    const body = await parseBody(response) as { total?: number; results: unknown[] };

    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
  });

  it('defaults null tags to empty array', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({
      data: [{ id: 'z', title: 'Z', url: '', description: '', category: '', tags: null, similarity: 0.5, featured: false }],
    });

    const response = await POST(makeRequest({ query: 'null tags' }));
    const body = await parseBody(response) as { results: { tags: unknown[] }[] };

    expect(body.results[0].tags).toEqual([]);
  });

  it('converts similarity to a float number', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({
      data: [{ id: 'w', title: 'W', url: '', description: '', category: '', tags: [], similarity: '0.7654', featured: false }],
    });

    const response = await POST(makeRequest({ query: 'float similarity' }));
    const body = await parseBody(response) as { results: { similarity: number }[] };

    expect(typeof body.results[0].similarity).toBe('number');
    expect(body.results[0].similarity).toBeCloseTo(0.7654);
  });

  it('response has Content-Type application/json on success', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: [] });

    const response = await POST(makeRequest({ query: 'content type check' }));

    expect(response.headers.get('Content-Type')).toBe('application/json');
  });
});

// ===========================================================================
// Embedding API (XFYUN) integration
// ===========================================================================
describe('POST /api/search — embedding API', () => {
  it('calls the XFYUN embeddings endpoint with the correct structure', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse([0.1]));
    mockRpc.mockResolvedValueOnce({ data: [] });

    await POST(makeRequest({ query: 'test embedding' }));

    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];

    expect(url).toContain('/embeddings');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['Authorization']).toMatch(/^Bearer /);
  });

  it('sends the correct model name in the embedding request', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: [] });

    await POST(makeRequest({ query: 'model check' }));

    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.model).toBe('xop3qwen8bembedding');
  });

  it('wraps query in an array as the `input` field of the embedding request', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: [] });

    await POST(makeRequest({ query: 'input array check' }));

    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.input).toEqual(['input array check']);
  });

  it('passes the embedding vector to supabase RPC', async () => {
    const embedding = [0.11, 0.22, 0.33, 0.44];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse(embedding));
    mockRpc.mockResolvedValueOnce({ data: [] });

    await POST(makeRequest({ query: 'passthrough' }));

    expect(mockRpc).toHaveBeenCalledWith('search_resources', {
      query_embedding: embedding,
      match_count: 10,
    });
  });

  it('always passes match_count of 10 to supabase', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: [] });

    await POST(makeRequest({ query: 'match count' }));

    const rpcArgs = mockRpc.mock.calls[0];
    expect(rpcArgs[1].match_count).toBe(10);
  });

  it('returns 500 when XFYUN API returns non-ok status', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    });

    const response = await POST(makeRequest({ query: 'rate limited' }));
    const body = await parseBody(response) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/embedding error 429/i);
  });

  it('returns 500 when fetch throws a network error', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const response = await POST(makeRequest({ query: 'network down' }));
    const body = await parseBody(response) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe('ECONNREFUSED');
  });
});

// ===========================================================================
// Supabase RPC error handling
// ===========================================================================
describe('POST /api/search — supabase RPC errors', () => {
  it('returns 500 when supabase RPC throws an error', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockRejectedValueOnce(new Error('Connection timeout'));

    const response = await POST(makeRequest({ query: 'db error' }));
    const body = await parseBody(response) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe('Connection timeout');
  });

  it('creates a new supabase client on each request', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeEmbeddingResponse())
      .mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    await POST(makeRequest({ query: 'first request' }));
    await POST(makeRequest({ query: 'second request' }));

    expect(mockCreateClient).toHaveBeenCalledTimes(2);
  });

  it('returns 500 with json content-type on error', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Error'));

    const response = await POST(makeRequest({ query: 'error content-type' }));

    expect(response.status).toBe(500);
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });
});

// ===========================================================================
// Boundary / regression cases
// ===========================================================================
describe('POST /api/search — boundary cases', () => {
  it('handles a single-character query without errors', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: [] });

    const response = await POST(makeRequest({ query: 'z' }));

    expect(response.status).toBe(200);
    const body = await parseBody(response) as { query: string };
    expect(body.query).toBe('z');
  });

  it('handles unicode / non-ASCII characters in the query', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: [] });

    const response = await POST(makeRequest({ query: '机器学习框架' }));
    const body = await parseBody(response) as { query: string };

    expect(response.status).toBe(200);
    expect(body.query).toBe('机器学习框架');
  });

  it('handles results with many items and preserves order', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `id-${i}`,
      title: `Title ${i}`,
      url: `https://example.com/${i}`,
      description: '',
      category: '',
      tags: [],
      similarity: 1 - i * 0.05,
      featured: i === 0,
    }));

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: items });

    const response = await POST(makeRequest({ query: 'many results' }));
    const body = await parseBody(response) as { total: number; results: { rank: number; id: string }[] };

    expect(body.total).toBe(10);
    body.results.forEach((result, idx) => {
      expect(result.rank).toBe(idx + 1);
      expect(result.id).toBe(`id-${idx}`);
    });
  });

  it('the null-data branch does not include `total` in response — regression guard', async () => {
    // When results is null, the route returns { query, results: [] } without `total`
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(makeEmbeddingResponse());
    mockRpc.mockResolvedValueOnce({ data: null });

    const response = await POST(makeRequest({ query: 'null check' }));
    const body = await parseBody(response) as Record<string, unknown>;

    // The null-data path returns { query, results: [] } without a total field
    expect('total' in body).toBe(false);
    expect(body.results).toEqual([]);
    expect(body.query).toBe('null check');
  });
});