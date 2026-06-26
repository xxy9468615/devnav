const CUSTOM_REPO_URL = 'https://raw.githubusercontent.com/xxy9468615/-ABC/main/custom.json';

async function syncCustomResources() {
  console.log('[custom] Fetching from -ABC repo...');
  try {
    const res = await fetch(CUSTOM_REPO_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const resources = await res.json();
    console.log(`[custom] Found ${resources.length} resources`);

    const now = new Date().toISOString();
    const rows = resources.map(r => ({
      ...r,
      updated_at: now,
      last_checked: now,
      is_alive: true,
    }));

    const { error } = await supabase
      .from('resources')
      .upsert(rows, { onConflict: 'id' });

    if (error) console.error('[custom] Upsert error:', error.message);
    else console.log(`[custom] Upserted ${rows.length} resources`);
  } catch (err) {
    console.error('[custom] Failed:', err.message);
  }
}

const awesomeLists = [
  ['awesome-selfhosted', 'https://raw.githubusercontent.com/awesome-selfhosted/awesome-selfhosted/master/README.md'],
];

const rssFeeds = [
  ['Hacker News', 'https://hnrss.org/frontpage?count=30'],
];

async function main() {
  console.log('=== DevNav Data Fetch ===');
  console.log(`Time: ${new Date().toISOString()}\n`);

  await syncFreeForDev(supabase);
  await syncBlog(supabase);
  await syncCustomResources();

  for (const [name, url] of awesomeLists) {
    const resources = await fetchAwesomeList(name, url);
    await upsertResources(resources);
  }

  for (const [name, url] of rssFeeds) {
    const resources = await fetchRSS(name, url);
    await upsertResources(resources);
  }

  await cleanupOldCommunity();

  console.log('\n=== Done ===');
}

main().catch(console.error);
