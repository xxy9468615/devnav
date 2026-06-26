/**
 * Fetch all external data sources and upsert into Supabase.
 * Run with: node scripts/fetch-all.mjs
 *
 * Requires env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { syncFreeForDev } from './sync-free-for-dev.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 12);
}

function parseMarkdownLinks(markdown) {
  const resources = [];
  let currentCategory = 'uncategorized';

  for (const line of markdown.split('\n')) {
    const headingMatch = line.match(/^#{2,3}\s+(.+)/);
    if (headingMatch) {
      const raw = headingMatch[1].replace(/[📒🔬🌐💰📧🖥️]/g, '').trim();
      if (raw.toLowerCase().includes('table of contents')) continue;
      if (raw.toLowerCase().includes('translation')) continue;
      currentCategory = raw;
      continue;
    }

    const linkMatch = line.match(/\*\s+\[([^\]]+)\]\(([^)]+)\)(?:\s*[\-–—:]\s*(.+))?/);
    if (linkMatch) {
      const [, title, url, description] = linkMatch;
      if (url.startsWith('http')) {
        resources.push({
          id: md5(url),
          title: title.trim(),
          url: url.trim(),
          description: (description || '').trim().replace(/\*+/g, '').slice(0, 300),
          category: categorize(currentCategory),
          tags: extractTags(title, currentCategory),
          source: 'awesome',
          icon: `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`,
          featured: false,
        });
      }
    }
  }
  return resources;
}

function categorize(heading) {
  const h = heading.toLowerCase();
  if (h.includes('cloud') || h.includes('hosting') || h.includes('paas')) return 'devops';
  if (h.includes('source') || h.includes('repo') || h.includes('ci') || h.includes('cd')) return 'devops';
  if (h.includes('dns') || h.includes('domain')) return 'devops';
  if (h.includes('api') || h.includes('bbs') || h.includes('data')) return 'backend';
  if (h.includes('database') || h.includes('db') || h.includes('storage')) return 'database';
  if (h.includes('email') || h.includes('mail')) return 'backend';
  if (h.includes('font') || h.includes('icon') || h.includes('design') || h.includes('color') || h.includes('ui')) return 'design';
  if (h.includes('learn') || h.includes('course') || h.includes('tutorial') || h.includes('education')) return 'learning';
  if (h.includes('security') || h.includes('auth') || h.includes('ssl')) return 'security';
  if (h.includes('monitor') || h.includes('analytics') || h.includes('log')) return 'devops';
  if (h.includes('search') || h.includes('tool') || h.includes('utility')) return 'productivity';
  if (h.includes('ai') || h.includes('ml') || h.includes('machine') || h.includes('llm')) return 'ai-ml';
  if (h.includes('free') || h.includes('open source')) return 'free-services';
  return 'free-services';
}

function extractTags(title, category) {
  const tags = [];
  const t = title.toLowerCase();
  if (t.includes('docker')) tags.push('docker');
  if (t.includes('kubernetes') || t.includes('k8s')) tags.push('kubernetes');
  if (t.includes('aws')) tags.push('aws');
  if (t.includes('google') || t.includes('gcp')) tags.push('gcp');
  if (t.includes('azure')) tags.push('azure');
  if (t.includes('react')) tags.push('react');
  if (t.includes('vue')) tags.push('vue');
  if (t.includes('node')) tags.push('nodejs');
  if (t.includes('python')) tags.push('python');
  if (t.includes('rust')) tags.push('rust');
  if (t.includes('go ') || t.includes('golang')) tags.push('go');
  if (t.includes('ai') || t.includes('ml')) tags.push('ai');
  if (t.includes('open source') || t.includes('open-source')) tags.push('open-source');
  if (t.includes('free')) tags.push('free');
  return tags.slice(0, 5);
}

async function fetchAwesomeList(name, url) {
  console.log(`Fetching ${name}...`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const markdown = await res.text();
    const resources = parseMarkdownLinks(markdown);
    console.log(`  Parsed ${resources.length} resources from ${name}`);
    return resources;
  } catch (err) {
    console.error(`  Failed to fetch ${name}: ${err.message}`);
    return [];
  }
}

async function fetchRSS(name, url) {
  console.log(`Fetching RSS: ${name}...`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1];
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
      const link = item.match(/<link>(.*?)<\/link>/);
      const desc = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/s);

      if (title && link) {
        const titleText = (title[1] || title[2] || '').trim();
        const linkText = (link[1] || '').trim();
        const descText = (desc?.[1] || desc?.[2] || '').replace(/<[^>]+>/g, '').trim().slice(0, 300);

        if (linkText.startsWith('http')) {
          items.push({
            id: md5(linkText),
            title: titleText,
            url: linkText,
            description: descText,
            category: 'community',
            tags: [name.toLowerCase(), 'community'],
            source: 'community',
            icon: `https://www.google.com/s2/favicons?domain=${new URL(linkText).hostname}&sz=32`,
            featured: false,
          });
        }
      }
    }
    console.log(`  Got ${items.length} items from ${name}`);
    return items;
  } catch (err) {
    console.error(`  Failed to fetch ${name}: ${err.message}`);
    return [];
  }
}

async function upsertResources(resources) {
  if (resources.length === 0) return;

  const batchSize = 100;
  for (let i = 0; i < resources.length; i += batchSize) {
    const batch = resources.slice(i, i + batchSize).map(r => ({
      ...r,
      updated_at: new Date().toISOString(),
      last_checked: new Date().toISOString(),
      is_alive: true,
    }));

    const { error } = await supabase
      .from('resources')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`  Upsert error (batch ${i}):`, error.message);
    }
  }
}

async function cleanupOldCommunity() {
  console.log('Cleaning up old community posts (>7 days)...');
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('resources')
    .delete()
    .eq('source', 'community')
    .lt('updated_at', sevenDaysAgo);

  if (error) console.error('  Cleanup error:', error.message);
  else console.log('  Done.');
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
