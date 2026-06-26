  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: { enabled: false },
  });