import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY || '';

// Lightweight Supabase REST client — no WebSocket dependency
function createRestClient(url: string, key: string) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  return {
    from(table: string) {
      let _select = '*';
      let _filters: string[] = [];
      let _order: string | null = null;
      let _ascending = true;
      let _limit: number | null = null;
      let _range: [number, number] | null = null;

      const builder: any = {
        select(cols: string) { _select = cols; return builder; },
        eq(col: string, val: any) { _filters.push(`${col}=eq.${val}`); return builder; },
        lt(col: string, val: string) { _filters.push(`${col}=lt.${val}`); return builder; },
        in(col: string, vals: string[]) { _filters.push(`${col}=in.(${vals.join(',')})`); return builder; },
        order(col: string, opts?: { ascending?: boolean }) { _order = col; _ascending = opts?.ascending ?? true; return builder; },
        limit(n: number) { _limit = n; return builder; },
        range(from: number, to: number) { _range = [from, to]; return builder; },
        async upsert(rows: any[], opts?: { onConflict?: string }) {
          const resp = await fetch(`${url}/rest/v1/${table}${opts?.onConflict ? `?on_conflict=${opts.onConflict}` : ''}`, {
            method: 'POST',
            headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
            body: JSON.stringify(rows),
          });
          if (!resp.ok) return { data: null, error: { message: await resp.text() } };
          return { data: await resp.json(), error: null };
        },
        async update(vals: any) {
          const params = new URLSearchParams();
          _filters.forEach(f => { const [k, v] = f.split('='); params.set(k, v); });
          const resp = await fetch(`${url}/rest/v1/${table}?${params}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(vals),
          });
          if (!resp.ok) return { data: null, error: { message: await resp.text() } };
          return { data: await resp.json(), error: null };
        },
        async delete() {
          const params = new URLSearchParams();
          _filters.forEach(f => { const [k, v] = f.split('='); params.set(k, v); });
          const resp = await fetch(`${url}/rest/v1/${table}?${params}`, { method: 'DELETE', headers });
          if (!resp.ok) return { data: null, error: { message: await resp.text() } };
          return { data: null, error: null };
        },
        async then(resolve: any) {
          const params = new URLSearchParams();
          params.set('select', _select);
          _filters.forEach(f => { const [k, v] = f.split('='); params.set(k, v); });
          if (_order) params.set('order', `${_order}.${_ascending ? 'asc' : 'desc'}`);
          if (_limit) params.set('limit', String(_limit));
          if (_range) {
            const resp = await fetch(`${url}/rest/v1/${table}?${params}`, {
              headers: { ...headers, Range: `${_range[0]}-${_range[1]}` },
            });
            if (!resp.ok) return resolve({ data: null, error: { message: await resp.text() } });
            return resolve({ data: await resp.json(), error: null });
          }
          if (_limit) params.set('limit', String(_limit));
          const resp = await fetch(`${url}/rest/v1/${table}?${params}`, { headers });
          if (!resp.ok) return resolve({ data: null, error: { message: await resp.text() } });
          return resolve({ data: await resp.json(), error: null });
        },
      };
      return builder;
    },
  };
}

let supabase: any = null;

try {
  if (supabaseUrl && supabaseKey) {
    supabase = createRestClient(supabaseUrl, supabaseKey);
  }
} catch (err) {
  console.error('[supabase] Failed to initialize client:', err);
}

export { supabase };
export type { SupabaseClient };
