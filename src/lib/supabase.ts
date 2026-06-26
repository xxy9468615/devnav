import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY || '';

// Lightweight Supabase REST client — no WebSocket dependency
function createRestClient(url: string, key: string) {
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  return {
    from(table: string) {
      let _select = '*';
      const _filters: Array<[string, string]> = []; // [col, "op.value"]
      let _order: string | null = null;
      let _ascending = true;
      let _range: [number, number] | null = null;

      const builder: any = {
        select(cols: string) { _select = cols; return builder; },
        eq(col: string, val: any) { _filters.push([col, `eq.${val}`]); return builder; },
        lt(col: string, val: string) { _filters.push([col, `lt.${val}`]); return builder; },
        in(col: string, vals: string[]) { _filters.push([col, `in.(${vals.join(',')})`]); return builder; },
        order(col: string, opts?: { ascending?: boolean }) { _order = col; _ascending = opts?.ascending ?? true; return builder; },
        limit() { return builder; }, // ignored, range handles it
        range(from: number, to: number) { _range = [from, to]; return builder; },

        async upsert(rows: any[], opts?: { onConflict?: string }) {
          const endpoint = opts?.onConflict
            ? `${url}/rest/v1/${table}?on_conflict=${opts.onConflict}`
            : `${url}/rest/v1/${table}`;
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
            body: JSON.stringify(rows),
          });
          if (!resp.ok) return { data: null, error: { message: await resp.text() } };
          return { data: await resp.json(), error: null };
        },

        async update(vals: any) {
          const params = new URLSearchParams();
          _filters.forEach(([col, op]) => params.set(col, op));
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
          _filters.forEach(([col, op]) => params.set(col, op));
          const resp = await fetch(`${url}/rest/v1/${table}?${params}`, { method: 'DELETE', headers });
          if (!resp.ok) return { data: null, error: { message: await resp.text() } };
          return { data: null, error: null };
        },

        then(resolve: any) {
          const params = new URLSearchParams();
          params.set('select', _select);
          _filters.forEach(([col, op]) => params.set(col, op));
          if (_order) params.set('order', `${_order}.${_ascending ? 'asc' : 'desc'}`);

          const reqHeaders: Record<string, string> = { ...headers };
          if (_range) reqHeaders.Range = `${_range[0]}-${_range[1]}`;

          fetch(`${url}/rest/v1/${table}?${params}`, { headers: reqHeaders })
            .then(async (resp) => {
              if (!resp.ok) return resolve({ data: null, error: { message: await resp.text() } });
              return resolve({ data: await resp.json(), error: null });
            })
            .catch((err) => resolve({ data: null, error: { message: err.message } }));
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
