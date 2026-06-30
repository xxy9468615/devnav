/**
 * Sync blog posts from ahome.cyou into Supabase.
 * Filters by tags (primary) AND title keywords (fallback).
 * Excludes test/intro/rant posts via EXCLUDE_TAGS.
 *
 * Run standalone:  node scripts/sync-blog.mjs
 * Run via fetch-all: imported and called from fetch-all.mjs
 *
 * Requires env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const BLOG_URL = 'https://www.ahome.cyou/blog';

// Tags pulled from blog /tags/ links → DevNav category.
// Site主打免费资源库 → free-services 是主力桶。
const TAG_FILTER = {
  // 免费/白嫖 → free-services（站主推）
  'free': 'free-services',
  'free api': 'free-services',
  'free tools': 'free-services',
  'domains': 'free-services',
  'hosting': 'free-services',
  'static hosting': 'free-services',
  'php': 'free-services',
  'cloud': 'free-services',
  'vps': 'free-services',

  // AI 类 → ai-ml
  'ai': 'ai-ml',
  'ai gateway': 'ai-ml',
  'ai translation': 'ai-ml',
  'siliconflow': 'ai-ml',
  'stepfun': 'ai-ml',
  'immersive translate': 'ai-ml',

  // 工具/效率 → productivity
  'tools': 'productivity',
  'developer tools': 'productivity',
  'mcp': 'productivity',

  // 部署/运维 → devops
  'vercel': 'devops',
  'npm': 'devops',
};

// Non-resource tags → skip whole post (test/intro/rant junk)
const EXCLUDE_TAGS = new Set([
  'test', 'intro', 'blog', 'rant', 'typography',
  'media', 'markdown', 'images',
]);

// Keyword fallback — title only (description too noisy, e.g. "with AI assistant")
const KEYWORD_FILTER = [
  { keywords: ['免费', 'free', '白嫖', '0元'], category: 'free-services' },
  { keywords: ['ai', 'gpt', 'claude', '大模型', 'llm', 'deepseek', 'openai'], category: 'ai-ml' },
  { keywords: ['vps', '服务器', 'hosting', '域名', 'domain'], category: 'free-services' },
  { keywords: ['mcp', '工具', 'tool'], category: 'productivity' },
];

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 12);
}

// Decode common HTML entities (blog HTML is not pre-decoded)
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/**
 * Parse blog page HTML to extract post cards.
 * Returns array of { title, url, description, tags }
 *
 * Tags are pulled from <a href="/tags/xxx"> links (URL-decoded),
 * NOT from #hashtag text — /tags/ links are the canonical source.
 */
function parseBlogPage(html) {
  const posts = [];

  // Split on the article-card anchor pattern
  const sections = html.split(/(?=<a[^>]*href="\/blog\/[^"]+"[^>]*class="block overflow-hidden)/i);

  for (const section of sections) {
    const linkMatch = section.match(/href="(\/blog\/[^"]+)"/i);
    if (!linkMatch) continue;

    // Title is nested inside <h2>...<a>TEXT</a>...</h2>
    const titleMatch = section.match(/<h2[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/h2>/i);
    if (!titleMatch) continue;

    const url = 'https://www.ahome.cyou' + linkMatch[1];
    const title = decodeEntities(titleMatch[1].trim());

    const descMatch = section.match(/<p[^>]*>([^<]+)<\/p>/i);
    const description = descMatch ? decodeEntities(descMatch[1].trim()) : '';

    const tags = [...new Set(
      [...section.matchAll(/href="\/tags\/([^"]+)"/gi)]
        .map(m => decodeURIComponent(m[1]).trim().toLowerCase())
    )];

    posts.push({ title, url, description, tags });
  }

  return posts;
}

/**
 * Match blog post to DevNav category.
 * Order: exclude-tag (skip) → tag map → keyword fallback (title only)
 */
function matchCategory(post) {
  // 1. Any exclude tag → skip whole post
  if (post.tags.some(t => EXCLUDE_TAGS.has(t))) return null;

  // 2. Tag hit
  for (const tag of post.tags) {
    if (TAG_FILTER[tag]) return TAG_FILTER[tag];
  }

  // 3. Keyword fallback — title only
  const titleLower = post.title.toLowerCase();
  for (const { keywords, category } of KEYWORD_FILTER) {
    for (const kw of keywords) {
      if (titleLower.includes(kw.toLowerCase())) return category;
    }
  }

  return null;
}

export async function syncBlog(supabase) {
  console.log('[blog] Fetching blog posts...');

  const resp = await fetch(BLOG_URL);
  if (!resp.ok) {
    console.error('[blog] Failed to fetch:', resp.status);
    return;
  }

  const html = await resp.text();
  const posts = parseBlogPage(html);

  console.log(`[blog] Found ${posts.length} posts total`);

  // Filter posts with matching tags/keywords
  const matched = [];
  for (const post of posts) {
    const category = matchCategory(post);
    if (category) {
      matched.push({ ...post, category });
    }
  }

  console.log(`[blog] ${matched.length} posts match filter`);

  if (matched.length === 0) return;

  // Build resources — real tags first, 'blog' marker last, cap at 6
  const now = new Date().toISOString();
  const resources = matched.map(post => ({
    id: md5(post.url),
    title: post.title,
    url: post.url,
    description: post.description || `${post.title} - from ahome.cyou blog`,
    category: post.category,
    tags: [...post.tags, 'blog'].slice(0, 6),
    source: 'blog',
    icon: null,
    featured: false,
    updated_at: now,
    is_alive: true,
  }));

  // Query existing blog resources
  const { data: existing } = await supabase
    .from('resources')
    .select('id, url')
    .eq('source', 'blog');

  const existingIds = new Set((existing || []).map(r => r.id));
  const currentIds = new Set(resources.map(r => r.id));

  // Upsert
  const { error } = await supabase
    .from('resources')
    .upsert(resources, { onConflict: 'id' });

  if (error) {
    console.error('[blog] Upsert error:', error.message);
  } else {
    console.log(`[blog] Upserted ${resources.length} resources`);
  }

  // Mark removed
  for (const old of (existing || [])) {
    if (!currentIds.has(old.id)) {
      await supabase
        .from('resources')
        .update({ is_alive: false })
        .eq('id', old.id);
      console.log(`[blog] Marked removed: ${old.url}`);
    }
  }

  console.log(`[blog] Sync complete: ${resources.length} active`);
}

// Standalone execution
if (process.argv[1]?.includes('sync-blog')) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    realtime: { enabled: false },
  });

  await syncBlog(supabase);
}
