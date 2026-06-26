import { supabase } from '../lib/supabase';

export async function GET() {
  const url = process.env.PUBLIC_SUPABASE_URL || 'NOT SET';
  const key = process.env.PUBLIC_SUPABASE_ANON_KEY || 'NOT SET';
  const clientExists = !!supabase;

  let data: any = null;
  let error: any = null;

  if (supabase) {
    const result = await supabase
      .from('resources')
      .select('id, title, source')
      .eq('is_alive', true)
      .limit(3);
    data = result.data;
    error = result.error;
  }

  return new Response(JSON.stringify({
    supabaseUrl: url.substring(0, 30) + '...',
    keyPrefix: key.substring(0, 15) + '...',
    clientExists,
    dataCount: data?.length ?? 0,
    sample: data?.map((r: any) => r.title),
    error: error?.message || null,
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}
