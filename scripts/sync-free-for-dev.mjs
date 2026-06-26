/**
 * Sync free-for-dev list into Supabase.
 * Handles both standard entries and nested cloud provider entries.
 *
 * Run standalone:  node scripts/sync-free-for-dev.mjs
 * Run via fetch-all: imported and called from fetch-all.mjs
 *
 * Requires env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const RAW_URL = 'https://raw.githubusercontent.com/ripienaar/free-for-dev/master/README.md';

// --- Complete 57 → 11 category mapping ---

const CATEGORY_MAP = {
  'Major Cloud Providers':                        'devops',
  'Cloud management solutions':                   'devops',
  'Analytics, Events and Statistics':             'backend',
  'APIs, Data, and ML':                           'ai-ml',
  'Artifact Repos':                               'devops',
  'BaaS':                                         'backend',
  'Low-code Platform':                            'productivity',
  'CDN and Protection':                           'devops',
  'CI and CD':                                    'devops',
  'CMS':                                          'frontend',
  'Code Generation':                              'ai-ml',
  'Code Quality':                                 'productivity',
  'Code Search and Browsing':                     'productivity',
  'Crash and Exception Handling':                 'devops',
  'Data Visualization on Maps':                   'design',
  'Managed Data Services':                        'database',
  'Design and UI':                                'design',
  'Dev Blogging Sites':                           'learning',
  'DNS':                                          'devops',
  'Docker Related':                               'devops',
  'Domain':                                       'devops',
  'Education and Career Development':             'learning',
  'Email':                                        'backend',
  'Feature Toggles Management Platforms':         'backend',
  'Font':                                         'design',
  'Forms':                                        'frontend',
  'Generative AI':                                'ai-ml',
  'IaaS':                                         'devops',
  'IDE and Code Editing':                         'productivity',
  'International Mobile Number Verification API and SDK': 'backend',
  'Issue Tracking and Project Management':        'productivity',
  'Log Management':                               'devops',
  'Mobile App Distribution and Feedback Management System': 'productivity',
  'Messaging and Streaming':                      'backend',
  'Miscellaneous':                                'free-services',
  'Monitoring':                                   'devops',
  'PaaS':                                         'devops',
  'Package Build System':                         'devops',
  'Payment and Billing Integration':             'backend',
  'Privacy Management':                           'security',
  'Screenshot APIs':                              'productivity',
  'Flutter Related and Building IOS Apps without Mac': 'frontend',
  'Search':                                       'productivity',
  'Security and PKI':                             'security',
  'Authentication, Authorization, and User Management': 'security',
  'Source Code Repos':                            'devops',
  'Storage and Media Processing':                 'database',
  'Tunneling, WebRTC, Web Socket Servers and Other Routers': 'backend',
  'Testing':                                      'productivity',
  'Tools for Teams and Collaboration':            'productivity',
  'Translation Management':                       'productivity',
  'Visitor Session Recording':                    'productivity',
  'Web Hosting':                                  'devops',
  'Commenting Platforms':                         'frontend',
  'Browser based hardware emulation':             'devops',
  'Remote Desktop Tools':                         'productivity',
  'Other Free Resources':                         'free-services',
};

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 12);
}

function mapCategory(rawHeading) {
  if (CATEGORY_MAP[rawHeading]) return CATEGORY_MAP[rawHeading];

  const h = rawHeading.toLowerCase();
  if (h.includes('cloud') || h.includes('hosting') || h.includes('paas') || h.includes('iaas')) return 'devops';
  if (h.includes('ai') || h.includes('ml') || h.includes('generative')) return 'ai-ml';
  if (h.includes('database') || h.includes('data service') || h.includes('storage')) return 'database';
  if (h.includes('security') || h.includes('auth') || h.includes('pki')) return 'security';
  if (h.includes('design') || h.includes('ui') || h.includes('font')) return 'design';
  if (h.includes('monitor') || h.includes('log')) return 'devops';
  if (h.includes('test')) return 'productivity';
  if (h.includes('learn') || h.includes('education')) return 'learning';
  return 'free-services';
}

function extractTags(title, heading) {
  const tags = [];
  const combined = `${title} ${heading}`.toLowerCase();

  const TAG_KEYWORDS = {
    'docker': 'docker', 'kubernetes': 'kubernetes', 'k8s': 'kubernetes',
    'aws': 'aws', 'amazon': 'aws', 'google cloud': 'gcp', 'gcp': 'gcp',
    'azure': 'azure', 'microsoft': 'azure', 'react': 'react', 'vue': 'vue',
    'node': 'nodejs', 'python': 'python', 'rust': 'rust', 'go ': 'go',
    'golang': 'go', 'java': 'java', 'kotlin': 'kotlin', 'swift': 'swift',
    'flutter': 'flutter', 'firebase': 'firebase', 'supabase': 'supabase',
    'graphql': 'graphql', 'rest': 'rest-api', 'api': 'api',
    'cdn': 'cdn', 'ssl': 'ssl', 'dns': 'dns', 'git': 'git',
    'linux': 'linux', 'serverless': 'serverless', 'edge': 'edge',
    'ai': 'ai', 'ml': 'ai', 'llm': 'ai', 'open source': 'open-source',
    'free': 'free', 'saas': 'saas', 'paas': 'paas', 'cms': 'cms',
  };

  for (const [keyword, tag] of Object.entries(TAG_KEYWORDS)) {
    if (combined.includes(keyword) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }

  const headingLower = heading.toLowerCase();
  if (headingLower.includes('cloud') && !tags.includes('cloud')) tags.push('cloud');
  if (headingLower.includes('security') && !tags.includes('security')) tags.push('security');

  return tags.slice(0, 5);
}

export function parseFreeForDev(markdown) {
  const resources = [];
  let currentHeading = '';
  let currentParent = null;

  const lines = markdown.split('\n');

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)/);
    if (headingMatch) {
      currentHeading = headingMatch[1].replace(/\s*⬆️.*$/, '').trim();
      currentParent = null;
      continue;
    }

    if (!currentHeading) continue;

    const nestedMatch = line.match(/^\s{4}\*\s+(?:(?:\[([^\]]+)\]\(([^)]+)\))|([^\-\[]+?))\s*[\-–—:]\s*(.+)/);
    if (nestedMatch && currentParent) {
      const name = (nestedMatch[1] || nestedMatch[3] || '').trim();
      const childUrl = nestedMatch[2] || null;
      const desc = (nestedMatch[4] || '').trim().replace(/\*+/g, '').slice(0, 300);

      if (!name) continue;

      const title = `${currentParent.title} - ${name}`;
      const url = childUrl || currentParent.url;
      const id = md5(url + name);

      resources.push({
        id,
        title,
        url: childUrl || `${currentParent.url}#${name.toLowerCase().replace(/\s+/g, '-')}`,
        description: desc,
        category: mapCategory(currentHeading),
        tags: extractTags(name, currentHeading),
        source: 'free-for-dev',
        icon: `https://www.google.com/s2/favicons?domain=${new URL(childUrl || currentParent.url).hostname}&sz=32`,
        featured: false,
      });
      continue;
    }

    const standardMatch = line.match(/^\s{2}\*\s+\[([^\]]+)\]\(([^)]+)\)\s*(?:[\-–—:]\s*(.+))?/);
    if (standardMatch) {
      const [, title, url, description] = standardMatch;
      if (!url.startsWith('http')) continue;

      if (!description) {
        currentParent = { title: title.trim(), url: url.trim() };
        continue;
      }

      const entry = {
        id: md5(url),
        title: title.trim(),
        url: url.trim(),
        description: description.trim().replace(/\*+/g, '').replace(/<[^>]+>/g, '').slice(0, 300),
        category: mapCategory(currentHeading),
        tags: extractTags(title, currentHeading),
        source: 'free-for-dev',
        icon: `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`,
        featured: false,
      };

      resources.push(entry);
      currentParent = entry;
      continue;
    }

    if (line.trim() && !line.startsWith('#')) {
      currentParent = null;
    }
  }

  return resources;
}

async function fetchFreeForDev() {
  console.log('[free-for-dev] Fetching from GitHub...');
  const res = await fetch(RAW_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const markdown = await res.text();
  console.log(`[free-for-dev] Downloaded ${(markdown.length / 1024).toFixed(0)} KB`);

  const resources = parseFreeForDev(markdown);
  console.log(`[free-for-dev] Parsed ${resources.length} resources`);

  const cats = {};
  for (const r of resources) cats[r.category] = (cats[r.category] || 0) + 1;
  console.log('[free-for-dev] Category distribution:', cats);

  return resources;
}

export async function syncFreeForDev(supabase) {
  const resources = await fetchFreeForDev();
  if (resources.length === 0) {
    console.log('[free-for-dev] No resources parsed, skipping sync');
    return { added: 0, updated: 0, removed: 0, total: 0 };
  }

  const { data: existingRows, error: fetchErr } = await supabase
    .from('resources')
    .select('id, url')
    .eq('source', 'free-for-dev');

  if (fetchErr) {
    console.error('[free-for-dev] Error fetching existing rows:', fetchErr.message);
  }

  const existingMap = new Map((existingRows || []).map(r => [r.url, r.id]));
  const currentUrls = new Set(resources.map(r => r.url));

  const BATCH_SIZE = 100;
  let upserted = 0;
  for (let i = 0; i < resources.length; i += BATCH_SIZE) {
    const batch = resources.slice(i, i + BATCH_SIZE).map(r => ({
      ...r,
      updated_at: new Date().toISOString(),
      last_checked: new Date().toISOString(),
      is_alive: true,
    }));

    const { error } = await supabase
      .from('resources')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`[free-for-dev] Upsert error (batch ${i}):`, error.message);
    } else {
      upserted += batch.length;
    }
  }

  const removedUrls = [...existingMap.keys()].filter(url => !currentUrls.has(url));
  let removed = 0;
  if (removedUrls.length > 0) {
    for (let i = 0; i < removedUrls.length; i += BATCH_SIZE) {
      const batch = removedUrls.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('resources')
        .update({ is_alive: false, updated_at: new Date().toISOString() })
        .eq('source', 'free-for-dev')
        .in('url', batch);

      if (error) {
        console.error(`[free-for-dev] Mark-remove error:`, error.message);
      } else {
        removed += batch.length;
      }
    }
  }

  const added = resources.filter(r => !existingMap.has(r.url)).length;
  const updated = upserted - added;

  console.log(`[free-for-dev] Sync complete: ${added} added, ${updated} updated, ${removed} removed, ${resources.length} total`);

  return { added, updated, removed, total: resources.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log('=== DevNav free-for-dev Sync ===');
  console.log(`Time: ${new Date().toISOString()}\n`);

  syncFreeForDev(supabase)
    .then(() => console.log('\n=== Done ==='))
    .catch(err => {
      console.error('Fatal:', err);
      process.exit(1);
    });
}
