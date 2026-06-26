/**
 * Sync blog posts from ahome.cyou into Supabase.
 * Filters by tags AND title/description keywords.
 *
 * Run standalone:  node scripts/sync-blog.mjs
 * Run via fetch-all: imported and called from fetch-all.mjs
 *
 * Requires env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const BLOG_URL = 'https://www.ahome.cyou/blog';

// Tags to pull from blog → DevNav category
const TAG_FILTER = {
  'free': 'free-services',
  'free api': 'free-services',
  'free tools': 'free-services',
  'tools': 'productivity',
  'developer tools': 'productivity',
  'ai gateway': 'ai-ml',
  'ai translation': 'ai-ml',
  'siliconflow': 'ai-ml',
  'vercel': 'devops',
  'domains': 'devops',
  'mcp': 'productivity',
  'browser extension': 'frontend',
};

// Keywords in title/description to match → DevNav category
const KEYWORD_FILTER = [
  { keywords: ['免费', 'free', '白嫖', '薅羊毛', '0元'], category: 'free-services' },
  { keywords: ['工具', 'tool', '神器', '效率', '效率提升'], category: 'productivity' },
  { keywords: ['ai', 'gpt', 'claude', '大模型', 'llm', 'deepseek', 'openai', 'gemini'], category: 'ai-ml' },
  { keywords: ['部署', 'deploy', 'vercel', 'netlify', 'railway', 'fly.io', 'cloudflare'], category: 'devops' },
  { keywords: ['vps', '服务器', 'server', 'hosting', '域名', 'domain'], category: 'devops' },
  { keywords: ['数据库', 'database', 'supabase', 'postgres', 'redis'], category: 'database' },
  { keywords: ['设计', 'design', 'ui', 'ux', 'figma', '配色'], category: 'design' },
  { keywords: ['安全', 'security', 'ssl', '证书', '认证'], category: 'security' },
  { keywords: ['前端', 'frontend', 'react', 'vue', 'astro', 'next.js', 'css'], category: 'frontend' },
  { keywords: ['后端', 'backend', 'api', 'node', 'python', 'rust', 'go '], category: 'backend' },
  { keywords: ['学习', 'learn', '教程', 'tutorial', 'course', '课程'], category: 'learning' },
  { keywords: ['插件', 'plugin', '扩展', 'extension', 'chrome', '浏览器'], category: 'frontend' },
  { keywords: ['翻译', 'translate', 'immersive'], category: 'productivity' },
  { keywords: ['npm', 'github', '开源', 'open source'], category: 'devops' },
];

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 12);
}

/**
 * Parse blog page HTML to extract post cards.
 * Returns array of { title, url, description, tags }
 */
function parseBlogPage(html) {
  const posts = [];

  const sections = html.split(/(?=<a[^>]*href="\/blog\/)/i);

  for (const section of sections) {
    const linkMatch = section.match(/href="(\/blog\/[^"]+)"/i);
    if (!linkMatch) continue;

    const titleMatch = section.match(/<h[23][^>]*>([^<]+)<\/h[23]>/i);
    if (!titleMatch) continue;

    const url = 'https://www.ahome.cyou' + linkMatch[1];
    const title = titleMatch[1].trim();

    const descMatch = section.match(/<p[^>]*>([^<]+)<\/p>/i);
    const description = descMatch ? descMatch[1].trim() : '';

    const tagMatches = [...section.matchAll(/#[\s]*([A-Za-z一-鿿][\w\s]*)/gi)];
    const tags = tagMatches.map(m => m[1].trim().toLowerCase());

    posts.push({ title, url, description, tags });
  }

  return posts;
}

/**
 * Match blog post to DevNav category by tags AND title/description keywords
 */
function matchCategory(post) {
  // First check tags
  for (const tag of post.tags) {
    const normalized = tag.toLowerCase();
    if (TAG_FILTER[normalized]) {
      return TAG_FILTER[normalized];
    }
  }

  // Then check keywords in title + description
  const text = `${post.title} ${post.description}`.toLowerCase();
  for (const { keywords, category } of KEYWORD_FILTER) {
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        return category;
      }
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

  // Build resources
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
