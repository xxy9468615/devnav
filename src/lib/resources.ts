import type { Resource, Category } from './types';
import { supabase } from './supabase';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import crypto from 'node:crypto';

function generateId(url: string): string {
  return crypto.createHash('md5').update(url).digest('hex').slice(0, 12);
}

function loadYamlFile(filePath: string): any[] {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) return [];
  const content = fs.readFileSync(fullPath, 'utf-8');
  return (yaml.load(content) as any[]) || [];
}

function parseYamlResource(item: any, source: Resource['source']): Resource {
  return {
    id: generateId(item.url),
    title: item.title || item.name || '',
    url: item.url || '',
    description: item.description || '',
    category: item.category || 'uncategorized',
    tags: item.tags || [],
    source,
    icon: item.icon || `https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=32`,
    featured: item.featured || false,
    updatedAt: new Date().toISOString(),
    isAlive: true,
  };
}

export function loadCategories(): Category[] {
  return loadYamlFile('src/data/categories.yaml');
}

export function loadStaticResources(): Resource[] {
  const bookmarks = loadYamlFile('src/data/bookmarks.yaml')
    .map((item: any) => parseYamlResource(item, 'bookmark'));

  const localDocs = loadYamlFile('src/data/local-docs.yaml')
    .map((item: any) => parseYamlResource(item, 'markdown'));

  return [...bookmarks, ...localDocs];
}

export async function loadDynamicResources(): Promise<Resource[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .eq('is_alive', true)
    .order('updated_at', { ascending: false })
    .limit(2000);

  if (error || !data) return [];

  return data.map((row: any) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    description: row.description,
    category: row.category,
    tags: row.tags || [],
    source: row.source,
    icon: row.icon,
    featured: row.featured || false,
    updatedAt: row.updated_at,
    isAlive: row.is_alive,
  }));
}

export async function getAllResources(): Promise<Resource[]> {
  const staticRes = loadStaticResources();
  const dynamicRes = await loadDynamicResources();

  // Merge and deduplicate by URL
  const seen = new Set<string>();
  const all: Resource[] = [];

  for (const r of [...staticRes, ...dynamicRes]) {
    if (!seen.has(r.url)) {
      seen.add(r.url);
      all.push(r);
    }
  }

  // Sort: featured first, then by updatedAt
  return all.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}
